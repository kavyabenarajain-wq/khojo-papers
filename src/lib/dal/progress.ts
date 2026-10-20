import { sql } from "drizzle-orm";
import type { Executor } from "../db/types";
import { rows } from "../db/query";

/**
 * Progress metrics computed only from the student's own attempt data (queries run under RLS).
 * Thresholds keep us from drawing conclusions from too little evidence.
 */
export const MIN_OBJECTIVE_FOR_WEAKNESS = 3;
export const WEAK_ACCURACY = 0.6;
export const MIN_FOR_TREND = 5;

export type MethodTotals = { method: "deterministic" | "ai" | "teacher" | "self"; evaluations: number; awarded: number; maximum: number };

export type ChapterStat = {
  slug: string;
  name: string;
  attempted: number;
  objectiveTotal: number;
  objectiveCorrect: number;
  marks: { method: MethodTotals["method"]; awarded: number; maximum: number }[];
};

export type ProgressSummary = {
  questionsAttempted: number;
  submissions: number;
  objective: { total: number; correct: number };
  byMethod: MethodTotals[];
  chapters: ChapterStat[];
  weakChapters: { slug: string; name: string; accuracy: number; total: number }[];
  missedCriteria: { description: string; chapter: string | null; times: number }[];
  mistakeCategories: { category: string; times: number }[];
  trend: { recent: { total: number; correct: number }; previous: { total: number; correct: number } } | null;
  solutionsRevealed: number;
  pendingHumanReviews: number;
};

export async function getProgressSummary(db: Executor, userId: string): Promise<ProgressSummary> {
  const [counts] = await rows<{ attempted: number; submissions: number }>(
    db,
    sql`select count(distinct r.question_id)::int as attempted, count(*)::int as submissions
        from app.responses r join app.attempts a on a.id = r.attempt_id
        where r.user_id = ${userId} and a.status = 'submitted'`,
  );

  const byMethod = await rows<{ method: MethodTotals["method"]; evaluations: number; awarded: number; maximum: number }>(
    db,
    sql`select e.method, count(*)::int as evaluations, coalesce(sum(e.awarded), 0)::float as awarded, coalesce(sum(e.maximum), 0)::int as maximum
        from app.evaluations e where e.user_id = ${userId} and e.status in ('completed', 'needs_review') and e.awarded is not null
        group by e.method`,
  );

  const [objective] = await rows<{ total: number; correct: number }>(
    db,
    sql`select count(*)::int as total, count(*) filter (where e.is_correct)::int as correct
        from app.evaluations e where e.user_id = ${userId} and e.method = 'deterministic' and e.status = 'completed'`,
  );

  const chapterRows = await rows<{
    slug: string;
    name: string;
    position: number;
    attempted: number;
    objective_total: number;
    objective_correct: number;
    marks: { method: MethodTotals["method"]; awarded: number; maximum: number }[] | null;
  }>(
    db,
    sql`with sub as (
          select r.id, r.question_id, q.chapter_id
          from app.responses r join app.attempts a on a.id = r.attempt_id join app.questions q on q.id = r.question_id
          where r.user_id = ${userId} and a.status = 'submitted'
        )
        select ch.slug, ch.name, ch.position,
          count(distinct sub.question_id)::int as attempted,
          (select count(*)::int from app.evaluations e join sub s2 on s2.id = e.response_id
            where s2.chapter_id = ch.id and e.method = 'deterministic' and e.status = 'completed') as objective_total,
          (select count(*)::int from app.evaluations e join sub s2 on s2.id = e.response_id
            where s2.chapter_id = ch.id and e.method = 'deterministic' and e.status = 'completed' and e.is_correct) as objective_correct,
          (select json_agg(m) from (
              select e.method, sum(e.awarded)::float as awarded, sum(e.maximum)::int as maximum
              from app.evaluations e join sub s2 on s2.id = e.response_id
              where s2.chapter_id = ch.id and e.method <> 'deterministic' and e.awarded is not null
              group by e.method) m) as marks
        from sub join app.syllabus_topics ch on ch.id = sub.chapter_id
        group by ch.id, ch.slug, ch.name, ch.position
        order by ch.position`,
  );
  const chapters: ChapterStat[] = chapterRows.map((c) => ({
    slug: c.slug,
    name: c.name,
    attempted: c.attempted,
    objectiveTotal: c.objective_total,
    objectiveCorrect: c.objective_correct,
    marks: c.marks ?? [],
  }));

  const weakChapters = chapters
    .filter((c) => c.objectiveTotal >= MIN_OBJECTIVE_FOR_WEAKNESS && c.objectiveCorrect / c.objectiveTotal < WEAK_ACCURACY)
    .map((c) => ({ slug: c.slug, name: c.name, accuracy: c.objectiveCorrect / c.objectiveTotal, total: c.objectiveTotal }))
    .sort((a, b) => a.accuracy - b.accuracy);

  // Rubric criteria where marks were lost, from AI, teacher and self marking (not deterministic).
  const missedCriteria = await rows<{ description: string; chapter: string | null; times: number }>(
    db,
    sql`select rc.description, ch.name as chapter, count(*)::int as times
        from app.criterion_scores cs
        join app.evaluations e on e.id = cs.evaluation_id
        join app.rubric_criteria rc on rc.id = cs.criterion_id
        join app.responses r on r.id = e.response_id
        join app.questions q on q.id = r.question_id
        left join app.syllabus_topics ch on ch.id = q.chapter_id
        where e.user_id = ${userId} and cs.marks_awarded < cs.marks_available and not cs.uncertain
        group by rc.description, ch.name
        having count(*) >= 1
        order by times desc limit 6`,
  );

  const mistakeCategories = await rows<{ category: string; times: number }>(
    db,
    sql`select cs.mistake_category as category, count(*)::int as times
        from app.criterion_scores cs join app.evaluations e on e.id = cs.evaluation_id
        where e.user_id = ${userId} and cs.mistake_category is not null
        group by cs.mistake_category having count(*) >= 2 order by times desc limit 6`,
  );

  const [t] = await rows<{ r_total: number; r_correct: number; p_total: number; p_correct: number }>(
    db,
    sql`select
          count(*) filter (where e.created_at >= now() - interval '14 days')::int as r_total,
          count(*) filter (where e.created_at >= now() - interval '14 days' and e.is_correct)::int as r_correct,
          count(*) filter (where e.created_at < now() - interval '14 days' and e.created_at >= now() - interval '28 days')::int as p_total,
          count(*) filter (where e.created_at < now() - interval '14 days' and e.created_at >= now() - interval '28 days' and e.is_correct)::int as p_correct
        from app.evaluations e where e.user_id = ${userId} and e.method = 'deterministic' and e.status = 'completed'`,
  );
  const trend =
    t && t.r_total >= MIN_FOR_TREND && t.p_total >= MIN_FOR_TREND
      ? { recent: { total: t.r_total, correct: t.r_correct }, previous: { total: t.p_total, correct: t.p_correct } }
      : null;

  const [extra] = await rows<{ reveals: number; pending: number }>(
    db,
    sql`select (select count(*)::int from app.solution_reveals where user_id = ${userId}) as reveals,
               (select count(*)::int from app.human_review_requests where user_id = ${userId} and status = 'open') as pending`,
  );

  return {
    questionsAttempted: counts?.attempted ?? 0,
    submissions: counts?.submissions ?? 0,
    objective: { total: objective?.total ?? 0, correct: objective?.correct ?? 0 },
    byMethod: byMethod.map((m) => ({ ...m, awarded: Number(m.awarded), maximum: Number(m.maximum) })),
    chapters,
    weakChapters,
    missedCriteria,
    mistakeCategories,
    trend,
    solutionsRevealed: extra?.reveals ?? 0,
    pendingHumanReviews: extra?.pending ?? 0,
  };
}

export type RecentItem = { questionId: string; code: string; chapter: string | null; stem: string; status: "draft" | "submitted"; at: Date; awarded: number | null; maximum: number | null; method: string | null };

/** Drafts to continue and recently submitted questions. */
export async function getRecentActivity(db: Executor, userId: string, limit = 5): Promise<{ drafts: RecentItem[]; recent: RecentItem[] }> {
  const list = await rows<{
    question_id: string;
    code: string;
    chapter: string | null;
    stem: string;
    status: string;
    at: Date;
    awarded: number | null;
    maximum: number | null;
    method: string | null;
  }>(
    db,
    sql`select distinct on (r.question_id, a.status = 'in_progress')
          r.question_id, q.code, ch.name as chapter, qr.content ->> 'stem' as stem,
          case when a.status = 'in_progress' then 'draft' else 'submitted' end as status,
          r.updated_at as at, e.awarded::float as awarded, e.maximum, e.method
        from app.responses r
        join app.attempts a on a.id = r.attempt_id and a.mode = 'practice'
        join app.questions q on q.id = r.question_id
        join app.question_revisions qr on qr.id = r.question_revision_id
        left join app.syllabus_topics ch on ch.id = q.chapter_id
        left join lateral (select * from app.evaluations e where e.response_id = r.id order by e.created_at desc limit 1) e on true
        where r.user_id = ${userId} and a.status in ('in_progress', 'submitted')
        order by r.question_id, a.status = 'in_progress', r.updated_at desc`,
  );
  const sorted = list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const map = (r: (typeof list)[number]): RecentItem => ({
    questionId: r.question_id,
    code: r.code,
    chapter: r.chapter,
    stem: r.stem,
    status: r.status as RecentItem["status"],
    at: new Date(r.at),
    awarded: r.awarded == null ? null : Number(r.awarded),
    maximum: r.maximum,
    method: r.method,
  });
  return {
    drafts: sorted.filter((r) => r.status === "draft").slice(0, limit).map(map),
    recent: sorted.filter((r) => r.status === "submitted").slice(0, limit).map(map),
  };
}

/** Revision suggestions: questions answered incorrectly, then unattempted questions in weak chapters. */
export async function getRevisionSuggestions(db: Executor, userId: string, weakChapterSlugs: string[], limit = 6) {
  const retry = await rows<{ id: string; code: string; chapter: string | null; reason: string }>(
    db,
    sql`select q.id, q.code, ch.name as chapter, 'Answered incorrectly last time' as reason
        from app.questions q
        left join app.syllabus_topics ch on ch.id = q.chapter_id
        where q.publication_status = 'published'
          and exists (select 1 from app.responses r join app.evaluations e on e.response_id = r.id
                      where r.question_id = q.id and r.user_id = ${userId} and e.method = 'deterministic' and e.is_correct = false)
          and not exists (select 1 from app.responses r join app.evaluations e on e.response_id = r.id
                      where r.question_id = q.id and r.user_id = ${userId} and e.is_correct = true)
        limit ${limit}`,
  );
  const fresh = weakChapterSlugs.length
    ? await rows<{ id: string; code: string; chapter: string | null; reason: string }>(
        db,
        sql`select q.id, q.code, ch.name as chapter, 'Not tried yet, in a chapter to revise' as reason
            from app.questions q join app.syllabus_topics ch on ch.id = q.chapter_id
            where q.publication_status = 'published' and ch.slug in ${weakChapterSlugs}
              and not exists (select 1 from app.responses r where r.question_id = q.id and r.user_id = ${userId})
            order by q.code limit ${limit}`,
      )
    : [];
  return [...retry, ...fresh].slice(0, limit);
}
