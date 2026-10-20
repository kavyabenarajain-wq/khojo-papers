import { and, desc, eq } from "drizzle-orm";
import * as s from "../db/schema";
import type { Db, Executor, Tx } from "../db/types";
import { gradeDeterministic, checkFinalValue, type DeterministicResult, type PartResult } from "../grading/deterministic";
import type { Answer } from "../content/types";
import { AnswerSchema } from "../content/types";

export class PracticeError extends Error {}

type PublishedQuestion = {
  id: string;
  revisionId: string;
  rubricId: string | null;
  solutionId: string | null;
};

async function publishedQuestion(db: Executor, questionId: string): Promise<PublishedQuestion> {
  const [q] = await db.select().from(s.questions).where(eq(s.questions.id, questionId)).limit(1);
  if (!q || q.publicationStatus !== "published" || !q.publishedRevisionId) {
    throw new PracticeError("This question isn't available for saved practice.");
  }
  return { id: q.id, revisionId: q.publishedRevisionId, rubricId: q.publishedRubricId, solutionId: q.publishedSolutionId };
}

export function parseAnswer(raw: unknown): Answer {
  const parsed = AnswerSchema.safeParse(raw);
  if (!parsed.success) throw new PracticeError("That answer couldn't be read. Please try again.");
  return parsed.data;
}

/**
 * Autosave a practice draft. Runs as the student (RLS): the response is created on first save
 * and pinned to the question and rubric revisions published at that moment.
 */
export async function saveDraft(tx: Tx, userId: string, questionId: string, answer: Answer): Promise<{ responseId: string; savedAt: Date }> {
  const q = await publishedQuestion(tx, questionId);
  const [existing] = await tx
    .select({ id: s.responses.id })
    .from(s.responses)
    .innerJoin(s.attempts, eq(s.attempts.id, s.responses.attemptId))
    .where(and(eq(s.responses.userId, userId), eq(s.responses.questionId, questionId), eq(s.attempts.status, "in_progress"), eq(s.attempts.mode, "practice")))
    .orderBy(desc(s.responses.updatedAt))
    .limit(1);
  const now = new Date();
  if (existing) {
    await tx.update(s.responses).set({ answer, updatedAt: now }).where(eq(s.responses.id, existing.id));
    return { responseId: existing.id, savedAt: now };
  }
  const [attempt] = await tx.insert(s.attempts).values({ userId, mode: "practice" }).returning();
  const [resp] = await tx
    .insert(s.responses)
    .values({ attemptId: attempt.id, userId, questionId, questionRevisionId: q.revisionId, rubricRevisionId: q.rubricId, answer })
    .returning();
  return { responseId: resp.id, savedAt: now };
}

export type SubmitResult = {
  responseId: string;
  evaluationId: string | null;
  deterministic: DeterministicResult | null;
  finalValueCheck: PartResult | null;
  needsRubricMarking: boolean;
};

/**
 * Submit a practice answer. System write (owner connection) with explicit ownership checks,
 * because deterministic evaluations are recorded by the system, never by the student.
 */
export async function submitPractice(db: Db, userId: string, questionId: string, answer: Answer): Promise<SubmitResult> {
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(s.profiles).where(eq(s.profiles.id, userId));
    if (!profile || !["not_required", "granted"].includes(profile.consentStatus)) {
      throw new PracticeError("Your parent or guardian needs to confirm consent before answers can be saved.");
    }
    const q = await publishedQuestion(tx, questionId);
    const [rev] = await tx.select().from(s.questionRevisions).where(eq(s.questionRevisions.id, q.revisionId));

    // Reuse the in-progress draft (keeping its pinned revisions) or start a fresh attempt.
    const [draft] = await tx
      .select({ responseId: s.responses.id, attemptId: s.attempts.id, revisionId: s.responses.questionRevisionId })
      .from(s.responses)
      .innerJoin(s.attempts, eq(s.attempts.id, s.responses.attemptId))
      .where(and(eq(s.responses.userId, userId), eq(s.responses.questionId, questionId), eq(s.attempts.status, "in_progress"), eq(s.attempts.mode, "practice")))
      .orderBy(desc(s.responses.updatedAt))
      .limit(1);

    let responseId: string;
    let attemptId: string;
    let revision = rev;
    const now = new Date();
    if (draft) {
      responseId = draft.responseId;
      attemptId = draft.attemptId;
      if (draft.revisionId !== rev.id) {
        [revision] = await tx.select().from(s.questionRevisions).where(eq(s.questionRevisions.id, draft.revisionId));
      }
      await tx.update(s.responses).set({ answer, locked: true, updatedAt: now }).where(eq(s.responses.id, responseId));
    } else {
      const [attempt] = await tx.insert(s.attempts).values({ userId, mode: "practice" }).returning();
      attemptId = attempt.id;
      const [resp] = await tx
        .insert(s.responses)
        .values({ attemptId, userId, questionId, questionRevisionId: rev.id, rubricRevisionId: q.rubricId, answer, locked: true })
        .returning();
      responseId = resp.id;
    }
    await tx.update(s.attempts).set({ status: "submitted", submittedAt: now, updatedAt: now }).where(eq(s.attempts.id, attemptId));

    const det = gradeDeterministic({
      format: revision.answerFormat,
      marks: revision.marks,
      content: revision.content,
      answerKey: revision.answerKey ?? null,
      answer,
    });
    let evaluationId: string | null = null;
    if (det?.complete) {
      const [ev] = await tx
        .insert(s.evaluations)
        .values({
          responseId,
          userId,
          method: "deterministic",
          status: "completed",
          awarded: det.awarded,
          maximum: det.maximum,
          isCorrect: det.awarded === det.maximum,
          summary: { overallFeedback: det.parts.map((p) => (p.partKey ? `(${p.partKey}) ${p.detail}` : p.detail)).join(" ") },
        })
        .returning();
      evaluationId = ev.id;
      await tx.insert(s.criterionScores).values(
        det.parts.map((p) => ({
          evaluationId: ev.id,
          criterionKey: p.partKey ? `part-${p.partKey}` : "answer",
          marksAvailable: p.marksAvailable,
          marksAwarded: p.marksAwarded,
          reason: p.detail,
          mistakeCategory: p.correct ? null : p.unitIssue ? "units" : "incorrect_answer",
        })),
      );
    }
    return {
      responseId,
      evaluationId,
      deterministic: det,
      finalValueCheck: det ? null : checkFinalValue(revision.answerKey ?? null, answer),
      needsRubricMarking: !det?.complete,
    };
  });
}

/** Check an answer without saving anything (signed-out visitors). */
export async function checkWithoutSaving(db: Executor, questionId: string, answer: Answer) {
  const q = await publishedQuestion(db, questionId);
  const [rev] = await db.select().from(s.questionRevisions).where(eq(s.questionRevisions.id, q.revisionId));
  const det = gradeDeterministic({ format: rev.answerFormat, marks: rev.marks, content: rev.content, answerKey: rev.answerKey ?? null, answer });
  return { deterministic: det, finalValueCheck: det ? null : checkFinalValue(rev.answerKey ?? null, answer) };
}

export async function recordReveal(tx: Tx, userId: string, questionId: string, solutionRevisionId: string) {
  const [submitted] = await tx
    .select({ id: s.responses.id })
    .from(s.responses)
    .innerJoin(s.attempts, eq(s.attempts.id, s.responses.attemptId))
    .where(and(eq(s.responses.userId, userId), eq(s.responses.questionId, questionId), eq(s.attempts.status, "submitted")))
    .limit(1);
  await tx.insert(s.solutionReveals).values({ userId, questionId, solutionRevisionId, beforeAttempt: !submitted });
}

export async function toggleBookmark(tx: Tx, userId: string, questionId: string): Promise<boolean> {
  const del = await tx
    .delete(s.bookmarks)
    .where(and(eq(s.bookmarks.userId, userId), eq(s.bookmarks.questionId, questionId)))
    .returning();
  if (del.length) return false;
  await tx.insert(s.bookmarks).values({ userId, questionId });
  return true;
}

/**
 * Self-assessment against the rubric pinned to the response. Runs as the student; RLS only
 * allows method 'self' for their own response. Recorded and shown as self-assessed, never as
 * a verified mark.
 */
export async function recordSelfAssessment(tx: Tx, userId: string, responseId: string, marks: Record<string, number>) {
  const [resp] = await tx.select().from(s.responses).where(and(eq(s.responses.id, responseId), eq(s.responses.userId, userId)));
  if (!resp) throw new PracticeError("Answer not found.");
  if (!resp.locked) throw new PracticeError("Submit your answer before marking it.");
  if (!resp.rubricRevisionId) throw new PracticeError("This question has no rubric to mark against.");
  const criteria = await tx.select().from(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, resp.rubricRevisionId));
  const [rubric] = await tx.select().from(s.rubricRevisions).where(eq(s.rubricRevisions.id, resp.rubricRevisionId));
  let total = 0;
  const scores = criteria.map((c) => {
    const v = marks[c.criterionKey];
    if (v === undefined || !Number.isFinite(v)) throw new PracticeError(`Choose a mark for every criterion.`);
    const clamped = Math.round(Math.min(Math.max(v, 0), c.marksAvailable) * 2) / 2;
    total += clamped;
    return { c, awarded: clamped };
  });
  const [ev] = await tx
    .insert(s.evaluations)
    .values({
      responseId,
      userId,
      method: "self",
      status: "completed",
      awarded: total,
      maximum: rubric.totalMarks,
      rubricRevisionId: rubric.id,
      evaluatorId: userId,
      summary: { overallFeedback: "Self-assessed against the rubric." },
    })
    .returning();
  await tx.insert(s.criterionScores).values(
    scores.map(({ c, awarded }) => ({
      evaluationId: ev.id,
      criterionId: c.id,
      criterionKey: c.criterionKey,
      marksAvailable: c.marksAvailable,
      marksAwarded: awarded,
      reason: "Self-assessed",
    })),
  );
  return { evaluationId: ev.id, awarded: total, maximum: rubric.totalMarks };
}

export async function reportIssue(
  db: Executor,
  input: { questionId: string; userId: string | null; category: (typeof s.issueReports.category.enumValues)[number]; message: string },
) {
  const [q] = await db.select({ id: s.questions.id }).from(s.questions).where(eq(s.questions.id, input.questionId));
  if (!q) throw new PracticeError("Question not found.");
  await db.insert(s.issueReports).values({
    questionId: input.questionId,
    userId: input.userId,
    category: input.category,
    message: input.message.slice(0, 2000),
  });
}
