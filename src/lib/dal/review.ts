import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import * as s from "../db/schema";
import type { Tx } from "../db/types";
import { audit } from "../audit";
import { checkQuestion, questionSearchText, type CheckIssue } from "../content/checks";
import type { Rubric } from "../content/types";

/**
 * Academic review workflow. Every function runs inside `runAs(actor)`, so Postgres RLS and the
 * revision triggers enforce roles and immutability; the checks here give clear errors first.
 */

export type RevisionKind = "question" | "solution" | "rubric";
export type Actor = { id: string; roles: string[] };

export class ReviewError extends Error {}

const tables = {
  question: s.questionRevisions,
  solution: s.solutionRevisions,
  rubric: s.rubricRevisions,
} as const;

const contentType = {
  question: "question_revision",
  solution: "solution_revision",
  rubric: "rubric_revision",
} as const;

const canReview = (a: Actor) => a.roles.includes("teacher_reviewer") || a.roles.includes("admin");
const canEdit = (a: Actor) => a.roles.includes("content_editor") || a.roles.includes("admin");

async function loadRevision(tx: Tx, kind: RevisionKind, id: string) {
  const t = tables[kind];
  const [row] = await tx.select().from(t).where(eq(t.id, id)).limit(1);
  if (!row) throw new ReviewError("Revision not found.");
  return row;
}

/** Automated checks for a question revision together with its latest solution and rubric drafts. */
export async function runChecksForQuestionRevision(tx: Tx, questionRevisionId: string): Promise<CheckIssue[]> {
  const [rev] = await tx.select().from(s.questionRevisions).where(eq(s.questionRevisions.id, questionRevisionId));
  if (!rev) throw new ReviewError("Question revision not found.");
  const [sol] = await tx
    .select()
    .from(s.solutionRevisions)
    .where(and(eq(s.solutionRevisions.questionRevisionId, rev.id), ne(s.solutionRevisions.status, "rejected")))
    .orderBy(desc(s.solutionRevisions.revisionNumber))
    .limit(1);
  const [rub] = await tx
    .select()
    .from(s.rubricRevisions)
    .where(and(eq(s.rubricRevisions.questionRevisionId, rev.id), ne(s.rubricRevisions.status, "rejected")))
    .orderBy(desc(s.rubricRevisions.revisionNumber))
    .limit(1);
  const criteria = rub
    ? await tx.select().from(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, rub.id)).orderBy(asc(s.rubricCriteria.position))
    : [];
  const rubric: Rubric | null = rub
    ? {
        notes: rub.notes ?? undefined,
        criteria: criteria.map((c) => ({
          key: c.criterionKey,
          partKey: c.partKey ?? undefined,
          description: c.description,
          marks: c.marksAvailable,
          expectedEvidence: c.expectedEvidence,
          acceptedAlternatives: c.acceptedAlternatives,
          partialCreditRules: c.partialCreditRules ?? undefined,
          commonErrors: c.commonErrors,
        })),
      }
    : null;
  const issues = checkQuestion({
    answerFormat: rev.answerFormat,
    marks: rev.marks,
    content: rev.content,
    answerKey: rev.answerKey ?? null,
    hints: rev.hints,
    solution: sol
      ? { modelAnswer: sol.modelAnswer, finalAnswer: sol.finalAnswer, steps: sol.steps, commonMistakes: sol.commonMistakes, alternativeMethods: sol.alternativeMethods }
      : { modelAnswer: "-", finalAnswer: "-", steps: [{ n: 1, explanation: "-", isFinal: true }], commonMistakes: [], alternativeMethods: [] },
    rubric,
  });
  if (!sol) issues.unshift({ level: "error", field: "solution", message: "No solution has been written for this revision." });
  return issues;
}

export async function submitForReview(tx: Tx, actor: Actor, kind: RevisionKind, id: string) {
  if (!canEdit(actor)) throw new ReviewError("Only content editors can submit content for review.");
  const rev = await loadRevision(tx, kind, id);
  if (rev.status !== "draft") throw new ReviewError(`This revision is ${rev.status.replace("_", " ")}, not a draft.`);
  if (kind === "question") {
    const errors = (await runChecksForQuestionRevision(tx, id)).filter((i) => i.level === "error" && i.field !== "solution" && !i.field.startsWith("rubric"));
    if (errors.length) throw new ReviewError(`Fix ${errors.length} problem(s) before submitting: ${errors[0].field}: ${errors[0].message}`);
  }
  if (kind === "rubric") {
    const r = rev as typeof s.rubricRevisions.$inferSelect;
    const criteria = await tx.select().from(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, id));
    const [qr] = await tx.select({ marks: s.questionRevisions.marks }).from(s.questionRevisions).where(eq(s.questionRevisions.id, r.questionRevisionId));
    const total = criteria.reduce((a, c) => a + c.marksAvailable, 0);
    if (!criteria.length || total !== qr.marks) throw new ReviewError(`The rubric's criteria add up to ${total}, but the question is worth ${qr.marks}.`);
  }
  const t = tables[kind];
  await tx.update(t).set({ status: "in_review", submittedAt: new Date() }).where(eq(t.id, id));
  await audit(tx, { actorId: actor.id, action: `${kind}_revision.submitted`, entityType: contentType[kind], entityId: id });
}

export async function decideRevision(
  tx: Tx,
  actor: Actor,
  kind: RevisionKind,
  id: string,
  decision: "approved" | "changes_requested" | "rejected",
  comments: string | null,
) {
  if (!canReview(actor)) throw new ReviewError("Only teacher reviewers or administrators can review content.");
  const rev = await loadRevision(tx, kind, id);
  if (rev.status !== "in_review") throw new ReviewError(`Only revisions in review can be decided (this one is ${rev.status}).`);
  if (decision === "approved" && rev.createdBy && rev.createdBy === actor.id) {
    throw new ReviewError("You wrote this revision, so someone else must review it.");
  }
  if (decision === "approved" && kind === "question") {
    const errors = (await runChecksForQuestionRevision(tx, id)).filter((i) => i.level === "error" && i.field !== "solution" && !i.field.startsWith("rubric"));
    if (errors.length) throw new ReviewError(`Automated checks failed: ${errors[0].field}: ${errors[0].message}`);
  }
  if (decision !== "approved" && !comments?.trim()) throw new ReviewError("Please explain what needs to change.");

  const now = new Date();
  const status = decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "draft";
  const t = tables[kind];
  await tx
    .update(t)
    .set({ status, reviewedBy: decision === "approved" ? actor.id : null, reviewedAt: decision === "approved" ? now : null, reviewNote: comments })
    .where(eq(t.id, id));
  await tx.insert(s.contentReviews).values({
    contentType: contentType[kind],
    contentId: id,
    reviewerId: actor.id,
    reviewType: "academic",
    decision,
    comments,
  });
  await audit(tx, { actorId: actor.id, action: `${kind}_revision.${decision}`, entityType: contentType[kind], entityId: id, details: { comments } });
}

/**
 * Publish a question using its newest approved question revision plus the newest approved
 * solution (required) and rubric (optional) written for that same revision.
 */
export async function publishQuestion(tx: Tx, actor: Actor, questionId: string) {
  if (!canReview(actor)) throw new ReviewError("Only teacher reviewers or administrators can publish.");
  const [q] = await tx.select().from(s.questions).where(eq(s.questions.id, questionId));
  if (!q) throw new ReviewError("Question not found.");
  if (q.permissionStatus !== "own_content" && q.permissionStatus !== "licensed") {
    throw new ReviewError(`Publishing rights are not cleared (permission status: ${q.permissionStatus.replace("_", " ")}).`);
  }
  const [rev] = await tx
    .select()
    .from(s.questionRevisions)
    .where(and(eq(s.questionRevisions.questionId, questionId), eq(s.questionRevisions.status, "approved")))
    .orderBy(desc(s.questionRevisions.revisionNumber))
    .limit(1);
  if (!rev) throw new ReviewError("The question has no approved revision yet.");
  const [sol] = await tx
    .select()
    .from(s.solutionRevisions)
    .where(and(eq(s.solutionRevisions.questionRevisionId, rev.id), eq(s.solutionRevisions.status, "approved")))
    .orderBy(desc(s.solutionRevisions.revisionNumber))
    .limit(1);
  if (!sol) throw new ReviewError("The solution for the approved question text has not been approved yet.");
  const [rub] = await tx
    .select()
    .from(s.rubricRevisions)
    .where(and(eq(s.rubricRevisions.questionRevisionId, rev.id), eq(s.rubricRevisions.status, "approved")))
    .orderBy(desc(s.rubricRevisions.revisionNumber))
    .limit(1);

  const previous = { rev: q.publishedRevisionId, sol: q.publishedSolutionId, rub: q.publishedRubricId };
  await tx
    .update(s.questions)
    .set({
      publicationStatus: "published",
      publishedRevisionId: rev.id,
      publishedSolutionId: sol.id,
      publishedRubricId: rub?.id ?? null,
      marks: rev.marks,
      answerFormat: rev.answerFormat,
      difficulty: rev.difficulty,
      searchText: questionSearchText(rev.content),
      publishedAt: q.publishedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(s.questions.id, questionId));

  // Older approved revisions are kept for history (attempts stay pinned to them) but marked superseded.
  const supersede = async (kind: RevisionKind, keep: string) => {
    const t = tables[kind];
    await tx.update(t).set({ status: "superseded" }).where(and(eq(t.questionId, questionId), eq(t.status, "approved"), ne(t.id, keep)));
  };
  await supersede("question", rev.id);
  await supersede("solution", sol.id);
  if (rub) await supersede("rubric", rub.id);

  await audit(tx, {
    actorId: actor.id,
    action: "question.published",
    entityType: "question",
    entityId: questionId,
    details: { revision: rev.revisionNumber, solution: sol.revisionNumber, rubric: rub?.revisionNumber ?? null, previous },
  });
  return { revision: rev.revisionNumber, hasRubric: Boolean(rub) };
}

export async function unpublishQuestion(tx: Tx, actor: Actor, questionId: string, reason: string) {
  if (!canReview(actor) && !actor.roles.includes("admin")) throw new ReviewError("Only reviewers or administrators can unpublish.");
  if (!reason.trim()) throw new ReviewError("Give a reason for unpublishing.");
  const res = await tx
    .update(s.questions)
    .set({ publicationStatus: "unpublished", updatedAt: new Date() })
    .where(and(eq(s.questions.id, questionId), eq(s.questions.publicationStatus, "published")))
    .returning({ id: s.questions.id });
  if (!res.length) throw new ReviewError("That question is not currently published.");
  // Any practice set containing it can no longer be taken.
  const affected = await tx.select({ paperId: s.paperItems.paperId }).from(s.paperItems).where(eq(s.paperItems.questionId, questionId));
  if (affected.length) {
    await tx
      .update(s.papers)
      .set({ publicationStatus: "unpublished", updatedAt: new Date() })
      .where(and(inArray(s.papers.id, affected.map((a) => a.paperId)), eq(s.papers.publicationStatus, "published")));
  }
  await audit(tx, { actorId: actor.id, action: "question.unpublished", entityType: "question", entityId: questionId, details: { reason, papersUnpublished: affected.length } });
}

export async function setPermissionStatus(
  tx: Tx,
  actor: Actor,
  questionId: string,
  status: (typeof s.permissionStatus.enumValues)[number],
  note: string,
) {
  if (!canReview(actor) && !canEdit(actor)) throw new ReviewError("Only staff can change permission status.");
  const [q] = await tx.select().from(s.questions).where(eq(s.questions.id, questionId));
  if (!q) throw new ReviewError("Question not found.");
  // A rights concern on a published question takes it down immediately.
  const unpublish = q.publicationStatus === "published" && status !== "own_content" && status !== "licensed";
  await tx
    .update(s.questions)
    .set({ permissionStatus: status, publicationStatus: unpublish ? "unpublished" : q.publicationStatus, updatedAt: new Date() })
    .where(eq(s.questions.id, questionId));
  await audit(tx, { actorId: actor.id, action: "question.permission_changed", entityType: "question", entityId: questionId, details: { from: q.permissionStatus, to: status, note, unpublished: unpublish } });
}

export async function publishPaper(tx: Tx, actor: Actor, paperId: string) {
  if (!canReview(actor)) throw new ReviewError("Only teacher reviewers or administrators can publish papers.");
  const items = await tx
    .select({ code: s.questions.code, status: s.questions.publicationStatus })
    .from(s.paperItems)
    .innerJoin(s.questions, eq(s.questions.id, s.paperItems.questionId))
    .where(eq(s.paperItems.paperId, paperId));
  if (!items.length) throw new ReviewError("This paper has no questions.");
  const unpublished = items.filter((i) => i.status !== "published");
  if (unpublished.length) throw new ReviewError(`Publish these questions first: ${unpublished.map((i) => i.code).join(", ")}`);
  await tx.update(s.papers).set({ publicationStatus: "published", updatedAt: new Date() }).where(eq(s.papers.id, paperId));
  await audit(tx, { actorId: actor.id, action: "paper.published", entityType: "paper", entityId: paperId });
}

export async function unpublishPaper(tx: Tx, actor: Actor, paperId: string) {
  if (!canReview(actor)) throw new ReviewError("Only teacher reviewers or administrators can unpublish papers.");
  await tx.update(s.papers).set({ publicationStatus: "unpublished", updatedAt: new Date() }).where(eq(s.papers.id, paperId));
  await audit(tx, { actorId: actor.id, action: "paper.unpublished", entityType: "paper", entityId: paperId });
}
