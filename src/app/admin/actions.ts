"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { runAs } from "@/lib/db/rls";
import * as s from "@/lib/db/schema";
import { AuthError, viewerOrThrow, STAFF_ROLES } from "@/lib/auth/rbac";
import { PREVIEW_COOKIE } from "@/lib/preview";
import { audit } from "@/lib/audit";
import { decideRevision, publishPaper, publishQuestion, ReviewError, setPermissionStatus, submitForReview, unpublishPaper, unpublishQuestion, type RevisionKind } from "@/lib/dal/review";
import { createQuestion, EditorError, NewQuestionSchema, QuestionDraftSchema, RubricDraftSchema, saveQuestionDraft, saveRubricDraft, saveSolutionDraft, setQuestionTopics, SolutionDraftSchema } from "@/lib/dal/editor";
import { renderRichText, validateRichText } from "@/lib/content/richtext";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  if (e instanceof ReviewError || e instanceof EditorError || e instanceof AuthError) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  // Database guard errors (triggers, RLS) carry their message in the cause.
  let cur: unknown = e;
  while (cur instanceof Error) {
    const msg = cur.message;
    if (/cannot|must|only|requires|needs|permission|add up|total/i.test(msg) && !/^Failed query/.test(msg)) return { ok: false, error: msg };
    cur = (cur as Error & { cause?: unknown }).cause;
  }
  console.error(e);
  return { ok: false, error: "That didn't work. Nothing was changed." };
}

async function staff(roles?: (typeof STAFF_ROLES)[number][]) {
  const v = await viewerOrThrow({ roles: roles ?? STAFF_ROLES });
  return { v, actor: { id: v.id, roles: v.roles as string[] } };
}

const Id = z.string().uuid();
const Kind = z.enum(["question", "solution", "rubric"]);

export async function decideAction(kind: RevisionKind, id: string, decision: "approved" | "changes_requested" | "rejected", comments: string): Promise<ActionResult> {
  try {
    Kind.parse(kind);
    Id.parse(id);
    const { v, actor } = await staff(["teacher_reviewer", "admin"]);
    await runAs(getDb(), v.id, (tx) => decideRevision(tx, actor, kind, id, decision, comments.trim() || null));
    revalidatePath("/admin", "layout");
    return { ok: true, message: decision === "approved" ? "Approved." : decision === "rejected" ? "Rejected." : "Returned to the editor." };
  } catch (e) {
    return fail(e);
  }
}

export async function submitForReviewAction(kind: RevisionKind, id: string): Promise<ActionResult> {
  try {
    Kind.parse(kind);
    Id.parse(id);
    const { v, actor } = await staff(["content_editor", "admin"]);
    await runAs(getDb(), v.id, (tx) => submitForReview(tx, actor, kind, id));
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Sent for review." };
  } catch (e) {
    return fail(e);
  }
}

export async function publishAction(questionId: string): Promise<ActionResult> {
  try {
    Id.parse(questionId);
    const { v, actor } = await staff(["teacher_reviewer", "admin"]);
    const r = await runAs(getDb(), v.id, (tx) => publishQuestion(tx, actor, questionId));
    revalidatePath("/", "layout");
    return { ok: true, message: `Published revision ${r.revision}${r.hasRubric ? " with its rubric" : " (no approved rubric, so AI marking is off)"}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function unpublishAction(questionId: string, reason: string): Promise<ActionResult> {
  try {
    Id.parse(questionId);
    const { v, actor } = await staff(["teacher_reviewer", "admin"]);
    await runAs(getDb(), v.id, (tx) => unpublishQuestion(tx, actor, questionId, reason));
    revalidatePath("/", "layout");
    return { ok: true, message: "Unpublished. Students can no longer see it." };
  } catch (e) {
    return fail(e);
  }
}

export async function setPermissionAction(questionId: string, status: string, note: string): Promise<ActionResult> {
  try {
    Id.parse(questionId);
    const st = z.enum(["unknown", "reference_only", "licensed", "own_content", "restricted"]).parse(status);
    if (note.trim().length < 3) return { ok: false, error: "Add a note explaining the rights decision." };
    const { v, actor } = await staff();
    await runAs(getDb(), v.id, (tx) => setPermissionStatus(tx, actor, questionId, st, note.trim()));
    revalidatePath("/", "layout");
    return { ok: true, message: "Permission status updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveQuestionAction(questionId: string, payload: unknown): Promise<ActionResult> {
  try {
    Id.parse(questionId);
    const draft = QuestionDraftSchema.parse(payload);
    const { v, actor } = await staff(["content_editor", "admin"]);
    const id = await runAs(getDb(), v.id, (tx) => saveQuestionDraft(tx, actor, questionId, draft));
    revalidatePath(`/admin/questions/${questionId}`);
    return { ok: true, id, message: "Draft saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSolutionAction(questionId: string, payload: unknown): Promise<ActionResult> {
  try {
    Id.parse(questionId);
    const draft = SolutionDraftSchema.parse(payload);
    const { v, actor } = await staff(["content_editor", "admin"]);
    const id = await runAs(getDb(), v.id, (tx) => saveSolutionDraft(tx, actor, questionId, draft));
    revalidatePath(`/admin/questions/${questionId}`);
    return { ok: true, id, message: "Solution draft saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveRubricAction(questionId: string, payload: unknown): Promise<ActionResult> {
  try {
    Id.parse(questionId);
    const draft = RubricDraftSchema.parse(payload);
    const { v, actor } = await staff(["content_editor", "admin"]);
    const id = await runAs(getDb(), v.id, (tx) => saveRubricDraft(tx, actor, questionId, draft));
    revalidatePath(`/admin/questions/${questionId}`);
    return { ok: true, id, message: "Rubric draft saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function setTopicsAction(questionId: string, chapterId: string, topicIds: string[]): Promise<ActionResult> {
  try {
    Id.parse(questionId);
    Id.parse(chapterId);
    z.array(Id).parse(topicIds);
    const { v, actor } = await staff();
    await runAs(getDb(), v.id, (tx) => setQuestionTopics(tx, actor, questionId, chapterId, topicIds));
    revalidatePath(`/admin/questions/${questionId}`);
    return { ok: true, message: "Topics saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function createQuestionAction(meta: unknown, draft: unknown): Promise<ActionResult> {
  let id: string;
  try {
    const m = NewQuestionSchema.parse(meta);
    const d = QuestionDraftSchema.parse(draft);
    const { v, actor } = await staff(["content_editor", "admin"]);
    ({ questionId: id } = await runAs(getDb(), v.id, (tx) => createQuestion(tx, actor, m, d)));
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin/questions/${id}`);
}

/** Render rich text for editor previews (server-side KaTeX). */
export async function previewRichTextAction(source: string): Promise<{ html: string; issues: string[] }> {
  await staff();
  const text = source.slice(0, 20000);
  return { html: renderRichText(text), issues: validateRichText(text).map((i) => (i.excerpt ? `${i.message} — ${i.excerpt}` : i.message)) };
}

export async function publishPaperAction(paperId: string, publish: boolean): Promise<ActionResult> {
  try {
    Id.parse(paperId);
    const { v, actor } = await staff(["teacher_reviewer", "admin"]);
    await runAs(getDb(), v.id, (tx) => (publish ? publishPaper(tx, actor, paperId) : unpublishPaper(tx, actor, paperId)));
    revalidatePath("/", "layout");
    return { ok: true, message: publish ? "Paper published." : "Paper unpublished." };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveReportAction(reportId: string, status: "resolved" | "dismissed", note: string): Promise<ActionResult> {
  try {
    Id.parse(reportId);
    const { v } = await staff();
    await runAs(getDb(), v.id, async (tx) => {
      await tx.update(s.issueReports).set({ status, resolutionNote: note.trim() || null, resolvedBy: v.id, resolvedAt: new Date() }).where(eq(s.issueReports.id, reportId));
      await audit(tx, { actorId: v.id, action: `issue_report.${status}`, entityType: "issue_report", entityId: reportId, details: { note } });
    });
    revalidatePath("/admin/reports");
    return { ok: true, message: status === "resolved" ? "Marked resolved." : "Dismissed." };
  } catch (e) {
    return fail(e);
  }
}

export async function setRolesAction(userId: string, roles: string[]): Promise<ActionResult> {
  try {
    Id.parse(userId);
    const r = z.array(z.enum(["student", "teacher_reviewer", "content_editor", "admin"])).min(1).parse(Array.from(new Set(["student", ...roles])));
    const { v } = await staff(["admin"]);
    await runAs(getDb(), v.id, (tx) => tx.execute(sql`select app.set_roles(${userId}::uuid, ${`{${r.join(",")}}`}::text[])`));
    revalidatePath("/admin/users");
    return { ok: true, message: "Roles updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function verifyTopicAction(topicId: string, status: "verified" | "unverified" | "disputed", sourcePage: string): Promise<ActionResult> {
  try {
    Id.parse(topicId);
    const { v } = await staff(["teacher_reviewer", "admin"]);
    await runAs(getDb(), v.id, async (tx) => {
      await tx.update(s.syllabusTopics).set({ verificationStatus: status, sourcePage: sourcePage.trim() || null }).where(eq(s.syllabusTopics.id, topicId));
      await tx.insert(s.contentReviews).values({ contentType: "syllabus_topic", contentId: topicId, reviewerId: v.id, reviewType: "academic", decision: status === "verified" ? "approved" : "changes_requested", comments: sourcePage ? `Source page ${sourcePage}` : null });
      await audit(tx, { actorId: v.id, action: `syllabus_topic.${status}`, entityType: "syllabus_topic", entityId: topicId, details: { sourcePage } });
    });
    revalidatePath("/admin/syllabus");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function setPreviewAction(on: boolean) {
  await staff();
  const jar = await cookies();
  if (on) jar.set(PREVIEW_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
  else jar.delete(PREVIEW_COOKIE);
  revalidatePath("/", "layout");
}

/** Teacher marks a student response that was sent for human review. */
export async function teacherMarkAction(reviewRequestId: string, marks: Record<string, number>, feedback: string): Promise<ActionResult> {
  try {
    Id.parse(reviewRequestId);
    z.record(z.string(), z.number().min(0).max(20)).parse(marks);
    const { v } = await staff(["teacher_reviewer", "admin"]);
    await runAs(getDb(), v.id, async (tx) => {
      const [req] = await tx.select().from(s.humanReviewRequests).where(eq(s.humanReviewRequests.id, reviewRequestId));
      if (!req || req.status !== "open") throw new ReviewError("This review has already been completed.");
      const [aiEval] = await tx.select().from(s.evaluations).where(eq(s.evaluations.id, req.evaluationId));
      const [resp] = await tx.select().from(s.responses).where(eq(s.responses.id, aiEval.responseId));
      if (!resp.rubricRevisionId) throw new ReviewError("No rubric pinned to this answer.");
      const criteria = await tx.select().from(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, resp.rubricRevisionId));
      let total = 0;
      const scores = criteria.map((c) => {
        const m = marks[c.criterionKey];
        if (m === undefined) throw new ReviewError(`Give a mark for "${c.description}".`);
        if (m > c.marksAvailable || Math.round(m * 2) !== m * 2) throw new ReviewError(`Invalid mark for "${c.description}".`);
        total += m;
        return { c, m };
      });
      const [ev] = await tx
        .insert(s.evaluations)
        .values({ responseId: resp.id, userId: resp.userId, method: "teacher", status: "completed", awarded: total, maximum: aiEval.maximum, rubricRevisionId: resp.rubricRevisionId, evaluatorId: v.id, summary: { overallFeedback: feedback.trim() || "Reviewed by a teacher." } })
        .returning();
      await tx.insert(s.criterionScores).values(scores.map(({ c, m }) => ({ evaluationId: ev.id, criterionId: c.id, criterionKey: c.criterionKey, marksAvailable: c.marksAvailable, marksAwarded: m, reason: "Teacher mark" })));
      await tx.update(s.humanReviewRequests).set({ status: "resolved", resolvedBy: v.id, resolvedAt: new Date(), teacherEvaluationId: ev.id }).where(eq(s.humanReviewRequests.id, req.id));
      await audit(tx, { actorId: v.id, action: "evaluation.teacher_marked", entityType: "evaluation", entityId: ev.id, details: { ai: aiEval.awarded, teacher: total, request: req.id } });
    });
    revalidatePath("/admin/disagreements");
    return { ok: true, message: "Teacher mark saved. The student will see it alongside the AI estimate." };
  } catch (e) {
    return fail(e);
  }
}

export async function addBenchmarkAction(input: unknown): Promise<ActionResult> {
  try {
    const d = z
      .object({
        questionId: Id,
        category: z.enum(["correct", "partially_correct", "incorrect", "alternative_method", "equivalent_wording", "misconception", "illegible", "ambiguous_notation", "crossed_out", "diagram", "incomplete_rubric"]),
        answerText: z.string().trim().min(1).max(20000),
        teacherCriteria: z.record(z.string(), z.number().min(0).max(20)),
        expectNeedsReview: z.boolean(),
        markerName: z.string().trim().min(2, "Record who marked it."),
        notes: z.string().nullable(),
      })
      .parse(input);
    const { v } = await staff(["teacher_reviewer", "admin"]);
    await runAs(getDb(), v.id, async (tx) => {
      const [q] = await tx.select().from(s.questions).where(eq(s.questions.id, d.questionId));
      if (!q?.publishedRubricId) throw new ReviewError("Benchmarks need a question with a published, approved rubric.");
      const criteria = await tx.select().from(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, q.publishedRubricId));
      for (const c of criteria) {
        const m = d.teacherCriteria[c.criterionKey];
        if (m === undefined || m > c.marksAvailable) throw new ReviewError(`Enter a valid teacher mark for "${c.description}".`);
      }
      const total = criteria.reduce((a, c) => a + d.teacherCriteria[c.criterionKey], 0);
      await tx.insert(s.examinerBenchmarks).values({
        questionId: d.questionId,
        rubricRevisionId: q.publishedRubricId,
        category: d.category,
        answerText: d.answerText,
        teacherTotal: total,
        teacherCriteria: d.teacherCriteria,
        expectNeedsReview: d.expectNeedsReview,
        markedBy: v.id,
        markerName: d.markerName,
        notes: d.notes,
      });
    });
    revalidatePath("/admin/benchmarks");
    return { ok: true, message: "Benchmark item added." };
  } catch (e) {
    return fail(e);
  }
}

export async function runBenchmarkAction(): Promise<ActionResult> {
  try {
    const { v } = await staff(["teacher_reviewer", "admin"]);
    const { integrations } = await import("@/lib/env");
    if (!integrations.ai) return { ok: false, error: "The AI service isn't configured on this server." };
    const { azureProvider } = await import("@/lib/ai/azure");
    const { runBenchmark } = await import("@/lib/ai/benchmark");
    const { metrics } = await runBenchmark({ provider: azureProvider, db: getDb() }, v.id);
    revalidatePath("/admin/benchmarks");
    return { ok: true, message: `Run complete: ${metrics.items} items, ${metrics.totals.exact} exact totals.` };
  } catch (e) {
    return fail(e);
  }
}

export async function createFromCandidateAction(candidateId: string, input: { code: string; chapterId: string; marks: number; answerFormat: string; stem: string }): Promise<ActionResult> {
  let questionId: string;
  try {
    Id.parse(candidateId);
    const { v, actor } = await staff(["content_editor", "admin"]);
    questionId = await runAs(getDb(), v.id, async (tx) => {
      const [c] = await tx.select().from(s.extractionCandidates).where(eq(s.extractionCandidates.id, candidateId));
      if (!c || c.status !== "pending") throw new ReviewError("This candidate has already been handled.");
      const [job] = await tx.select().from(s.ingestionJobs).where(eq(s.ingestionJobs.id, c.jobId));
      const [doc] = await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.id, job.sourceDocumentId));
      const sourceType = doc.documentType === "board_paper" ? "official_pyq" : doc.documentType === "specimen_paper" ? "official_specimen" : null;
      if (!sourceType) throw new ReviewError("Only board and specimen papers can be imported as official questions.");
      const { questionId } = await createQuestion(
        tx,
        actor,
        {
          code: input.code.trim().toUpperCase(),
          chapterId: input.chapterId,
          sourceType,
          sourceDocumentId: doc.id,
          sourcePage: String(c.pageNumber),
          sourceQuestionNumber: c.questionNumber,
          examYear: doc.examinationYear,
          permissionStatus: doc.permissionStatus,
        },
        {
          answerFormat: z.enum(["mcq", "short_answer", "long_answer", "numerical", "math_working", "structured", "diagram", "map", "passage"]).parse(input.answerFormat),
          marks: input.marks,
          difficulty: null,
          content: { stem: input.stem },
          answerKey: null,
          hints: [],
          changeNote: `Imported from ${doc.title}, page ${c.pageNumber}${c.questionNumber ? `, question ${c.questionNumber}` : ""}`,
        },
        { method: "pdf_extraction", createdAt: new Date().toISOString(), note: `Extracted from page ${c.pageNumber} (confidence ${c.confidence}). Check the transcription against the original page.`, flags: c.flags },
      );
      await tx.update(s.extractionCandidates).set({ status: "accepted", questionId }).where(eq(s.extractionCandidates.id, c.id));
      return questionId;
    });
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin/questions/${questionId}`);
}

export async function discardCandidateAction(candidateId: string): Promise<ActionResult> {
  try {
    Id.parse(candidateId);
    const { v } = await staff(["content_editor", "admin"]);
    await runAs(getDb(), v.id, (tx) => tx.update(s.extractionCandidates).set({ status: "discarded" }).where(eq(s.extractionCandidates.id, candidateId)));
    revalidatePath("/admin/sources");
    return { ok: true, message: "Discarded." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSourceAction(id: string, input: { verificationStatus: string; permissionStatus: string; permissionNotes: string; knownLimitations: string; sourceUrl: string; retrievalDate: string }): Promise<ActionResult> {
  try {
    Id.parse(id);
    const d = z
      .object({
        verificationStatus: z.enum(["unverified", "verified", "disputed"]),
        permissionStatus: z.enum(["unknown", "reference_only", "licensed", "own_content", "restricted"]),
        permissionNotes: z.string().max(2000),
        knownLimitations: z.string().max(2000),
        sourceUrl: z.union([z.url(), z.literal("")]),
        retrievalDate: z.union([z.iso.date(), z.literal("")]),
      })
      .parse(input);
    const { v } = await staff();
    await runAs(getDb(), v.id, async (tx) => {
      await tx
        .update(s.sourceDocuments)
        .set({ verificationStatus: d.verificationStatus, permissionStatus: d.permissionStatus, permissionNotes: d.permissionNotes || null, knownLimitations: d.knownLimitations || null, sourceUrl: d.sourceUrl || null, retrievalDate: d.retrievalDate || null, updatedAt: new Date() })
        .where(eq(s.sourceDocuments.id, id));
      await audit(tx, { actorId: v.id, action: "source_document.updated", entityType: "source_document", entityId: id, details: d });
    });
    revalidatePath(`/admin/sources/${id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function generateQuestionAction(input: unknown): Promise<ActionResult> {
  let questionId: string;
  try {
    const d = z
      .object({
        code: z.string().trim().regex(/^[A-Z0-9-]{4,24}$/, "Use capitals, digits and dashes."),
        chapterId: Id,
        topicId: Id.nullable(),
        learningObjective: z.string().trim().min(10, "Describe the learning objective.").max(500),
        difficulty: z.enum(["easy", "medium", "hard"]),
        marks: z.number().int().min(1).max(12),
        answerFormat: z.enum(["mcq", "numerical", "math_working", "structured", "short_answer"]),
        referenceNotes: z.string().max(3000).nullable(),
      })
      .parse(input);
    const { v, actor } = await staff(["content_editor", "admin"]);
    const { integrations, env } = await import("@/lib/env");
    if (!integrations.ai) return { ok: false, error: "The AI service isn't configured on this server." };
    const { rateLimit } = await import("@/lib/rate-limit");
    const limit = await rateLimit(getDb(), `generate:${v.id}`, Math.max(20, env.AI_DAILY_LIMIT_PER_USER), 86400);
    if (!limit.ok) return { ok: false, error: "Daily generation limit reached." };
    const [exists] = await getDb().select({ id: s.questions.id }).from(s.questions).where(eq(s.questions.code, d.code));
    if (exists) return { ok: false, error: "That code is already used." };
    const { azureProvider } = await import("@/lib/ai/azure");
    const { generateQuestion } = await import("@/lib/ai/generate");
    const r = await generateQuestion({ provider: azureProvider, db: getDb() }, actor, { ...d, marks: d.answerFormat === "mcq" ? 1 : d.marks }, d.code);
    if (!r.ok) return { ok: false, error: `The draft failed automatic checks and was not saved: ${r.problems.slice(0, 3).join("; ") || r.error}` };
    questionId = r.questionId;
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin/questions/${questionId}`);
}
