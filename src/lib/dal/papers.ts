import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import * as s from "../db/schema";
import type { Db, Executor, Tx } from "../db/types";
import { rows } from "../db/query";
import type { Answer, AnswerFormat, QuestionContent } from "../content/types";
import { gradeDeterministic } from "../grading/deterministic";
import { aggregatePaper, type PaperResult } from "../grading/aggregate";

export class PaperError extends Error {}

/** Answers saved up to this long after the deadline are accepted (network latency). */
export const DEADLINE_GRACE_MS = 60_000;

export type PaperListItem = {
  id: string;
  slug: string;
  title: string;
  paperType: "board" | "specimen" | "practice_set";
  availability: "hosted" | "external_reference";
  externalUrl: string | null;
  examinationYear: number | null;
  durationMinutes: number | null;
  maximumMarks: number | null;
  verificationStatus: string;
  publicationStatus: string;
  questionCount: number;
  inProgressAttemptId: string | null;
  lastResult: { attemptId: string; submittedAt: Date } | null;
};

export async function listPapers(db: Executor, opts: { preview: boolean; userId: string | null }): Promise<PaperListItem[]> {
  const vis = opts.preview ? sql`true` : sql`p.publication_status = 'published'`;
  const uid = opts.userId;
  const list = await rows<Record<string, unknown>>(
    db,
    sql`select p.*, (select count(*)::int from app.paper_items i where i.paper_id = p.id) as question_count,
      ${uid ? sql`(select a.id from app.attempts a where a.paper_id = p.id and a.user_id = ${uid} and a.status = 'in_progress' order by a.started_at desc limit 1)` : sql`null`} as in_progress,
      ${uid ? sql`(select json_build_object('attemptId', a.id, 'submittedAt', a.submitted_at) from app.attempts a where a.paper_id = p.id and a.user_id = ${uid} and a.status = 'submitted' order by a.submitted_at desc limit 1)` : sql`null`} as last_result
    from app.papers p where ${vis}
    order by p.paper_type, p.examination_year desc nulls last, p.title`,
  );
  return list.map((p) => ({
    id: p.id as string,
    slug: p.slug as string,
    title: p.title as string,
    paperType: p.paper_type as PaperListItem["paperType"],
    availability: p.availability as PaperListItem["availability"],
    externalUrl: (p.external_url as string) ?? null,
    examinationYear: (p.examination_year as number) ?? null,
    durationMinutes: (p.duration_minutes as number) ?? null,
    maximumMarks: (p.maximum_marks as number) ?? null,
    verificationStatus: p.verification_status as string,
    publicationStatus: p.publication_status as string,
    questionCount: Number(p.question_count),
    inProgressAttemptId: (p.in_progress as string) ?? null,
    lastResult: p.last_result ? { attemptId: (p.last_result as { attemptId: string }).attemptId, submittedAt: new Date((p.last_result as { submittedAt: string }).submittedAt) } : null,
  }));
}

export type PaperStructure = {
  paper: typeof s.papers.$inferSelect;
  source: { title: string; url: string | null } | null;
  sections: (typeof s.paperSections.$inferSelect & {
    items: { id: string; questionId: string; displayNumber: string; code: string; marks: number | null; answerFormat: AnswerFormat | null; chapter: string | null; stem: string; published: boolean }[];
  })[];
};

export async function getPaperBySlug(db: Executor, slug: string, opts: { preview: boolean }): Promise<PaperStructure | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const [paper] = await db.select().from(s.papers).where(eq(s.papers.slug, slug));
  if (!paper || (paper.publicationStatus !== "published" && !opts.preview)) return null;
  const [source] = paper.sourceDocumentId
    ? await db.select({ title: s.sourceDocuments.title, url: s.sourceDocuments.sourceUrl }).from(s.sourceDocuments).where(eq(s.sourceDocuments.id, paper.sourceDocumentId))
    : [];
  const sections = await db.select().from(s.paperSections).where(eq(s.paperSections.paperId, paper.id)).orderBy(asc(s.paperSections.position));
  const items = await rows<{ id: string; section_id: string; question_id: string; display_number: string; code: string; marks: number | null; answer_format: AnswerFormat | null; chapter: string | null; stem: string; publication_status: string }>(
    db,
    sql`select i.id, i.section_id, i.question_id, i.display_number, q.code, q.marks, q.answer_format, ch.name as chapter, q.publication_status,
          coalesce(qr.content, (select r.content from app.question_revisions r where r.question_id = q.id order by r.revision_number desc limit 1)) ->> 'stem' as stem
        from app.paper_items i join app.questions q on q.id = i.question_id
        left join app.question_revisions qr on qr.id = q.published_revision_id
        left join app.syllabus_topics ch on ch.id = q.chapter_id
        where i.paper_id = ${paper.id} order by i.position`,
  );
  return {
    paper,
    source: source ?? null,
    sections: sections.map((sec) => ({
      ...sec,
      items: items
        .filter((i) => i.section_id === sec.id)
        .map((i) => ({
          id: i.id,
          questionId: i.question_id,
          displayNumber: i.display_number,
          code: i.code,
          marks: i.marks,
          answerFormat: i.answer_format,
          chapter: i.chapter,
          stem: i.stem ?? "",
          published: i.publication_status === "published",
        })),
    })),
  };
}

/**
 * Start (or resume) a timed attempt. System write with explicit checks: the deadline is set by
 * the server, and every response is pinned to the question and rubric revisions published now.
 */
export async function startExam(db: Db, userId: string, paperId: string): Promise<{ attemptId: string; resumed: boolean }> {
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(s.profiles).where(eq(s.profiles.id, userId));
    if (!profile || !["not_required", "granted"].includes(profile.consentStatus)) {
      throw new PaperError("Your parent or guardian needs to confirm consent before you can take a timed paper.");
    }
    const [paper] = await tx.select().from(s.papers).where(eq(s.papers.id, paperId));
    if (!paper || paper.publicationStatus !== "published" || paper.availability !== "hosted") throw new PaperError("This paper can't be attempted here.");
    if (!paper.durationMinutes) throw new PaperError("This paper has no verified duration, so it can't be timed.");

    const [existing] = await tx
      .select()
      .from(s.attempts)
      .where(and(eq(s.attempts.userId, userId), eq(s.attempts.paperId, paperId), eq(s.attempts.status, "in_progress")))
      .orderBy(desc(s.attempts.startedAt))
      .limit(1);
    if (existing && existing.deadlineAt && existing.deadlineAt.getTime() + DEADLINE_GRACE_MS > Date.now()) {
      return { attemptId: existing.id, resumed: true };
    }
    if (existing) await finaliseExam(tx, userId, existing.id);

    const items = await tx
      .select({ id: s.paperItems.id, questionId: s.paperItems.questionId, status: s.questions.publicationStatus, rev: s.questions.publishedRevisionId, rubric: s.questions.publishedRubricId })
      .from(s.paperItems)
      .innerJoin(s.questions, eq(s.questions.id, s.paperItems.questionId))
      .where(eq(s.paperItems.paperId, paperId));
    if (items.some((i) => i.status !== "published" || !i.rev)) throw new PaperError("Some questions in this paper are being corrected. Please try again later.");

    const now = new Date();
    const [attempt] = await tx
      .insert(s.attempts)
      .values({ userId, mode: "exam", paperId, startedAt: now, deadlineAt: new Date(now.getTime() + paper.durationMinutes * 60_000) })
      .returning();
    await tx.insert(s.responses).values(
      items.map((i) => ({ attemptId: attempt.id, userId, questionId: i.questionId, questionRevisionId: i.rev!, rubricRevisionId: i.rubric, paperItemId: i.id })),
    );
    return { attemptId: attempt.id, resumed: false };
  });
}

export type ExamItem = {
  itemId: string;
  sectionId: string;
  displayNumber: string;
  questionId: string;
  responseId: string;
  revisionId: string;
  marks: number;
  answerFormat: AnswerFormat;
  content: QuestionContent;
  numericKey: { unit: string | null } | null;
  answer: Answer;
};

export type ExamAttemptView = {
  attempt: typeof s.attempts.$inferSelect;
  paper: { id: string; slug: string; title: string; instructions: string | null; durationMinutes: number | null; maximumMarks: number | null };
  sections: { id: string; label: string; instructions: string | null; choiceRule: "all" | "any_n"; chooseN: number | null }[];
  items: ExamItem[];
};

/** The student's own attempt (RLS). Answer keys are never selected. */
export async function getExamAttempt(db: Executor, userId: string, attemptId: string): Promise<ExamAttemptView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return null;
  const [attempt] = await db.select().from(s.attempts).where(and(eq(s.attempts.id, attemptId), eq(s.attempts.userId, userId)));
  if (!attempt || attempt.mode !== "exam" || !attempt.paperId) return null;
  const [paper] = await db.select().from(s.papers).where(eq(s.papers.id, attempt.paperId));
  if (!paper) return null;
  const sections = await db.select().from(s.paperSections).where(eq(s.paperSections.paperId, paper.id)).orderBy(asc(s.paperSections.position));
  const list = await db
    .select({
      itemId: s.paperItems.id,
      sectionId: s.paperItems.sectionId,
      position: s.paperItems.position,
      displayNumber: s.paperItems.displayNumber,
      questionId: s.responses.questionId,
      responseId: s.responses.id,
      revisionId: s.responses.questionRevisionId,
      answer: s.responses.answer,
      marks: s.questionRevisions.marks,
      answerFormat: s.questionRevisions.answerFormat,
      content: s.questionRevisions.content,
      keyType: sql<string | null>`${s.questionRevisions.answerKey} ->> 'type'`,
      keyUnit: sql<string | null>`${s.questionRevisions.answerKey} ->> 'unit'`,
    })
    .from(s.responses)
    .innerJoin(s.paperItems, eq(s.paperItems.id, s.responses.paperItemId))
    .innerJoin(s.questionRevisions, eq(s.questionRevisions.id, s.responses.questionRevisionId))
    .where(eq(s.responses.attemptId, attemptId))
    .orderBy(asc(s.paperItems.position));
  return {
    attempt,
    paper: { id: paper.id, slug: paper.slug, title: paper.title, instructions: paper.instructions, durationMinutes: paper.durationMinutes, maximumMarks: paper.maximumMarks },
    sections: sections.map((x) => ({ id: x.id, label: x.label, instructions: x.instructions, choiceRule: x.choiceRule, chooseN: x.chooseN })),
    items: list.map((i) => ({
      itemId: i.itemId,
      sectionId: i.sectionId,
      displayNumber: i.displayNumber,
      questionId: i.questionId,
      responseId: i.responseId,
      revisionId: i.revisionId,
      marks: i.marks,
      answerFormat: i.answerFormat,
      content: i.content,
      numericKey: i.keyType === "numeric" ? { unit: i.keyUnit } : null,
      answer: i.answer,
    })),
  };
}

/** Autosave one answer in a timed attempt (runs as the student under RLS). */
export async function saveExamAnswer(tx: Tx, userId: string, attemptId: string, responseId: string, answer: Answer): Promise<Date> {
  const [attempt] = await tx.select().from(s.attempts).where(and(eq(s.attempts.id, attemptId), eq(s.attempts.userId, userId)));
  if (!attempt || attempt.mode !== "exam") throw new PaperError("Attempt not found.");
  if (attempt.status !== "in_progress") throw new PaperError("This paper has already been submitted.");
  if (attempt.deadlineAt && Date.now() > attempt.deadlineAt.getTime() + DEADLINE_GRACE_MS) throw new PaperError("Time is up. Your saved answers will be submitted.");
  const now = new Date();
  const res = await tx
    .update(s.responses)
    .set({ answer, updatedAt: now })
    .where(and(eq(s.responses.id, responseId), eq(s.responses.attemptId, attemptId), eq(s.responses.userId, userId)))
    .returning({ id: s.responses.id });
  if (!res.length) throw new PaperError("Answer not found.");
  await tx.update(s.attempts).set({ updatedAt: now }).where(eq(s.attempts.id, attemptId));
  return now;
}

function isAnswered(a: Answer): boolean {
  const one = (x: Answer | undefined) => Boolean(x && (x.choice || x.value?.trim() || x.text?.trim()));
  return one(a) || Object.values(a.parts ?? {}).some((p) => one(p));
}

/** Lock answers, mark objective questions and close the attempt. Owner connection; caller checks ownership. */
async function finaliseExam(tx: Tx, userId: string, attemptId: string) {
  const now = new Date();
  const resp = await tx
    .select({ id: s.responses.id, answer: s.responses.answer, revisionId: s.responses.questionRevisionId, locked: s.responses.locked })
    .from(s.responses)
    .where(and(eq(s.responses.attemptId, attemptId), eq(s.responses.userId, userId)));
  const revs = resp.length ? await tx.select().from(s.questionRevisions).where(inArray(s.questionRevisions.id, resp.map((r) => r.revisionId))) : [];
  for (const r of resp) {
    if (!r.locked) await tx.update(s.responses).set({ locked: true, updatedAt: now }).where(eq(s.responses.id, r.id));
    if (!isAnswered(r.answer)) continue;
    const rev = revs.find((x) => x.id === r.revisionId)!;
    const det = gradeDeterministic({ format: rev.answerFormat, marks: rev.marks, content: rev.content, answerKey: rev.answerKey ?? null, answer: r.answer });
    if (det?.complete) {
      const [ev] = await tx
        .insert(s.evaluations)
        .values({ responseId: r.id, userId, method: "deterministic", status: "completed", awarded: det.awarded, maximum: det.maximum, isCorrect: det.awarded === det.maximum, summary: { overallFeedback: det.parts.map((p) => (p.partKey ? `(${p.partKey}) ${p.detail}` : p.detail)).join(" ") } })
        .returning();
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
  }
  await tx.update(s.attempts).set({ status: "submitted", submittedAt: now, updatedAt: now }).where(eq(s.attempts.id, attemptId));
}

export async function submitExam(db: Db, userId: string, attemptId: string) {
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(s.attempts).where(and(eq(s.attempts.id, attemptId), eq(s.attempts.userId, userId)));
    if (!attempt || attempt.mode !== "exam") throw new PaperError("Attempt not found.");
    if (attempt.status === "submitted") return { alreadySubmitted: true };
    await finaliseExam(tx, userId, attemptId);
    return { alreadySubmitted: false };
  });
}

export type ExamResultItem = {
  itemId: string;
  sectionId: string;
  displayNumber: string;
  questionId: string;
  responseId: string;
  rubricRevisionId: string | null;
  marks: number;
  answerFormat: AnswerFormat;
  answered: boolean;
  evaluation: { method: string; awarded: number | null; maximum: number; isCorrect: boolean | null; feedback: string | null } | null;
  counted: boolean;
};

export async function getExamResult(db: Executor, userId: string, attemptId: string): Promise<{ view: ExamAttemptView; items: ExamResultItem[]; totals: PaperResult } | null> {
  const view = await getExamAttempt(db, userId, attemptId);
  if (!view) return null;
  const evals = view.items.length
    ? await db
        .select()
        .from(s.evaluations)
        .where(inArray(s.evaluations.responseId, view.items.map((i) => i.responseId)))
        .orderBy(desc(s.evaluations.createdAt))
    : [];
  const rubrics = await db.select({ id: s.responses.id, rubric: s.responses.rubricRevisionId }).from(s.responses).where(eq(s.responses.attemptId, attemptId));
  // Preference for the displayed mark: teacher > deterministic > ai > self (each still labelled).
  const rank = { teacher: 0, deterministic: 1, ai: 2, self: 3 } as const;
  const best = (rid: string) =>
    evals
      .filter((e) => e.responseId === rid && e.status !== "failed" && e.awarded !== null)
      .sort((a, b) => rank[a.method] - rank[b.method])[0];
  const totals = aggregatePaper(
    view.sections.map((sec) => ({
      id: sec.id,
      label: sec.label,
      choiceRule: sec.choiceRule,
      chooseN: sec.chooseN,
      items: view.items
        .filter((i) => i.sectionId === sec.id)
        .map((i) => ({ itemId: i.itemId, marks: i.marks, answered: isAnswered(i.answer), awarded: best(i.responseId)?.awarded ?? null })),
    })),
  );
  const counted = new Set(totals.sections.flatMap((x) => x.countedItemIds));
  return {
    view,
    totals,
    items: view.items.map((i) => {
      const e = best(i.responseId);
      return {
        itemId: i.itemId,
        sectionId: i.sectionId,
        displayNumber: i.displayNumber,
        questionId: i.questionId,
        responseId: i.responseId,
        rubricRevisionId: rubrics.find((r) => r.id === i.responseId)?.rubric ?? null,
        marks: i.marks,
        answerFormat: i.answerFormat,
        answered: isAnswered(i.answer),
        evaluation: e ? { method: e.method, awarded: e.awarded, maximum: e.maximum, isCorrect: e.isCorrect, feedback: e.summary?.overallFeedback ?? null } : null,
        counted: counted.has(i.itemId),
      };
    }),
  };
}
