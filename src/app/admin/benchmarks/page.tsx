import type { Metadata } from "next";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";
import { canReviewContent } from "@/lib/auth/rbac";
import { integrations } from "@/lib/env";
import type { AgreementMetrics } from "@/lib/grading/agreement";
import { Notice } from "@/components/ui/Notice";
import { AddBenchmarkForm, RunBenchmarkButton } from "@/components/admin/BenchmarkForms";

export const metadata: Metadata = { title: "Benchmarks" };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

export default async function BenchmarksPage() {
  const data = await asViewer(async (tx, ctx) => {
    const items = await tx
      .select({ b: s.examinerBenchmarks, code: s.questions.code })
      .from(s.examinerBenchmarks)
      .innerJoin(s.questions, eq(s.questions.id, s.examinerBenchmarks.questionId))
      .orderBy(desc(s.examinerBenchmarks.createdAt));
    const runs = await tx.select().from(s.benchmarkRuns).orderBy(desc(s.benchmarkRuns.createdAt)).limit(10);
    const qs = await tx.select({ id: s.questions.id, code: s.questions.code, rubric: s.questions.publishedRubricId }).from(s.questions).where(isNotNull(s.questions.publishedRubricId)).orderBy(asc(s.questions.code));
    const criteria = qs.length ? await tx.select().from(s.rubricCriteria).orderBy(asc(s.rubricCriteria.position)) : [];
    return {
      items,
      runs,
      questions: qs.map((q) => ({ id: q.id, code: q.code, criteria: criteria.filter((c) => c.rubricRevisionId === q.rubric).map((c) => ({ key: c.criterionKey, description: c.description, marks: c.marksAvailable })) })),
      canEdit: canReviewContent(ctx.viewer),
    };
  });
  const latest = data.runs[0];
  const m = latest?.metrics as unknown as AgreementMetrics | undefined;
  const cats = new Set(data.items.map((i) => i.b.category));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Examiner benchmarks</h1>
        <p className="mt-1 text-ink-2">
          Answers marked independently by qualified ICSE teachers, re-marked by the AI to measure agreement. Don&apos;t make accuracy claims to students or
          parents until this set is large and representative, with release thresholds agreed per question type.
        </p>
      </div>
      <Notice tone={data.items.length < 50 ? "warning" : "info"} title={`${data.items.length} teacher-marked answers`}>
        Categories covered: {cats.size ? Array.from(cats).join(", ").replace(/_/g, " ") : "none yet"}. Aim to cover correct, partial and incorrect answers, alternative methods,
        equivalent wording, misconceptions, illegible and ambiguous handwriting, crossed-out work, diagrams and incomplete rubrics.
      </Notice>

      {m ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="font-semibold">Latest run · {latest.createdAt.toLocaleString("en-IN")} · {latest.model} · {latest.promptVersion}</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div><dt className="text-ink-3">Totals exactly equal</dt><dd className="text-xl font-semibold">{pct(m.totals.exact, m.marked)}</dd><dd className="text-ink-3">{m.totals.exact} of {m.marked} marked</dd></div>
            <div><dt className="text-ink-3">Within 1 mark</dt><dd className="text-xl font-semibold">{pct(m.totals.within1, m.marked)}</dd><dd className="text-ink-3">mean abs. error {m.totals.meanAbsError?.toFixed(2) ?? "–"}; bias {m.totals.meanSignedError?.toFixed(2) ?? "–"}</dd></div>
            <div><dt className="text-ink-3">Criterion agreement</dt><dd className="text-xl font-semibold">{pct(m.criteria.exact, m.criteria.compared)}</dd><dd className="text-ink-3">AI higher {m.criteria.aiHigher} (false positives) · lower {m.criteria.aiLower} (false negatives)</dd></div>
            <div><dt className="text-ink-3">Review flags</dt><dd className="text-xl font-semibold">{m.reviewFlag.truePositive + m.reviewFlag.trueNegative} / {m.items}</dd><dd className="text-ink-3">missed {m.reviewFlag.falseNegative} · unnecessary {m.reviewFlag.falsePositive} · failed {m.failed}</dd></div>
          </dl>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(["byCategory", "byFormat"] as const).map((k) => (
              <table key={k} className="w-full text-sm">
                <caption className="text-left font-medium">{k === "byCategory" ? "By category" : "By question type"}</caption>
                <thead className="text-left text-ink-3"><tr><th>Group</th><th>Items</th><th>Exact</th><th>MAE</th></tr></thead>
                <tbody>
                  {Object.entries(m[k]).map(([g, v]) => (
                    <tr key={g}><td>{g.replace(/_/g, " ")}</td><td>{v.items}</td><td>{v.exact}</td><td>{v.meanAbsError?.toFixed(2) ?? "–"}</td></tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-ink-3">No benchmark runs yet.</p>
      )}

      {data.canEdit && (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Run</h2>
          {!integrations.ai && <Notice tone="warning" className="mb-3">The AI service isn&apos;t configured, so benchmarks can&apos;t run on this server.</Notice>}
          <RunBenchmarkButton disabled={!integrations.ai || data.items.length === 0} />
        </section>
      )}

      {data.canEdit && (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Add a teacher-marked answer</h2>
          <AddBenchmarkForm questions={data.questions} />
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Benchmark answers</h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          {data.items.map(({ b, code }) => (
            <li key={b.id} className="px-4 py-2">
              <span className="font-mono">{code}</span> · {b.category.replace(/_/g, " ")} · teacher {b.teacherTotal} · marked by {b.markerName ?? "—"}
              {b.expectNeedsReview ? " · expect review flag" : ""}
            </li>
          ))}
          {data.items.length === 0 && <li className="px-4 py-3 text-ink-3">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
