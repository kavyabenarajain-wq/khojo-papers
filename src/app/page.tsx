import Link from "next/link";
import { ArrowRight, BookOpen, FileText, PenLine } from "lucide-react";
import { sql } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import { libraryFacets } from "@/lib/dal/library";
import { getProgressSummary, getRecentActivity } from "@/lib/dal/progress";
import { rows } from "@/lib/db/query";
import { integrations } from "@/lib/env";
import { renderInline, toPlainText } from "@/lib/content/richtext";
import { ButtonLink } from "@/components/ui/Button";
import { DatabaseUnavailable } from "@/components/ui/Unavailable";
import { formatMarks } from "@/lib/labels";

async function loadHome() {
  return asViewer(async (tx, ctx) => {
    const facets = await libraryFacets(tx, { preview: ctx.preview });
    const recentlyPublished = await rows<{ id: string; code: string; stem: string; chapter: string | null }>(
      tx,
      sql`select q.id, q.code, qr.content ->> 'stem' as stem, ch.name as chapter
          from app.questions q join app.question_revisions qr on qr.id = q.published_revision_id
          left join app.syllabus_topics ch on ch.id = q.chapter_id
          where q.publication_status = 'published' and q.published_at > now() - interval '30 days'
          order by q.published_at desc, q.code limit 3`,
    );
    const papers = await rows<{ count: number }>(tx, sql`select count(*)::int as count from app.papers where publication_status = 'published'`);
    const activity = ctx.userId ? await getRecentActivity(tx, ctx.userId, 3) : null;
    const progress = ctx.userId ? await getProgressSummary(tx, ctx.userId) : null;
    return { facets, recentlyPublished, paperCount: papers[0]?.count ?? 0, activity, progress, ctx };
  });
}

export default async function HomePage() {
  const data = integrations.database ? await loadHome() : null;
  const total = data?.facets.sources.reduce((a, s) => a + s.count, 0) ?? 0;
  const name = data?.ctx.viewer?.displayName;

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-10 sm:py-16">
        <p className="mb-3 text-sm font-medium text-accent-text">ICSE Class 10 · Mathematics</p>
        <h1 className="max-w-3xl text-[2rem] font-semibold leading-tight tracking-tight sm:text-5xl">
          Every ICSE answer, checked. Every explanation, drawn.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">
          Practise exam-style questions, see each solution worked step by step, and get your written answers checked against
          a clear marking rubric.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href="/explore" size="lg">
            Start practising <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/papers" size="lg" variant="secondary">
            Explore papers
          </ButtonLink>
        </div>
      </section>

      {!data ? (
        <DatabaseUnavailable />
      ) : (
        <div className="space-y-12 pb-8">
          {data.activity && (data.activity.drafts.length > 0 || data.activity.recent.length > 0) && (
            <section aria-labelledby="continue-heading" className="grid gap-6 md:grid-cols-2">
              {data.activity.drafts.length > 0 && (
                <div>
                  <h2 id="continue-heading" className="mb-3 text-lg font-semibold">
                    {name ? `Continue where you left off, ${name}` : "Continue where you left off"}
                  </h2>
                  <ActivityList items={data.activity.drafts} />
                </div>
              )}
              {data.activity.recent.length > 0 && (
                <div>
                  <h2 className="mb-3 text-lg font-semibold">Recently attempted</h2>
                  <ActivityList items={data.activity.recent} />
                </div>
              )}
            </section>
          )}

          {data.progress && data.progress.weakChapters.length > 0 && (
            <section aria-labelledby="weak-heading">
              <h2 id="weak-heading" className="text-lg font-semibold">Chapters to revise</h2>
              <p className="mb-3 text-sm text-ink-3">Based on your multiple-choice and numerical answers (at least 3 per chapter).</p>
              <ul className="flex flex-wrap gap-2">
                {data.progress.weakChapters.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/explore?chapter=${c.slug}&status=unattempted`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 hover:border-line-strong">
                      {c.name}
                      <span className="text-sm text-ink-3">{Math.round(c.accuracy * 100)}% of {c.total}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="subjects-heading">
            <h2 id="subjects-heading" className="mb-3 text-lg font-semibold">Choose a subject</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Link href="/explore" className="group rounded-lg border border-line bg-surface p-5 hover:border-accent">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">Mathematics</span>
                  <ArrowRight className="size-5 text-ink-3 group-hover:text-accent" aria-hidden />
                </div>
                <p className="mt-1 text-ink-2">ICSE Class 10</p>
                <p className="mt-3 text-sm text-ink-3">
                  {total} question{total === 1 ? "" : "s"} · {data.paperCount} practice set{data.paperCount === 1 ? "" : "s"}
                </p>
              </Link>
              <div className="rounded-lg border border-dashed border-line-strong p-5 text-ink-3">
                <p className="font-medium text-ink-2">Other subjects</p>
                <p className="mt-1 text-sm">Not available yet. We&apos;re adding subjects one at a time, once each has reviewed questions, solutions and marking.</p>
              </div>
            </div>
          </section>

          <section aria-labelledby="chapters-heading">
            <h2 id="chapters-heading" className="mb-3 text-lg font-semibold">Mathematics chapters</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.facets.chapters.map((c) => (
                <li key={c.slug}>
                  {c.count > 0 ? (
                    <Link href={`/explore?chapter=${c.slug}`} className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-2 hover:border-line-strong">
                      <span>
                        <span className="block text-[0.95rem] font-medium text-ink">{c.name}</span>
                        <span className="text-xs text-ink-3">{c.unit}</span>
                      </span>
                      <span className="text-sm tabular-nums text-ink-3">{c.count}</span>
                    </Link>
                  ) : (
                    <div className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-dashed border-line px-4 py-2 text-ink-3">
                      <span>
                        <span className="block text-[0.95rem]">{c.name}</span>
                        <span className="text-xs">{c.unit}</span>
                      </span>
                      <span className="text-xs">No questions yet</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {data.recentlyPublished.length > 0 && (
            <section aria-labelledby="new-heading">
              <h2 id="new-heading" className="mb-3 text-lg font-semibold">Recently published</h2>
              <ul className="grid gap-3 md:grid-cols-3">
                {data.recentlyPublished.map((q) => (
                  <li key={q.id}>
                    <Link href={`/questions/${q.id}`} className="block h-full rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
                      <span className="text-xs text-ink-3">{q.chapter}</span>
                      <span className="prose-question mt-1 line-clamp-3 block text-[0.95rem]" dangerouslySetInnerHTML={{ __html: renderInline(q.stem.split(/\n\s*\n/)[0]) }} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="how-heading" className="grid gap-4 border-t border-line pt-10 md:grid-cols-3">
            <h2 id="how-heading" className="sr-only">How KHOJO PAPERS works</h2>
            {[
              { icon: BookOpen, title: "Know where each question comes from", body: "Board-paper, specimen and our own practice questions are always labelled separately." },
              { icon: PenLine, title: "Attempt first, then see the working", body: "Solutions unfold step by step on a whiteboard, with the reason for every step and the mistakes to avoid." },
              { icon: FileText, title: "Marked against a rubric", body: "See which marks you earned and which you lost, criterion by criterion. AI marks are always labelled as estimates." },
            ].map((f) => (
              <div key={f.title} className="flex gap-3">
                <f.icon className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-[0.95rem] text-ink-2">{f.body}</p>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function ActivityList({ items }: { items: Awaited<ReturnType<typeof getRecentActivity>>["drafts"] }) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((i) => (
        <li key={`${i.questionId}-${i.status}`}>
          <Link href={`/questions/${i.questionId}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
            <span className="min-w-0">
              <span className="block truncate text-[0.95rem] text-ink" title={toPlainText(i.stem)}>{toPlainText(i.stem)}</span>
              <span className="text-xs text-ink-3">{i.chapter} · {i.code}</span>
            </span>
            <span className="shrink-0 text-sm text-ink-3">
              {i.status === "draft" ? "Draft" : i.awarded != null ? `${formatMarks(i.awarded)}/${i.maximum}` : "Not marked"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
