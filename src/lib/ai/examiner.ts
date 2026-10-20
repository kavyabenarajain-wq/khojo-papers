import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as s from "../db/schema";
import type { Db, Executor } from "../db/types";
import { checkFinalValue } from "../grading/deterministic";
import { checkMarking } from "../grading/invariants";
import { callStructured, type AiProvider } from "./provider";
import { MarkingSchema, RecognitionSchema, type Marking, type Recognition } from "./schemas";
import { RECOGNIZE_PROMPT_VERSION, RECOGNIZE_SYSTEM, recognizeUserText } from "./prompts/recognize";
import { MARK_PROMPT_VERSION, MARK_SYSTEM, markUserText } from "./prompts/mark";
import type { QuestionContent } from "../content/types";

export class ExaminerError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "not_evaluable" | "consent" | "state" = "state",
  ) {
    super(message);
  }
}

type Deps = { provider: AiProvider; db: Db };

export function questionPlainText(content: QuestionContent): string {
  return [content.instructions, content.passage, content.stem, content.table ? `Table: ${content.table.headers.join(" | ")}\n${content.table.rows.map((r) => r.join(" | ")).join("\n")}` : null, ...(content.options ?? []).map((o) => `(${o.key}) ${o.text}`)]
    .filter(Boolean)
    .join("\n\n");
}

async function assertConsent(db: Executor, userId: string) {
  const [p] = await db.select().from(s.profiles).where(eq(s.profiles.id, userId));
  if (!p || !["not_required", "granted"].includes(p.consentStatus)) {
    throw new ExaminerError("Your parent or guardian needs to confirm consent before the AI Examiner can be used.", "consent");
  }
}

/**
 * Stage 1: retrieve the exact question, rubric and model answer pinned to a response. The
 * rubric must have been approved by a reviewer; otherwise the answer is not marked.
 */
export async function loadMarkingContext(db: Executor, userId: string, responseId: string) {
  const [resp] = await db.select().from(s.responses).where(and(eq(s.responses.id, responseId), eq(s.responses.userId, userId)));
  if (!resp) throw new ExaminerError("Answer not found.", "not_found");
  const [rev] = await db.select().from(s.questionRevisions).where(eq(s.questionRevisions.id, resp.questionRevisionId));
  if (!resp.rubricRevisionId) throw new ExaminerError("This question doesn't have an approved marking rubric, so the AI Examiner can't mark it.", "not_evaluable");
  const [rubric] = await db.select().from(s.rubricRevisions).where(eq(s.rubricRevisions.id, resp.rubricRevisionId));
  if (!rubric || !["approved", "superseded"].includes(rubric.status)) {
    throw new ExaminerError("This question's marking rubric hasn't been approved by a reviewer, so it can't be used for marking.", "not_evaluable");
  }
  const criteria = await db.select().from(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, rubric.id)).orderBy(asc(s.rubricCriteria.position));
  const [solution] = await db
    .select()
    .from(s.solutionRevisions)
    .where(and(eq(s.solutionRevisions.questionRevisionId, rev.id), inArray(s.solutionRevisions.status, ["approved", "superseded"])))
    .orderBy(desc(s.solutionRevisions.revisionNumber))
    .limit(1);
  if (!solution) throw new ExaminerError("There's no approved model answer for this question yet.", "not_evaluable");
  if (criteria.reduce((a, c) => a + c.marksAvailable, 0) !== rev.marks) {
    throw new ExaminerError("The rubric's marks don't add up to the question's marks, so it can't be used.", "not_evaluable");
  }
  return { response: resp, revision: rev, rubric, criteria, solution };
}

/** Create a submitted examiner-mode response for a published question with an approved rubric. */
export async function createExaminerResponse(db: Db, userId: string, questionId: string, answerText: string | null): Promise<string> {
  return db.transaction(async (tx) => {
    await assertConsent(tx, userId);
    const [q] = await tx.select().from(s.questions).where(eq(s.questions.id, questionId));
    if (!q || q.publicationStatus !== "published" || !q.publishedRevisionId) throw new ExaminerError("Question not available.", "not_found");
    if (!q.publishedRubricId) throw new ExaminerError("This question doesn't have an approved marking rubric yet.", "not_evaluable");
    const now = new Date();
    const [a] = await tx.insert(s.attempts).values({ userId, mode: "examiner", status: "submitted", submittedAt: now }).returning();
    const [r] = await tx
      .insert(s.responses)
      .values({ attemptId: a.id, userId, questionId, questionRevisionId: q.publishedRevisionId, rubricRevisionId: q.publishedRubricId, answer: answerText ? { text: answerText } : {}, locked: true })
      .returning();
    return r.id;
  });
}

export async function attachUpload(db: Db, userId: string, responseId: string, uploadId: string) {
  // Responses are locked once submitted; the photo link is recorded on the transcript instead.
  const [r] = await db.select().from(s.responses).where(and(eq(s.responses.id, responseId), eq(s.responses.userId, userId)));
  const [u] = await db.select().from(s.uploads).where(and(eq(s.uploads.id, uploadId), eq(s.uploads.userId, userId)));
  if (!r || !u) throw new ExaminerError("Upload not found.", "not_found");
  return { response: r, upload: u };
}

/** Stage 2–3: read the handwriting. Unreadable pages are stored as such and never marked. */
export async function recognizeAnswer(deps: Deps, input: { userId: string; responseId: string; uploadId: string; imageDataUrl: string }) {
  await assertConsent(deps.db, input.userId);
  const ctx = await loadMarkingContext(deps.db, input.userId, input.responseId);
  const res = await callStructured<Recognition>(deps, {
    purpose: "recognize",
    promptVersion: RECOGNIZE_PROMPT_VERSION,
    system: RECOGNIZE_SYSTEM,
    content: [
      { type: "text", text: recognizeUserText(questionPlainText(ctx.revision.content), ctx.revision.marks) },
      { type: "image", dataUrl: input.imageDataUrl },
    ],
    schema: RecognitionSchema,
    schemaName: "handwriting_transcription",
    userId: input.userId,
    vision: true,
    maxOutputTokens: 3000,
    meta: { responseId: input.responseId, uploadId: input.uploadId, questionRevisionId: ctx.revision.id },
  });
  if (!res.ok) {
    const [t] = await deps.db
      .insert(s.transcripts)
      .values({ responseId: input.responseId, userId: input.userId, uploadId: input.uploadId, aiRunId: res.runId, status: "failed", notes: res.kind === "refused" ? "The AI service declined to read this image." : "Reading the handwriting failed." })
      .returning();
    return { transcript: t, recognition: null, error: res.error };
  }
  const r = res.data;
  const uncertain = r.segments.filter((x) => x.uncertain).length;
  const unreadable = r.legibility === "unreadable" || (r.legibility === "poor" && uncertain > Math.max(2, r.segments.length / 2)) || !r.transcript.trim();
  const [t] = await deps.db
    .insert(s.transcripts)
    .values({
      responseId: input.responseId,
      userId: input.userId,
      uploadId: input.uploadId,
      aiRunId: res.runId,
      status: unreadable ? "unreadable" : "ready",
      legibility: r.legibility,
      aiText: r.transcript,
      segments: r.segments.map((x) => ({ kind: x.kind, content: x.content, uncertain: x.uncertain, note: x.note ?? undefined })),
      notes: [r.relatesToQuestion === "no" ? "This page may not be an answer to this question." : null, r.containsPersonalInfo ? "Personal information was visible on the page and was left out of the transcript." : null, r.notes]
        .filter(Boolean)
        .join(" ") || null,
    })
    .returning();
  return { transcript: t, recognition: r, error: null };
}

export function editDistance(a: string, b: string): number {
  const x = a.slice(0, 4000);
  const y = b.slice(0, 4000);
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** The student checks and corrects the transcription before marking. */
export async function confirmTranscript(db: Executor, userId: string, transcriptId: string, text: string) {
  const [t] = await db.select().from(s.transcripts).where(and(eq(s.transcripts.id, transcriptId), eq(s.transcripts.userId, userId)));
  if (!t) throw new ExaminerError("Transcript not found.", "not_found");
  if (t.status !== "ready") throw new ExaminerError("This photo couldn't be read reliably. Please retake it.", "state");
  if (!text.trim()) throw new ExaminerError("The answer is empty.", "state");
  await db
    .update(s.transcripts)
    .set({ confirmedText: text.slice(0, 20000), confirmedAt: new Date(), editDistance: editDistance(t.aiText ?? "", text) })
    .where(eq(s.transcripts.id, transcriptId));
}

export type EvaluationOutcome = { evaluationId: string; status: "completed" | "needs_review" | "not_evaluable" | "failed" };

/** Stages 4–6: criterion-level marking with strict validation. Never stores an unchecked score. */
export async function evaluateResponse(deps: Deps, input: { userId: string; responseId: string }): Promise<EvaluationOutcome> {
  await assertConsent(deps.db, input.userId);
  const ctx = await loadMarkingContext(deps.db, input.userId, input.responseId);
  const [transcript] = await deps.db
    .select()
    .from(s.transcripts)
    .where(and(eq(s.transcripts.responseId, input.responseId), eq(s.transcripts.userId, input.userId)))
    .orderBy(desc(s.transcripts.createdAt))
    .limit(1);
  const typed = ctx.response.answer.text?.trim() || Object.values(ctx.response.answer.parts ?? {}).map((p, i) => (p.text || p.value || p.choice ? `(${Object.keys(ctx.response.answer.parts ?? {})[i]}) ${p.text ?? ""} ${p.value ?? ""} ${p.unit ?? ""} ${p.choice ?? ""}` : "")).filter(Boolean).join("\n");
  let studentAnswer: string;
  let source: "photo" | "typed";
  if (transcript) {
    if (!transcript.confirmedText) throw new ExaminerError("Please check the transcription of your photo first.", "state");
    studentAnswer = transcript.confirmedText;
    source = "photo";
  } else if (typed) {
    studentAnswer = typed;
    source = "typed";
  } else throw new ExaminerError("There's no answer to mark yet.", "state");

  const fv = checkFinalValue(ctx.revision.answerKey ?? null, { value: ctx.response.answer.value, unit: ctx.response.answer.unit });
  const res = await markAnswerText(deps, {
    purpose: "evaluate",
    userId: input.userId,
    revision: ctx.revision,
    criteria: ctx.criteria,
    solution: ctx.solution,
    studentAnswer,
    recognition: {
      source,
      legibility: transcript?.legibility ?? null,
      uncertainSegments: (transcript?.segments ?? []).filter((x) => x.uncertain).map((x) => x.content.slice(0, 80)),
      editedByStudent: Boolean(transcript && (transcript.editDistance ?? 0) > 0),
    },
    finalValueCheck: fv ? (fv.correct ? "The student's stated final value matches the verified answer." : `The student's stated final value does not match the verified answer (${fv.detail}).`) : null,
    meta: { responseId: input.responseId, rubricRevisionId: ctx.rubric.id, questionRevisionId: ctx.revision.id, solutionRevisionId: ctx.solution.id, source },
  });
  const rubricForCheck = ctx.criteria.map((c) => ({ key: c.criterionKey, marks: c.marksAvailable }));

  return deps.db.transaction(async (tx) => {
    if (!res.ok) {
      const [ev] = await tx
        .insert(s.evaluations)
        .values({
          responseId: input.responseId,
          userId: input.userId,
          method: "ai",
          status: "failed",
          awarded: null,
          maximum: ctx.revision.marks,
          rubricRevisionId: ctx.rubric.id,
          transcriptId: transcript?.id ?? null,
          aiRunId: res.runId,
          summary: { limitations: ["The AI Examiner couldn't produce a reliable evaluation, so no marks were given."] },
        })
        .returning();
      return { evaluationId: ev.id, status: "failed" as const };
    }
    const m = res.data;
    const report = checkMarking(m, rubricForCheck, studentAnswer);
    const notEvaluable = m.status === "cannot_evaluate";
    const needsReview = !notEvaluable && (m.status === "needs_review" || report.anyUncertain || m.humanReviewRecommended);
    const status = notEvaluable ? "not_evaluable" : needsReview ? "needs_review" : "completed";
    const [ev] = await tx
      .insert(s.evaluations)
      .values({
        responseId: input.responseId,
        userId: input.userId,
        method: "ai",
        status,
        awarded: notEvaluable ? null : report.total,
        maximum: ctx.revision.marks,
        isCorrect: null,
        rubricRevisionId: ctx.rubric.id,
        transcriptId: transcript?.id ?? null,
        aiRunId: res.runId,
        needsHumanReview: needsReview,
        summary: {
          correctElements: m.correctElements,
          missingOrIncorrect: m.missingOrIncorrect,
          corrections: m.corrections,
          revisionTopic: m.revisionTopic ?? undefined,
          limitations: [...m.limitations, ...(m.rubricProblem ? [`Rubric problem: ${m.rubricProblem}`] : [])],
          overallFeedback: m.overallFeedback,
          humanReviewReason: m.humanReviewReason ?? undefined,
        },
      })
      .returning();
    if (!notEvaluable) {
      await tx.insert(s.criterionScores).values(
        ctx.criteria.map((c) => {
          const sc = m.criteria.find((x) => x.key === c.criterionKey)!;
          return {
            evaluationId: ev.id,
            criterionId: c.id,
            criterionKey: c.criterionKey,
            marksAvailable: c.marksAvailable,
            marksAwarded: sc.marksAwarded,
            evidence: sc.evidence,
            reason: sc.reason,
            feedback: sc.feedback,
            alternativeMethod: sc.alternativeMethod,
            uncertain: sc.uncertain,
            mistakeCategory: sc.marksAwarded < c.marksAvailable ? sc.mistakeCategory : null,
          };
        }),
      );
    }
    if (needsReview) {
      await tx.insert(s.humanReviewRequests).values({ evaluationId: ev.id, userId: input.userId, source: "system", reason: m.humanReviewReason ?? "The AI Examiner was uncertain about part of this answer." });
    }
    if (notEvaluable && m.rubricProblem) {
      await tx.insert(s.issueReports).values({ questionId: ctx.response.questionId, userId: null, category: "marking", message: `AI Examiner reported a rubric problem (rubric revision ${ctx.rubric.revisionNumber}): ${m.rubricProblem}`.slice(0, 2000) });
    }
    return { evaluationId: ev.id, status };
  });
}

type MarkTextInput = {
  purpose: "evaluate" | "benchmark";
  userId: string | null;
  revision: typeof s.questionRevisions.$inferSelect;
  criteria: (typeof s.rubricCriteria.$inferSelect)[];
  solution: typeof s.solutionRevisions.$inferSelect;
  studentAnswer: string;
  recognition: { source: "photo" | "typed"; legibility: string | null; uncertainSegments: string[]; editedByStudent: boolean };
  finalValueCheck: string | null;
  meta: Record<string, unknown>;
};

/** The marking call shared by live evaluation and teacher benchmarks, so both test the same thing. */
export async function markAnswerText(deps: Deps, i: MarkTextInput) {
  const content = i.revision.content;
  const rubricForCheck = i.criteria.map((c) => ({ key: c.criterionKey, marks: c.marksAvailable }));
  return callStructured<Marking>(deps, {
    purpose: i.purpose,
    promptVersion: MARK_PROMPT_VERSION,
    system: MARK_SYSTEM,
    content: [
      {
        type: "text",
        text: markUserText({
          questionPlain: questionPlainText(content),
          parts: (content.parts ?? []).map((p) => ({ key: p.key, marks: p.marks, prompt: p.prompt })),
          maximum: i.revision.marks,
          modelAnswer: i.solution.modelAnswer,
          finalAnswer: i.solution.finalAnswer,
          rubric: i.criteria.map((c) => ({
            key: c.criterionKey,
            partKey: c.partKey,
            description: c.description,
            marks: c.marksAvailable,
            expectedEvidence: c.expectedEvidence,
            acceptedAlternatives: c.acceptedAlternatives,
            partialCreditRules: c.partialCreditRules,
            commonErrors: c.commonErrors,
          })),
          studentAnswer: i.studentAnswer,
          recognition: i.recognition,
          finalValueCheck: i.finalValueCheck,
        }),
      },
    ],
    schema: MarkingSchema,
    schemaName: "rubric_evaluation",
    userId: i.userId,
    maxOutputTokens: 4000,
    meta: i.meta,
    validate: (m) => checkMarking(m, rubricForCheck, i.studentAnswer).errors,
  });
}

/** Student asks a teacher to check an AI mark. */
export async function requestHumanReview(db: Executor, userId: string, evaluationId: string, reason: string) {
  const [ev] = await db.select().from(s.evaluations).where(and(eq(s.evaluations.id, evaluationId), eq(s.evaluations.userId, userId)));
  if (!ev || ev.method !== "ai") throw new ExaminerError("Evaluation not found.", "not_found");
  await db
    .insert(s.humanReviewRequests)
    .values({ evaluationId, userId, source: "student", reason: reason.slice(0, 1000) || null })
    .onConflictDoNothing();
}
