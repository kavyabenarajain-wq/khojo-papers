import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/rbac";
import { asViewer } from "@/lib/dal/context";
import { rows } from "@/lib/db/query";
import { toPlainText } from "@/lib/content/richtext";
import { formatMarks, METHOD_LABELS } from "@/lib/labels";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";

export const metadata: Metadata = { title: "Attempt history" };
const PER = 25;

export default async function HistoryPage({ searchParams }: PageProps<"/account/history">) {
  const v = await requireViewer("/account/history");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { list, total } = await asViewer(async (tx) => {
    const list = await rows<{ response_id: string; question_id: string; code: string; stem: string; mode: string; submitted_at: Date; paper_slug: string | null; attempt_id: string; method: string | null; awarded: number | null; maximum: number | null; status: string | null }>(
      tx,
      sql`select r.id as response_id, r.question_id, q.code, qr.content ->> 'stem' as stem, a.mode, a.submitted_at, p.slug as paper_slug, a.id as attempt_id,
            e.method, e.awarded::float as awarded, e.maximum, e.status
          from app.responses r join app.attempts a on a.id = r.attempt_id
          join app.questions q on q.id = r.question_id
          join app.question_revisions qr on qr.id = r.question_revision_id
          left join app.papers p on p.id = a.paper_id
          left join lateral (select * from app.evaluations e where e.response_id = r.id order by e.created_at desc limit 1) e on true
          where r.user_id = ${v.id} and a.status = 'submitted'
          order by a.submitted_at desc, q.code
          limit ${PER} offset ${(page - 1) * PER}`,
    );
    const [{ n }] = await rows<{ n: number }>(tx, sql`select count(*)::int as n from app.responses r join app.attempts a on a.id = r.attempt_id where r.user_id = ${v.id} and a.status = 'submitted'`);
    return { list, total: n };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Attempt history</h1>
      <p className="mt-1 text-ink-2">{total} submitted answer{total === 1 ? "" : "s"}. Each mark shows how it was given.</p>
      {list.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Nothing submitted yet" action={<ButtonLink href="/explore">Find a question</ButtonLink>}>
            Answers you submit, in practice or in a timed paper, appear here.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {list.map((r) => (
            <li key={r.response_id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/questions/${r.question_id}`} className="line-clamp-2 text-[0.95rem] text-ink hover:underline">
                  {toPlainText(r.stem)}
                </Link>
                <p className="mt-0.5 text-xs text-ink-3">
                  {r.code} · {new Date(r.submitted_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                  {r.mode === "exam" && r.paper_slug ? <Link className="underline" href={`/papers/${r.paper_slug}/results/${r.attempt_id}`}>timed paper</Link> : r.mode}
                </p>
              </div>
              <div className="shrink-0 text-right text-sm">
                {r.awarded != null ? (
                  <>
                    <p className="font-medium tabular-nums">{formatMarks(r.awarded)} / {r.maximum}</p>
                    <p className="text-xs text-ink-3">{METHOD_LABELS[r.method as keyof typeof METHOD_LABELS]}{r.status === "needs_review" ? " · uncertain" : ""}</p>
                  </>
                ) : (
                  <p className="text-ink-3">Not marked</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PER))} href={(p) => `/account/history${p > 1 ? `?page=${p}` : ""}`} />
      </div>
    </div>
  );
}
