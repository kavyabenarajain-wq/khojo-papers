import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import * as s from "../db/schema";
import type { Tx } from "../db/types";
import { audit } from "../audit";
import {
  AnswerKeySchema,
  QuestionContentSchema,
  RubricCriterionSchema,
  SolutionSchema,
  ANSWER_FORMATS,
  type GenerationMeta,
} from "../content/types";
import { z } from "zod";
import { questionSearchText } from "../content/checks";
import type { Actor } from "./review";

export class EditorError extends Error {}

const canEdit = (a: Actor) => a.roles.includes("content_editor") || a.roles.includes("admin");

export const QuestionDraftSchema = z.object({
  answerFormat: z.enum(ANSWER_FORMATS),
  marks: z.number().int().min(1).max(20),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable(),
  content: QuestionContentSchema,
  answerKey: AnswerKeySchema.nullable(),
  hints: z.array(z.string().min(1)),
  changeNote: z.string().trim().min(3, "Describe what changed."),
});
export type QuestionDraft = z.infer<typeof QuestionDraftSchema>;

export const SolutionDraftSchema = SolutionSchema.extend({ changeNote: z.string().trim().min(3, "Describe what changed.") });
export const RubricDraftSchema = z.object({
  notes: z.string().nullable(),
  criteria: z.array(RubricCriterionSchema).min(1),
  changeNote: z.string().trim().min(3, "Describe what changed."),
});

async function nextNumber(tx: Tx, table: typeof s.questionRevisions | typeof s.solutionRevisions | typeof s.rubricRevisions, questionId: string) {
  const [r] = await tx.select({ n: max(table.revisionNumber) }).from(table).where(eq(table.questionId, questionId));
  return (r?.n ?? 0) + 1;
}

/** The newest revision of each kind, whatever its status. */
export async function latestRevisions(tx: Tx, questionId: string) {
  const [q] = await tx.select().from(s.questionRevisions).where(eq(s.questionRevisions.questionId, questionId)).orderBy(desc(s.questionRevisions.revisionNumber)).limit(1);
  const [sol] = await tx.select().from(s.solutionRevisions).where(eq(s.solutionRevisions.questionId, questionId)).orderBy(desc(s.solutionRevisions.revisionNumber)).limit(1);
  const [rub] = await tx.select().from(s.rubricRevisions).where(eq(s.rubricRevisions.questionId, questionId)).orderBy(desc(s.rubricRevisions.revisionNumber)).limit(1);
  const criteria = rub ? await tx.select().from(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, rub.id)).orderBy(asc(s.rubricCriteria.position)) : [];
  return { question: q ?? null, solution: sol ?? null, rubric: rub ?? null, criteria };
}

async function copyRubric(tx: Tx, actor: Actor, from: typeof s.rubricRevisions.$inferSelect, toQuestionRevisionId: string, marks: number, note: string) {
  const criteria = await tx.select().from(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, from.id)).orderBy(asc(s.rubricCriteria.position));
  const [rub] = await tx
    .insert(s.rubricRevisions)
    .values({ questionId: from.questionId, questionRevisionId: toQuestionRevisionId, revisionNumber: await nextNumber(tx, s.rubricRevisions, from.questionId), totalMarks: marks, notes: from.notes, status: "draft", changeNote: note, createdBy: actor.id, generation: from.generation })
    .returning();
  if (criteria.length) {
    await tx.insert(s.rubricCriteria).values(
      criteria.map((c) => ({
        rubricRevisionId: rub.id,
        criterionKey: c.criterionKey,
        partKey: c.partKey,
        position: c.position,
        description: c.description,
        marksAvailable: c.marksAvailable,
        expectedEvidence: c.expectedEvidence,
        acceptedAlternatives: c.acceptedAlternatives,
        partialCreditRules: c.partialCreditRules,
        commonErrors: c.commonErrors,
      })),
    );
  }
  return rub;
}

/**
 * Save question text. If the newest revision is a draft, it is updated in place; otherwise a new
 * draft revision is created, and the newest solution and rubric are copied forward as drafts
 * linked to it (they must be reviewed again for the new wording).
 */
export async function saveQuestionDraft(tx: Tx, actor: Actor, questionId: string, input: QuestionDraft) {
  if (!canEdit(actor)) throw new EditorError("Only content editors can edit questions.");
  const d = QuestionDraftSchema.parse(input);
  const latest = await latestRevisions(tx, questionId);
  const values = { content: d.content, answerFormat: d.answerFormat, marks: d.marks, answerKey: d.answerKey, hints: d.hints, difficulty: d.difficulty, changeNote: d.changeNote };
  if (latest.question?.status === "draft") {
    await tx.update(s.questionRevisions).set(values).where(eq(s.questionRevisions.id, latest.question.id));
    await audit(tx, { actorId: actor.id, action: "question_revision.edited", entityType: "question_revision", entityId: latest.question.id });
    return latest.question.id;
  }
  if (latest.question?.status === "in_review") throw new EditorError("This question is in review. Ask a reviewer to return it to draft first.");
  const [rev] = await tx
    .insert(s.questionRevisions)
    .values({ ...values, questionId, revisionNumber: await nextNumber(tx, s.questionRevisions, questionId), status: "draft", createdBy: actor.id, generation: latest.question?.generation ?? null })
    .returning();
  if (latest.solution) {
    const sol = latest.solution;
    await tx.insert(s.solutionRevisions).values({
      questionId,
      questionRevisionId: rev.id,
      revisionNumber: await nextNumber(tx, s.solutionRevisions, questionId),
      modelAnswer: sol.modelAnswer,
      finalAnswer: sol.finalAnswer,
      steps: sol.steps,
      commonMistakes: sol.commonMistakes,
      alternativeMethods: sol.alternativeMethods,
      status: "draft",
      changeNote: `Carried forward for question revision ${rev.revisionNumber}`,
      createdBy: actor.id,
      generation: sol.generation,
    });
  }
  if (latest.rubric) await copyRubric(tx, actor, latest.rubric, rev.id, d.marks, `Carried forward for question revision ${rev.revisionNumber}`);
  // Keep the library's draft search text current for unpublished questions.
  const [q] = await tx.select().from(s.questions).where(eq(s.questions.id, questionId));
  if (q && q.publicationStatus !== "published") {
    await tx.update(s.questions).set({ searchText: questionSearchText(d.content), marks: d.marks, answerFormat: d.answerFormat, difficulty: d.difficulty, updatedAt: new Date() }).where(eq(s.questions.id, questionId));
  }
  await audit(tx, { actorId: actor.id, action: "question_revision.created", entityType: "question_revision", entityId: rev.id, details: { revision: rev.revisionNumber, note: d.changeNote } });
  return rev.id;
}

/** Save a solution draft for the newest question revision. */
export async function saveSolutionDraft(tx: Tx, actor: Actor, questionId: string, input: z.infer<typeof SolutionDraftSchema>) {
  if (!canEdit(actor)) throw new EditorError("Only content editors can edit solutions.");
  const d = SolutionDraftSchema.parse(input);
  const latest = await latestRevisions(tx, questionId);
  if (!latest.question) throw new EditorError("Write the question first.");
  const values = { modelAnswer: d.modelAnswer, finalAnswer: d.finalAnswer, steps: d.steps, commonMistakes: d.commonMistakes, alternativeMethods: d.alternativeMethods, changeNote: d.changeNote };
  if (latest.solution?.status === "draft" && latest.solution.questionRevisionId === latest.question.id) {
    await tx.update(s.solutionRevisions).set(values).where(eq(s.solutionRevisions.id, latest.solution.id));
    return latest.solution.id;
  }
  if (latest.solution?.status === "in_review") throw new EditorError("The solution is in review. Ask a reviewer to return it to draft first.");
  const [sol] = await tx
    .insert(s.solutionRevisions)
    .values({ ...values, questionId, questionRevisionId: latest.question.id, revisionNumber: await nextNumber(tx, s.solutionRevisions, questionId), status: "draft", createdBy: actor.id })
    .returning();
  await audit(tx, { actorId: actor.id, action: "solution_revision.created", entityType: "solution_revision", entityId: sol.id, details: { note: d.changeNote } });
  return sol.id;
}

/** Save a rubric draft for the newest question revision. Criteria are replaced while in draft. */
export async function saveRubricDraft(tx: Tx, actor: Actor, questionId: string, input: z.infer<typeof RubricDraftSchema>) {
  if (!canEdit(actor)) throw new EditorError("Only content editors can edit rubrics.");
  const d = RubricDraftSchema.parse(input);
  const latest = await latestRevisions(tx, questionId);
  if (!latest.question) throw new EditorError("Write the question first.");
  const keys = d.criteria.map((c) => c.key);
  if (new Set(keys).size !== keys.length) throw new EditorError("Each criterion needs a unique key.");
  let rubricId: string;
  if (latest.rubric?.status === "draft" && latest.rubric.questionRevisionId === latest.question.id) {
    rubricId = latest.rubric.id;
    await tx.update(s.rubricRevisions).set({ notes: d.notes, changeNote: d.changeNote, totalMarks: latest.question.marks }).where(eq(s.rubricRevisions.id, rubricId));
    await tx.delete(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, rubricId));
  } else {
    if (latest.rubric?.status === "in_review") throw new EditorError("The rubric is in review. Ask a reviewer to return it to draft first.");
    const [rub] = await tx
      .insert(s.rubricRevisions)
      .values({ questionId, questionRevisionId: latest.question.id, revisionNumber: await nextNumber(tx, s.rubricRevisions, questionId), totalMarks: latest.question.marks, notes: d.notes, status: "draft", changeNote: d.changeNote, createdBy: actor.id })
      .returning();
    rubricId = rub.id;
  }
  await tx.insert(s.rubricCriteria).values(
    d.criteria.map((c, i) => ({
      rubricRevisionId: rubricId,
      criterionKey: c.key,
      partKey: c.partKey ?? null,
      position: i + 1,
      description: c.description,
      marksAvailable: c.marks,
      expectedEvidence: c.expectedEvidence,
      acceptedAlternatives: c.acceptedAlternatives,
      partialCreditRules: c.partialCreditRules ?? null,
      commonErrors: c.commonErrors,
    })),
  );
  await audit(tx, { actorId: actor.id, action: "rubric_revision.saved", entityType: "rubric_revision", entityId: rubricId, details: { note: d.changeNote } });
  return rubricId;
}

export const NewQuestionSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{4,24}$/, "Use capitals, digits and dashes, e.g. M10-QE-101."),
  chapterId: z.string().uuid(),
  sourceType: z.enum(["official_pyq", "official_specimen", "original_practice"]),
  sourceDocumentId: z.string().uuid().nullable(),
  sourcePage: z.string().trim().max(20).nullable(),
  sourceQuestionNumber: z.string().trim().max(20).nullable(),
  examYear: z.number().int().min(1990).max(2100).nullable(),
  permissionStatus: z.enum(["unknown", "reference_only", "licensed", "own_content", "restricted"]),
});

/** Create a question shell plus an empty-ish first draft. Official questions need a source document. */
export async function createQuestion(tx: Tx, actor: Actor, input: z.infer<typeof NewQuestionSchema>, draft: QuestionDraft, generation: GenerationMeta | null = null) {
  if (!canEdit(actor)) throw new EditorError("Only content editors can create questions.");
  const n = NewQuestionSchema.parse(input);
  if (n.sourceType !== "original_practice" && !n.sourceDocumentId) throw new EditorError("Official questions must be linked to their source document.");
  if (n.sourceType === "original_practice" && n.examYear) throw new EditorError("Original practice questions don't have an examination year.");
  const [chapter] = await tx.select().from(s.syllabusTopics).where(and(eq(s.syllabusTopics.id, n.chapterId), eq(s.syllabusTopics.kind, "chapter")));
  if (!chapter) throw new EditorError("Choose a chapter.");
  const [exists] = await tx.select({ id: s.questions.id }).from(s.questions).where(eq(s.questions.code, n.code));
  if (exists) throw new EditorError("That code is already used.");
  const d = QuestionDraftSchema.parse(draft);
  const [q] = await tx
    .insert(s.questions)
    .values({
      code: n.code,
      subjectId: chapter.subjectId,
      chapterId: chapter.id,
      sourceType: n.sourceType,
      sourceDocumentId: n.sourceDocumentId,
      sourcePage: n.sourcePage,
      sourceQuestionNumber: n.sourceQuestionNumber,
      examYear: n.examYear,
      syllabusYear: chapter.syllabusYear,
      permissionStatus: n.permissionStatus,
      publicationStatus: "draft",
      marks: d.marks,
      answerFormat: d.answerFormat,
      difficulty: d.difficulty,
      searchText: questionSearchText(d.content),
      createdBy: actor.id,
    })
    .returning();
  const [rev] = await tx
    .insert(s.questionRevisions)
    .values({ questionId: q.id, revisionNumber: 1, content: d.content, answerFormat: d.answerFormat, marks: d.marks, answerKey: d.answerKey, hints: d.hints, difficulty: d.difficulty, status: "draft", changeNote: d.changeNote, createdBy: generation ? null : actor.id, generation })
    .returning();
  await audit(tx, { actorId: actor.id, action: "question.created", entityType: "question", entityId: q.id, details: { code: n.code, sourceType: n.sourceType, generated: Boolean(generation) } });
  return { questionId: q.id, revisionId: rev.id };
}

export async function setQuestionTopics(tx: Tx, actor: Actor, questionId: string, chapterId: string, topicIds: string[]) {
  if (!canEdit(actor) && !actor.roles.includes("teacher_reviewer")) throw new EditorError("Only staff can change topics.");
  const topics = topicIds.length ? await tx.select().from(s.syllabusTopics).where(inArray(s.syllabusTopics.id, topicIds)) : [];
  if (topics.some((t) => t.parentId !== chapterId)) throw new EditorError("Topics must belong to the chosen chapter.");
  await tx.update(s.questions).set({ chapterId, updatedAt: new Date() }).where(eq(s.questions.id, questionId));
  await tx.delete(s.questionTopics).where(eq(s.questionTopics.questionId, questionId));
  if (topicIds.length) await tx.insert(s.questionTopics).values(topicIds.map((topicId) => ({ questionId, topicId })));
  await audit(tx, { actorId: actor.id, action: "question.topics_changed", entityType: "question", entityId: questionId, details: { chapterId, topicIds } });
}
