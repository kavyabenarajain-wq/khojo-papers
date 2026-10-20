import { and, asc, desc, eq, sql } from "drizzle-orm";
import * as s from "../db/schema";
import type { Executor } from "../db/types";
import type { AlternativeMethod, Answer, AnswerFormat, QuestionContent, SolutionStep } from "../content/types";
import type { SourceType } from "./library";

export type QuestionDetailDTO = {
  id: string;
  code: string;
  marks: number;
  answerFormat: AnswerFormat;
  sourceType: SourceType;
  examYear: number | null;
  syllabusYear: string;
  publicationStatus: "draft" | "published" | "unpublished";
  difficulty: "easy" | "medium" | "hard" | null;
  difficultyValidated: boolean;
  chapter: { slug: string; name: string } | null;
  topics: { slug: string; name: string }[];
  paper: { slug: string; title: string } | null;
  source: { title: string; url: string | null; page: string | null; questionNumber: string | null } | null;
  revision: {
    id: string;
    number: number;
    status: string;
    content: QuestionContent;
    hints: string[];
    reviewedAt: Date | null;
    aiAssisted: boolean;
  };
  hasSolution: boolean;
  hasRubric: boolean;
  /** True when the student may use deterministic checking for this question. */
  objective: boolean;
  /** A single numeric final value can be checked (its unit only; never the value). */
  numericKey: { unit: string | null } | null;
};

/**
 * Question for the solve page. Never includes the answer key, solution or rubric: those are
 * fetched separately after the student submits or chooses to reveal.
 */
export async function getQuestionDetail(db: Executor, id: string, opts: { preview: boolean }): Promise<QuestionDetailDTO | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [q] = await db.select().from(s.questions).where(eq(s.questions.id, id)).limit(1);
  if (!q) return null;
  const visible = q.publicationStatus === "published" || opts.preview;
  if (!visible) return null;

  const revRows = q.publicationStatus === "published" && q.publishedRevisionId
    ? await db.select().from(s.questionRevisions).where(eq(s.questionRevisions.id, q.publishedRevisionId))
    : await db.select().from(s.questionRevisions).where(eq(s.questionRevisions.questionId, id)).orderBy(desc(s.questionRevisions.revisionNumber)).limit(1);
  const rev = revRows[0];
  if (!rev) return null;

  const [chapter] = q.chapterId
    ? await db.select({ slug: s.syllabusTopics.slug, name: s.syllabusTopics.name }).from(s.syllabusTopics).where(eq(s.syllabusTopics.id, q.chapterId))
    : [];
  const topics = await db
    .select({ slug: s.syllabusTopics.slug, name: s.syllabusTopics.name })
    .from(s.questionTopics)
    .innerJoin(s.syllabusTopics, eq(s.syllabusTopics.id, s.questionTopics.topicId))
    .where(eq(s.questionTopics.questionId, id))
    .orderBy(asc(s.syllabusTopics.position));
  const [paper] = q.paperId ? await db.select({ slug: s.papers.slug, title: s.papers.title }).from(s.papers).where(eq(s.papers.id, q.paperId)) : [];
  const [doc] = q.sourceDocumentId
    ? await db.select({ title: s.sourceDocuments.title, url: s.sourceDocuments.sourceUrl }).from(s.sourceDocuments).where(eq(s.sourceDocuments.id, q.sourceDocumentId))
    : [];

  const hasSolution = q.publicationStatus === "published"
    ? Boolean(q.publishedSolutionId)
    : (await db.select({ id: s.solutionRevisions.id }).from(s.solutionRevisions).where(eq(s.solutionRevisions.questionId, id)).limit(1)).length > 0;
  const hasRubric = q.publicationStatus === "published"
    ? Boolean(q.publishedRubricId)
    : (await db.select({ id: s.rubricRevisions.id }).from(s.rubricRevisions).where(eq(s.rubricRevisions.questionId, id)).limit(1)).length > 0;

  const key = rev.answerKey;
  const objective =
    (rev.answerFormat === "mcq" && key?.type === "mcq") ||
    (rev.answerFormat === "numerical" && key?.type === "numeric") ||
    (rev.answerFormat === "structured" && key?.type === "parts");

  return {
    id: q.id,
    code: q.code,
    marks: rev.marks,
    answerFormat: rev.answerFormat,
    sourceType: q.sourceType,
    examYear: q.examYear,
    syllabusYear: q.syllabusYear,
    publicationStatus: q.publicationStatus,
    difficulty: rev.difficulty,
    difficultyValidated: q.difficultyValidated,
    chapter: chapter ?? null,
    topics,
    paper: paper ?? null,
    source: doc ? { title: doc.title, url: doc.url, page: q.sourcePage, questionNumber: q.sourceQuestionNumber } : null,
    revision: {
      id: rev.id,
      number: rev.revisionNumber,
      status: rev.status,
      content: rev.content,
      hints: rev.hints,
      reviewedAt: rev.reviewedAt,
      aiAssisted: Boolean(rev.generation),
    },
    hasSolution,
    hasRubric,
    objective,
    numericKey: key?.type === "numeric" ? { unit: key.unit ?? null } : null,
  };
}

export type SolutionDTO = {
  id: string;
  questionRevisionId: string;
  modelAnswer: string;
  finalAnswer: string;
  steps: SolutionStep[];
  commonMistakes: string[];
  alternativeMethods: AlternativeMethod[];
  status: string;
  reviewedAt: Date | null;
};

export async function getSolution(db: Executor, questionId: string, opts: { preview: boolean }): Promise<SolutionDTO | null> {
  const [q] = await db.select().from(s.questions).where(eq(s.questions.id, questionId)).limit(1);
  if (!q) return null;
  let rows;
  if (q.publicationStatus === "published" && q.publishedSolutionId) {
    rows = await db.select().from(s.solutionRevisions).where(eq(s.solutionRevisions.id, q.publishedSolutionId));
  } else if (opts.preview) {
    rows = await db.select().from(s.solutionRevisions).where(eq(s.solutionRevisions.questionId, questionId)).orderBy(desc(s.solutionRevisions.revisionNumber)).limit(1);
  } else return null;
  const sol = rows[0];
  if (!sol) return null;
  return {
    id: sol.id,
    questionRevisionId: sol.questionRevisionId,
    modelAnswer: sol.modelAnswer,
    finalAnswer: sol.finalAnswer,
    steps: sol.steps,
    commonMistakes: sol.commonMistakes,
    alternativeMethods: sol.alternativeMethods,
    status: sol.status,
    reviewedAt: sol.reviewedAt,
  };
}

export type RubricDTO = {
  id: string;
  totalMarks: number;
  notes: string | null;
  status: string;
  criteria: {
    id: string;
    key: string;
    partKey: string | null;
    description: string;
    marks: number;
    expectedEvidence: string;
    acceptedAlternatives: string[];
    partialCreditRules: string | null;
    commonErrors: string[];
  }[];
};

export async function getRubricById(db: Executor, rubricId: string): Promise<RubricDTO | null> {
  const [r] = await db.select().from(s.rubricRevisions).where(eq(s.rubricRevisions.id, rubricId));
  if (!r) return null;
  const criteria = await db.select().from(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, r.id)).orderBy(asc(s.rubricCriteria.position));
  return {
    id: r.id,
    totalMarks: r.totalMarks,
    notes: r.notes,
    status: r.status,
    criteria: criteria.map((c) => ({
      id: c.id,
      key: c.criterionKey,
      partKey: c.partKey,
      description: c.description,
      marks: c.marksAvailable,
      expectedEvidence: c.expectedEvidence,
      acceptedAlternatives: c.acceptedAlternatives,
      partialCreditRules: c.partialCreditRules,
      commonErrors: c.commonErrors,
    })),
  };
}

/** The rubric students are marked against: the published one (or the latest draft in staff preview). */
export async function getCurrentRubric(db: Executor, questionId: string, opts: { preview: boolean }): Promise<RubricDTO | null> {
  const [q] = await db.select().from(s.questions).where(eq(s.questions.id, questionId)).limit(1);
  if (!q) return null;
  if (q.publicationStatus === "published") return q.publishedRubricId ? getRubricById(db, q.publishedRubricId) : null;
  if (!opts.preview) return null;
  const [r] = await db.select({ id: s.rubricRevisions.id }).from(s.rubricRevisions).where(eq(s.rubricRevisions.questionId, questionId)).orderBy(desc(s.rubricRevisions.revisionNumber)).limit(1);
  return r ? getRubricById(db, r.id) : null;
}

export type PracticeStateDTO = {
  bookmarked: boolean;
  draft: { responseId: string; answer: Answer; updatedAt: Date } | null;
  history: {
    responseId: string;
    submittedAt: Date | null;
    evaluation: { id: string; method: string; status: string; awarded: number | null; maximum: number; isCorrect: boolean | null } | null;
  }[];
};

/** The signed-in student's own drafts, attempts and bookmarks for one question (RLS-scoped). */
export async function getPracticeState(db: Executor, userId: string, questionId: string): Promise<PracticeStateDTO> {
  const [bm] = await db.select().from(s.bookmarks).where(and(eq(s.bookmarks.userId, userId), eq(s.bookmarks.questionId, questionId)));
  const resp = await db
    .select({ id: s.responses.id, answer: s.responses.answer, updatedAt: s.responses.updatedAt, status: s.attempts.status, mode: s.attempts.mode, submittedAt: s.attempts.submittedAt })
    .from(s.responses)
    .innerJoin(s.attempts, eq(s.attempts.id, s.responses.attemptId))
    .where(and(eq(s.responses.userId, userId), eq(s.responses.questionId, questionId)))
    .orderBy(desc(s.responses.updatedAt))
    .limit(20);
  const draft = resp.find((r) => r.status === "in_progress" && r.mode === "practice");
  const submitted = resp.filter((r) => r.status === "submitted");
  const evals = submitted.length
    ? await db
        .select()
        .from(s.evaluations)
        .where(sql`${s.evaluations.responseId} in ${submitted.map((r) => r.id)}`)
        .orderBy(desc(s.evaluations.createdAt))
    : [];
  return {
    bookmarked: Boolean(bm),
    draft: draft ? { responseId: draft.id, answer: draft.answer, updatedAt: draft.updatedAt } : null,
    history: submitted.map((r) => {
      const e = evals.find((x) => x.responseId === r.id);
      return {
        responseId: r.id,
        submittedAt: r.submittedAt,
        evaluation: e ? { id: e.id, method: e.method, status: e.status, awarded: e.awarded, maximum: e.maximum, isCorrect: e.isCorrect } : null,
      };
    }),
  };
}
