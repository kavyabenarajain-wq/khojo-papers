import { sql, type SQL } from "drizzle-orm";
import type { Executor } from "../db/types";
import { rows as q_rows } from "../db/query";
import type { AnswerFormat } from "../content/types";

/**
 * Question library queries. Pure functions over an executor so they run identically in the app
 * (inside `runAs`) and in tests. Answer keys and solutions are never selected here.
 */

export const SOURCE_TYPES = ["official_pyq", "official_specimen", "original_practice"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type LibraryFilters = {
  q?: string;
  syllabusYear?: string;
  chapter?: string;
  topic?: string;
  source?: SourceType;
  year?: number;
  marks?: number;
  difficulty?: (typeof DIFFICULTIES)[number];
  format?: AnswerFormat;
  status?: "attempted" | "unattempted";
  bookmarked?: boolean;
  examinerReady?: boolean;
};

export type AttemptStatus = "correct" | "incorrect" | "attempted" | "in_progress" | null;

export type QuestionCardDTO = {
  id: string;
  code: string;
  stem: string;
  marks: number | null;
  answerFormat: AnswerFormat | null;
  sourceType: SourceType;
  examYear: number | null;
  paperTitle: string | null;
  chapterName: string | null;
  chapterSlug: string | null;
  difficulty: (typeof DIFFICULTIES)[number] | null;
  difficultyValidated: boolean;
  hasSolution: boolean;
  hasRubric: boolean;
  publicationStatus: "draft" | "published" | "unpublished";
  attemptStatus: AttemptStatus;
  bookmarked: boolean;
};

export const PAGE_SIZE = 20;

function whereClause(f: LibraryFilters, userId: string | null, preview: boolean): SQL {
  const conds: SQL[] = [preview ? sql`true` : sql`q.publication_status = 'published'`];
  if (f.q?.trim()) conds.push(sql`(q.search @@ websearch_to_tsquery('english', ${f.q.trim()}) or q.code ilike ${`%${f.q.trim()}%`})`);
  if (f.syllabusYear) conds.push(sql`q.syllabus_year = ${f.syllabusYear}`);
  if (f.chapter) conds.push(sql`ch.slug = ${f.chapter}`);
  if (f.topic)
    conds.push(sql`exists (select 1 from app.question_topics qt join app.syllabus_topics t on t.id = qt.topic_id where qt.question_id = q.id and t.slug = ${f.topic})`);
  if (f.source) conds.push(sql`q.source_type = ${f.source}`);
  if (f.year) conds.push(sql`q.exam_year = ${f.year}`);
  if (f.marks) conds.push(sql`q.marks = ${f.marks}`);
  if (f.difficulty) conds.push(sql`q.difficulty = ${f.difficulty}`);
  if (f.format) conds.push(sql`q.answer_format = ${f.format}`);
  if (f.examinerReady) conds.push(sql`q.published_rubric_id is not null`);
  if (userId && f.status) {
    const attempted = sql`exists (select 1 from app.responses r join app.attempts a on a.id = r.attempt_id
      where r.question_id = q.id and r.user_id = ${userId} and a.status = 'submitted')`;
    conds.push(f.status === "attempted" ? attempted : sql`not ${attempted}`);
  }
  if (userId && f.bookmarked) conds.push(sql`exists (select 1 from app.bookmarks b where b.question_id = q.id and b.user_id = ${userId})`);
  return sql.join(conds, sql` and `);
}

const FROM = sql`
  from app.questions q
  left join app.syllabus_topics ch on ch.id = q.chapter_id
  left join app.papers p on p.id = q.paper_id
  left join app.question_revisions pr on pr.id = q.published_revision_id`;

export async function searchQuestions(
  db: Executor,
  filters: LibraryFilters,
  opts: { userId: string | null; preview: boolean; page?: number; pageSize?: number },
): Promise<{ items: QuestionCardDTO[]; total: number; page: number; pageCount: number }> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const where = whereClause(filters, opts.userId, opts.preview);
  const q = filters.q?.trim();
  const rank = q ? sql`ts_rank(q.search, websearch_to_tsquery('english', ${q})) desc,` : sql``;
  const uid = opts.userId;

  const attemptStatus = uid
    ? sql`(select case
          when bool_or(e.is_correct) then 'correct'
          when bool_or(e.is_correct = false) then 'incorrect'
          when bool_or(a.status = 'submitted') then 'attempted'
          else 'in_progress' end
        from app.responses r join app.attempts a on a.id = r.attempt_id
        left join app.evaluations e on e.response_id = r.id
        where r.question_id = q.id and r.user_id = ${uid}
        having count(r.id) > 0)`
    : sql`null`;
  const bookmarked = uid ? sql`exists (select 1 from app.bookmarks b where b.question_id = q.id and b.user_id = ${uid})` : sql`false`;

  const rows = await q_rows<Record<string, unknown>>(db, sql`
    select q.id, q.code, q.marks, q.answer_format, q.source_type, q.exam_year, q.difficulty, q.difficulty_validated,
      q.publication_status, q.published_solution_id is not null as has_solution, q.published_rubric_id is not null as has_rubric,
      ch.name as chapter_name, ch.slug as chapter_slug, p.title as paper_title,
      coalesce(pr.content, (select r.content from app.question_revisions r where r.question_id = q.id order by r.revision_number desc limit 1)) ->> 'stem' as stem,
      ${attemptStatus} as attempt_status,
      ${bookmarked} as bookmarked
    ${FROM}
    where ${where}
    order by ${rank} ch.position nulls last, q.code
    limit ${pageSize} offset ${(page - 1) * pageSize}
  `);

  const [{ count }] = await q_rows<{ count: number }>(db, sql`select count(*)::int as count ${FROM} where ${where}`);

  return {
    items: rows.map((r) => ({
      id: r.id as string,
      code: r.code as string,
      stem: (r.stem as string) ?? "",
      marks: (r.marks as number) ?? null,
      answerFormat: (r.answer_format as AnswerFormat) ?? null,
      sourceType: r.source_type as SourceType,
      examYear: (r.exam_year as number) ?? null,
      paperTitle: (r.paper_title as string) ?? null,
      chapterName: (r.chapter_name as string) ?? null,
      chapterSlug: (r.chapter_slug as string) ?? null,
      difficulty: (r.difficulty as QuestionCardDTO["difficulty"]) ?? null,
      difficultyValidated: Boolean(r.difficulty_validated),
      hasSolution: Boolean(r.has_solution),
      hasRubric: Boolean(r.has_rubric),
      publicationStatus: r.publication_status as QuestionCardDTO["publicationStatus"],
      attemptStatus: (r.attempt_status as AttemptStatus) ?? null,
      bookmarked: Boolean(r.bookmarked),
    })),
    total: Number(count),
    page,
    pageCount: Math.max(1, Math.ceil(Number(count) / pageSize)),
  };
}

export type LibraryFacets = {
  syllabusYears: string[];
  chapters: { slug: string; name: string; unit: string | null; count: number; topics: { slug: string; name: string }[] }[];
  sources: { value: SourceType; count: number }[];
  examYears: number[];
  marks: number[];
  formats: AnswerFormat[];
  difficulties: string[];
};

/** Only offer filter values that actually exist in the visible library. */
export async function libraryFacets(db: Executor, opts: { preview: boolean }): Promise<LibraryFacets> {
  const vis = opts.preview ? sql`true` : sql`q.publication_status = 'published'`;
  const chapters = await q_rows<{ slug: string; name: string; unit_name: string | null; count: number; topics: { slug: string; name: string }[] }>(db, sql`
    select ch.slug, ch.name, ch.unit_name, ch.position,
      (select count(*)::int from app.questions q where q.chapter_id = ch.id and ${vis}) as count,
      coalesce((select json_agg(json_build_object('slug', t.slug, 'name', t.name) order by t.position)
        from app.syllabus_topics t where t.parent_id = ch.id), '[]'::json) as topics
    from app.syllabus_topics ch
    join app.subjects su on su.id = ch.subject_id and su.status = 'active'
    where ch.kind = 'chapter'
    order by ch.position`);
  const agg = await q_rows<{ years: string[]; exam_years: number[]; marks: number[]; formats: string[]; difficulties: string[] }>(db, sql`
    select
      coalesce(array_agg(distinct q.syllabus_year), '{}') as years,
      coalesce(array_agg(distinct q.exam_year) filter (where q.exam_year is not null), '{}') as exam_years,
      coalesce(array_agg(distinct q.marks) filter (where q.marks is not null), '{}') as marks,
      coalesce(array_agg(distinct q.answer_format::text) filter (where q.answer_format is not null), '{}') as formats,
      coalesce(array_agg(distinct q.difficulty::text) filter (where q.difficulty is not null), '{}') as difficulties
    from app.questions q where ${vis}`);
  const sources = await q_rows<{
    value: SourceType;
    count: number;
  }>(db, sql`
    select q.source_type as value, count(*)::int as count from app.questions q where ${vis} group by q.source_type`);
  const a = agg[0];
  return {
    syllabusYears: [...(a?.years ?? [])].sort(),
    chapters: chapters.map((c) => ({ slug: c.slug, name: c.name, unit: c.unit_name, count: Number(c.count), topics: c.topics })),
    sources: SOURCE_TYPES.map((v) => ({ value: v, count: Number(sources.find((s) => s.value === v)?.count ?? 0) })),
    examYears: [...(a?.exam_years ?? [])].map(Number).sort((x, y) => y - x),
    marks: [...(a?.marks ?? [])].map(Number).sort((x, y) => x - y),
    formats: (a?.formats ?? []) as AnswerFormat[],
    difficulties: ["easy", "medium", "hard"].filter((d) => (a?.difficulties ?? []).includes(d)),
  };
}
