import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { asViewer } from "@/lib/dal/context";
import { getProgressSummary, getRevisionSuggestions, MIN_FOR_TREND, MIN_OBJECTIVE_FOR_WEAKNESS } from "@/lib/dal/progress";
import { getViewer } from "@/lib/auth/session";
import { integrations } from "@/lib/env";
import { formatMarks, METHOD_LABELS } from "@/lib/labels";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { DatabaseUnavailable } from "@/components/ui/Unavailable";

export const metadata: Metadata = { title: "Progress" };

const MISTAKE_LABELS: Record<string, string> = {
  incorrect_answer: "Wrong final answer",
  units: "Missing or wrong units",
  conceptual: "Concept misunderstood",
  method: "Method error",
  calculation: "Calculation slip",
  notation: "Notation",
  incomplete: "Incomplete working",
  missing_reason: "Reason not stated",
  misread_question: "Misread the question",
  transcription_suspected: "Possible transcription issue",
};

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default async function ProgressPage() {
  if (!integrations.database) return <div className="mx-auto max-w-4xl px-4 py-8"><DatabaseUnavailable /></div>;
  const viewer = await getViewer();
  if (!viewer || viewer.needsProfile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <div className="mt-6">
          <EmptyState icon={<BarChart3 className="size-5" />} title="Sign in to track your progress" action={<ButtonLink href="/login?next=/progress">Sign in</ButtonLink>}>
            Your progress is built only from answers you submit while signed in.
          </EmptyState>
        </div>
      </div>
    );
  }
  const { p, suggestions } = await asViewer(async (tx) => {
    const p = await getProgressSummary(tx, viewer.id);
    const suggestions = await getRevisionSuggestions(tx, viewer.id, p.weakChapters.map((c) => c.slug));
    return { p, suggestions };
  });

  if (p.submissions === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        {viewer.consentStatus === "pending" && <Notice tone="warning" className="mt-4">Answers aren&apos;t saved until your parent or guardian confirms consent.</Notice>}
        <div className="mt-6">
          <EmptyState icon={<BarChart3 className="size-5" />} title="No submitted answers yet" action={<ButtonLink href="/explore">Start practising</ButtonLink>}>
            Submit answers to see your accuracy, marks by chapter, and what to revise.
          </EmptyState>
        </div>
      </div>
    );
  }

  const byMethod = Object.fromEntries(p.byMethod.map((m) => [m.method, m]));
  const trend = p.trend;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Progress</h1>
      <p className="mt-1 text-ink-2">Built only from your submitted answers. Marks from different sources are kept separate.</p>

      <section aria-label="Summary" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Questions attempted" value={String(p.questionsAttempted)} note={`${p.submissions} submissions`} />
        <Stat
          label="Accuracy"
          value={p.objective.total ? `${pct(p.objective.correct, p.objective.total)}%` : "–"}
          note={p.objective.total ? `${p.objective.correct} of ${p.objective.total} multiple-choice and numerical answers` : "No multiple-choice or numerical answers yet"}
        />
        <Stat label="Solutions viewed" value={String(p.solutionsRevealed)} />
        <Stat label="Waiting for teacher review" value={String(p.pendingHumanReviews)} />
      </section>

      <section aria-labelledby="marks" className="mt-8">
        <h2 id="marks" className="text-lg font-semibold">Marks on written answers</h2>
        <p className="text-sm text-ink-3">Each source is shown separately. AI and self-assessed marks are estimates; only teacher marks have been checked by a person.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(["teacher", "ai", "self"] as const).map((m) => {
            const row = byMethod[m];
            return (
              <div key={m} className="rounded-lg border border-line bg-surface p-4">
                <p className="text-sm text-ink-3">{METHOD_LABELS[m]}</p>
                {row ? (
                  <>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{pct(row.awarded, row.maximum)}%</p>
                    <p className="text-sm text-ink-2">{formatMarks(row.awarded)} of {row.maximum} marks · {row.evaluations} answer{row.evaluations === 1 ? "" : "s"}</p>
                  </>
                ) : (
                  <p className="mt-1 text-ink-3">None yet</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="trend" className="mt-8">
        <h2 id="trend" className="text-lg font-semibold">Recent improvement</h2>
        {trend ? (
          <p className="mt-2 text-ink-2">
            Last 14 days: <strong className="text-ink">{pct(trend.recent.correct, trend.recent.total)}%</strong> correct ({trend.recent.total} answers), compared with{" "}
            <strong className="text-ink">{pct(trend.previous.correct, trend.previous.total)}%</strong> in the 14 days before ({trend.previous.total} answers). These are different
            questions, so treat this as a rough guide.
          </p>
        ) : (
          <p className="mt-2 text-ink-3">Needs at least {MIN_FOR_TREND} multiple-choice or numerical answers in each of the last two fortnights.</p>
        )}
      </section>

      <section aria-labelledby="chapters" className="mt-8">
        <h2 id="chapters" className="text-lg font-semibold">By chapter</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[520px] text-[0.95rem]">
            <thead className="bg-surface-2 text-left text-sm text-ink-2">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Chapter</th>
                <th scope="col" className="px-4 py-2 font-medium">Attempted</th>
                <th scope="col" className="px-4 py-2 font-medium">Accuracy</th>
                <th scope="col" className="px-4 py-2 font-medium">Written answers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {p.chapters.map((c) => (
                <tr key={c.slug}>
                  <th scope="row" className="px-4 py-2 text-left font-medium">
                    <Link href={`/explore?chapter=${c.slug}`} className="hover:underline">{c.name}</Link>
                  </th>
                  <td className="px-4 py-2 tabular-nums">{c.attempted}</td>
                  <td className="px-4 py-2 tabular-nums">{c.objectiveTotal ? `${pct(c.objectiveCorrect, c.objectiveTotal)}% (${c.objectiveTotal})` : "–"}</td>
                  <td className="px-4 py-2 text-sm">
                    {c.marks.length
                      ? c.marks.map((m) => `${pct(m.awarded, m.maximum)}% ${m.method === "ai" ? "AI" : m.method}`).join(" · ")
                      : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.weakChapters.length > 0 ? (
          <p className="mt-2 text-sm text-ink-2">
            Below 60% on multiple-choice and numerical answers: {p.weakChapters.map((c) => c.name).join(", ")}.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-3">Weak chapters are only flagged after at least {MIN_OBJECTIVE_FOR_WEAKNESS} multiple-choice or numerical answers in a chapter.</p>
        )}
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section aria-labelledby="missed">
          <h2 id="missed" className="text-lg font-semibold">Marks you most often lose</h2>
          {p.missedCriteria.length ? (
            <ul className="mt-3 space-y-2">
              {p.missedCriteria.map((m) => (
                <li key={`${m.description}-${m.chapter}`} className="rounded-md border border-line bg-surface px-3 py-2">
                  <p className="text-[0.95rem]">{m.description}</p>
                  <p className="text-xs text-ink-3">{m.chapter} · {m.times} time{m.times === 1 ? "" : "s"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-ink-3">Appears once written answers have been marked against a rubric.</p>
          )}
        </section>
        <section aria-labelledby="mistakes">
          <h2 id="mistakes" className="text-lg font-semibold">Repeated mistake types</h2>
          {p.mistakeCategories.length ? (
            <ul className="mt-3 space-y-2">
              {p.mistakeCategories.map((m) => (
                <li key={m.category} className="flex justify-between rounded-md border border-line bg-surface px-3 py-2">
                  <span>{MISTAKE_LABELS[m.category] ?? m.category}</span>
                  <span className="tabular-nums text-ink-3">{m.times}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-ink-3">Shown when the same kind of mistake happens at least twice.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="suggest" className="mt-8">
        <h2 id="suggest" className="text-lg font-semibold">Suggested revision</h2>
        {suggestions.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.id}>
                <Link href={`/questions/${s.id}`} className="block rounded-md border border-line bg-surface px-3 py-2 hover:border-line-strong">
                  <span className="block text-[0.95rem] font-medium">{s.chapter} · {s.code}</span>
                  <span className="text-xs text-ink-3">{s.reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-ink-3">Nothing specific yet. Keep practising across chapters.</p>
        )}
      </section>

      <p className="mt-10 text-xs text-ink-3">
        We don&apos;t predict board results or label anyone “exam-ready”: we don&apos;t yet have a validated way to do that.
      </p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-sm text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-ink-3">{note}</p>}
    </div>
  );
}
