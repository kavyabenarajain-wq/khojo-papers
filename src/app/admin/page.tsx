import Link from "next/link";
import { asViewer } from "@/lib/dal/context";
import { adminMetrics } from "@/lib/dal/admin";
import { integrations } from "@/lib/env";
import { Notice } from "@/components/ui/Notice";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

export default async function AdminHome() {
  const m = await asViewer((tx) => adminMetrics(tx));
  const c = m.content!;
  const aiEvalTotal = m.evals.reduce((a, e) => a + e.n, 0);
  const ev = (st: string) => m.evals.find((e) => e.status === st)?.n ?? 0;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card href="/admin/review" label="Waiting for review" value={c.in_review} note="questions with a revision in review" />
        <Card href="/admin/reports" label="Open issue reports" value={c.open_reports} />
        <Card href="/admin/disagreements" label="Teacher reviews requested" value={c.open_reviews} />
        <Card href="/admin/questions?status=published" label="Published questions" value={c.published} note={`${c.with_rubric} with an approved rubric`} />
      </div>

      <section>
        <h2 className="text-lg font-semibold">Content verification</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Questions published" value={`${c.published} of ${c.total}`} note={pct(c.published, c.total)} />
          <Metric label="Unpublished after review" value={String(c.unpublished)} />
          <Metric label="Syllabus topics verified" value={`${c.topics_verified} of ${c.topics_total}`} note={pct(c.topics_verified, c.topics_total)} />
          <Metric label="Rights unclear or restricted" value={String(c.permission_unknown)} note="questions" />
        </dl>
        {c.topics_verified < c.topics_total && (
          <Notice tone="warning" className="mt-3">
            The syllabus mapping is not fully verified against the official CISCE document. <Link href="/admin/syllabus" className="font-medium underline">Review syllabus topics</Link>
          </Notice>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">AI Examiner, last 30 days</h2>
        {!integrations.ai && <p className="mt-1 text-sm text-ink-3">Not connected to an AI service on this server.</p>}
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Photos read" value={String(m.recog?.total ?? 0)} note={`${pct((m.recog?.unreadable ?? 0) + (m.recog?.failed ?? 0), m.recog?.total ?? 0)} unreadable or failed`} />
          <Metric label="Transcripts corrected by students" value={pct(m.recog?.edited ?? 0, m.recog?.total ?? 0)} />
          <Metric label="AI evaluations" value={String(aiEvalTotal)} note={`${pct(ev("needs_review"), aiEvalTotal)} uncertain · ${pct(ev("failed"), aiEvalTotal)} failed · ${pct(ev("not_evaluable"), aiEvalTotal)} rubric problems`} />
          <Metric
            label="AI vs teacher (reviewed answers)"
            value={m.teacher?.compared ? `${m.teacher.mean_abs_diff?.toFixed(2)} marks` : "–"}
            note={m.teacher?.compared ? `mean difference over ${m.teacher.compared} · ${pct(m.teacher.exact, m.teacher.compared)} exact` : "No teacher re-marks yet"}
          />
        </dl>
        {m.ai.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-surface-2 text-left text-ink-2">
                <tr>{["Purpose", "Calls", "OK", "Invalid output", "Errors", "Refused", "Avg latency"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {m.ai.map((r) => (
                  <tr key={r.purpose}>
                    <td className="px-3 py-2">{r.purpose}</td>
                    <td className="px-3 py-2 tabular-nums">{r.total}</td>
                    <td className="px-3 py-2 tabular-nums">{r.ok}</td>
                    <td className="px-3 py-2 tabular-nums">{r.invalid}</td>
                    <td className="px-3 py-2 tabular-nums">{r.errors}</td>
                    <td className="px-3 py-2 tabular-nums">{r.refused}</td>
                    <td className="px-3 py-2 tabular-nums">{r.avg_ms ? `${(r.avg_ms / 1000).toFixed(1)} s` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm text-ink-3">
          Accuracy claims must come from the <Link href="/admin/benchmarks" className="underline">teacher-marked benchmark set</Link>
          {m.bench ? `; latest run ${new Date(m.bench.created_at).toLocaleDateString("en-IN")} on ${m.bench.item_count} items.` : ", which hasn't been run yet."}
        </p>
      </section>
    </div>
  );
}

function Card({ href, label, value, note }: { href: string; label: string; value: number; note?: string }) {
  return (
    <Link href={href} className="rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
      <p className="text-sm text-ink-3">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-ink-3">{note}</p>}
    </Link>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-ink-3">{note}</dd>}
    </div>
  );
}
