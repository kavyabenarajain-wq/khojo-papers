import { sql } from "drizzle-orm";
import type { Executor } from "../db/types";
import { rows } from "../db/query";

/** Operational metrics for the admin dashboard. Every number comes from stored records. */
export async function adminMetrics(db: Executor) {
  const [content] = await rows<{ total: number; published: number; unpublished: number; draft: number; with_rubric: number; in_review: number; open_reports: number; open_reviews: number; topics_total: number; topics_verified: number; sources_unverified: number; permission_unknown: number }>(
    db,
    sql`select
      (select count(*)::int from app.questions) as total,
      (select count(*)::int from app.questions where publication_status = 'published') as published,
      (select count(*)::int from app.questions where publication_status = 'unpublished') as unpublished,
      (select count(*)::int from app.questions where publication_status = 'draft') as draft,
      (select count(*)::int from app.questions where publication_status = 'published' and published_rubric_id is not null) as with_rubric,
      (select count(distinct question_id)::int from (
         select question_id from app.question_revisions where status = 'in_review'
         union all select question_id from app.solution_revisions where status = 'in_review'
         union all select question_id from app.rubric_revisions where status = 'in_review') x) as in_review,
      (select count(*)::int from app.issue_reports where status = 'open') as open_reports,
      (select count(*)::int from app.human_review_requests where status = 'open') as open_reviews,
      (select count(*)::int from app.syllabus_topics) as topics_total,
      (select count(*)::int from app.syllabus_topics where verification_status = 'verified') as topics_verified,
      (select count(*)::int from app.source_documents where verification_status <> 'verified') as sources_unverified,
      (select count(*)::int from app.questions where permission_status in ('unknown', 'restricted')) as permission_unknown`,
  );
  const ai = await rows<{ purpose: string; total: number; ok: number; invalid: number; errors: number; refused: number; avg_ms: number | null }>(
    db,
    sql`select purpose, count(*)::int as total,
          count(*) filter (where status = 'ok')::int as ok,
          count(*) filter (where status = 'invalid_output')::int as invalid,
          count(*) filter (where status = 'error')::int as errors,
          count(*) filter (where status = 'refused')::int as refused,
          avg(latency_ms)::int as avg_ms
        from app.ai_runs where created_at > now() - interval '30 days' group by purpose order by purpose`,
  );
  const [recog] = await rows<{ total: number; unreadable: number; failed: number; edited: number }>(
    db,
    sql`select count(*)::int as total,
          count(*) filter (where status = 'unreadable')::int as unreadable,
          count(*) filter (where status = 'failed')::int as failed,
          count(*) filter (where edit_distance > 0)::int as edited
        from app.transcripts where created_at > now() - interval '30 days'`,
  );
  const evals = await rows<{ status: string; n: number }>(
    db,
    sql`select status, count(*)::int as n from app.evaluations where method = 'ai' and created_at > now() - interval '30 days' group by status`,
  );
  const [bench] = await rows<{ created_at: Date; item_count: number; metrics: Record<string, unknown>; model: string; prompt_version: string }>(
    db,
    sql`select created_at, item_count, metrics, model, prompt_version from app.benchmark_runs order by created_at desc limit 1`,
  );
  const [teacher] = await rows<{ compared: number; mean_abs_diff: number | null; exact: number }>(
    db,
    sql`select count(*)::int as compared, avg(abs(t.awarded - a.awarded))::float as mean_abs_diff,
          count(*) filter (where t.awarded = a.awarded)::int as exact
        from app.human_review_requests h
        join app.evaluations a on a.id = h.evaluation_id
        join app.evaluations t on t.id = h.teacher_evaluation_id
        where a.awarded is not null and t.awarded is not null`,
  );
  return { content, ai, recog, evals, bench: bench ?? null, teacher };
}

export type ReviewQueueItem = {
  id: string;
  code: string;
  chapter: string | null;
  sourceType: string;
  publicationStatus: string;
  pending: { question: boolean; solution: boolean; rubric: boolean };
  aiAssisted: boolean;
  submittedAt: Date | null;
  openReports: number;
};

export async function reviewQueue(db: Executor): Promise<ReviewQueueItem[]> {
  const list = await rows<Record<string, unknown>>(
    db,
    sql`select q.id, q.code, ch.name as chapter, q.source_type, q.publication_status,
          exists (select 1 from app.question_revisions r where r.question_id = q.id and r.status = 'in_review') as pq,
          exists (select 1 from app.solution_revisions r where r.question_id = q.id and r.status = 'in_review') as ps,
          exists (select 1 from app.rubric_revisions r where r.question_id = q.id and r.status = 'in_review') as pr,
          exists (select 1 from app.question_revisions r where r.question_id = q.id and r.generation is not null) as ai,
          (select min(r.submitted_at) from app.question_revisions r where r.question_id = q.id and r.status = 'in_review') as submitted_at,
          (select count(*)::int from app.issue_reports i where i.question_id = q.id and i.status = 'open') as reports
        from app.questions q left join app.syllabus_topics ch on ch.id = q.chapter_id
        where exists (select 1 from app.question_revisions r where r.question_id = q.id and r.status = 'in_review')
           or exists (select 1 from app.solution_revisions r where r.question_id = q.id and r.status = 'in_review')
           or exists (select 1 from app.rubric_revisions r where r.question_id = q.id and r.status = 'in_review')
        order by ch.position nulls last, q.code`,
  );
  return list.map((r) => ({
    id: r.id as string,
    code: r.code as string,
    chapter: (r.chapter as string) ?? null,
    sourceType: r.source_type as string,
    publicationStatus: r.publication_status as string,
    pending: { question: Boolean(r.pq), solution: Boolean(r.ps), rubric: Boolean(r.pr) },
    aiAssisted: Boolean(r.ai),
    submittedAt: r.submitted_at ? new Date(r.submitted_at as string) : null,
    openReports: Number(r.reports),
  }));
}

export async function adminQuestionList(db: Executor, filter: { status?: string; q?: string }) {
  const conds = [sql`true`];
  if (filter.status && ["draft", "published", "unpublished"].includes(filter.status)) conds.push(sql`q.publication_status = ${filter.status}`);
  if (filter.q) conds.push(sql`(q.code ilike ${`%${filter.q}%`} or q.search_text ilike ${`%${filter.q}%`})`);
  return rows<{ id: string; code: string; chapter: string | null; source_type: string; publication_status: string; permission_status: string; marks: number | null; answer_format: string | null; latest_status: string | null; has_rubric: boolean }>(
    db,
    sql`select q.id, q.code, ch.name as chapter, q.source_type, q.publication_status, q.permission_status, q.marks, q.answer_format,
          (select r.status from app.question_revisions r where r.question_id = q.id order by r.revision_number desc limit 1) as latest_status,
          q.published_rubric_id is not null as has_rubric
        from app.questions q left join app.syllabus_topics ch on ch.id = q.chapter_id
        where ${sql.join(conds, sql` and `)}
        order by ch.position nulls last, q.code limit 500`,
  );
}
