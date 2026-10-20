import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleDashed, MinusCircle, XCircle } from "lucide-react";
import { asViewer } from "@/lib/dal/context";
import { getExamResult } from "@/lib/dal/papers";
import { getRubricById } from "@/lib/dal/questions";
import { requireViewer } from "@/lib/auth/rbac";
import { buildRubric } from "@/lib/content/payloads";
import { integrations } from "@/lib/env";
import { formatMarks, METHOD_LABELS } from "@/lib/labels";
import { SelfAssessment } from "@/components/solve/SelfAssessment";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export const metadata: Metadata = { title: "Paper results" };

export default async function ResultsPage({ params, searchParams }: PageProps<"/papers/[slug]/results/[attemptId]">) {
  const { slug, attemptId } = await params;
  const { timeout } = await searchParams;
  const viewer = await requireViewer(`/papers/${slug}/results/${attemptId}`);
  const data = await asViewer(async (tx) => {
    const r = await getExamResult(tx, viewer.id, attemptId);
    if (!r) return null;
    const rubrics = await Promise.all(
      r.items.filter((i) => i.answered && !i.evaluation && i.rubricRevisionId).map(async (i) => [i.responseId, await getRubricById(tx, i.rubricRevisionId!)] as const),
    );
    return { ...r, rubrics: new Map(rubrics) };
  });
  if (!data || data.view.paper.slug !== slug) notFound();
  const { view, items, totals, rubrics } = data;
  if (view.attempt.status !== "submitted") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Notice title="This paper hasn't been submitted yet">
          <Link className="font-medium underline" href={`/papers/${slug}/attempt/${attemptId}`}>Return to the paper</Link>
        </Notice>
      </div>
    );
  }
  const incorrect = items.filter((i) => i.evaluation && i.evaluation.awarded !== null && i.evaluation.awarded < i.evaluation.maximum);
  const pendingItems = items.filter((i) => i.answered && !i.evaluation);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <p className="text-sm text-ink-3">
        <Link href={`/papers/${slug}`} className="hover:text-ink">{view.paper.title}</Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Your result</h1>
      <p className="mt-1 text-sm text-ink-3">
        Submitted {view.attempt.submittedAt?.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        {timeout ? " · time ran out, so your saved answers were submitted" : ""}
      </p>

      <section aria-labelledby="score" className="mt-5 rounded-lg border border-line bg-surface p-5">
        <h2 id="score" className="sr-only">Score</h2>
        <p className="text-4xl font-semibold tabular-nums">
          {formatMarks(totals.awarded)}
          <span className="text-xl font-normal text-ink-3"> / {totals.maximum}</span>
        </p>
        <p className="mt-1 text-ink-2">
          Marks confirmed so far.
          {totals.pending > 0 && ` Up to ${totals.pending} more marks are waiting for your written answers to be marked.`}
        </p>
        {totals.provisional && (
          <p className="mt-2 text-sm text-ink-3">Which answers count in “any N” sections may change once the remaining answers are marked.</p>
        )}
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {totals.sections.map((s) => (
            <li key={s.id} className="rounded-md bg-surface-2 px-3 py-2">
              <p className="font-medium">{s.label}</p>
              <p className="text-sm text-ink-2">
                {formatMarks(s.awarded)} / {s.maximum}
                {s.pending > 0 && ` · ${s.pending} pending`}
              </p>
              {s.overAttempted && <p className="text-xs text-ink-3">You answered {s.answeredCount}; your best {s.required} count (this practice set&apos;s rule).</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-3">Multiple-choice and numerical answers are checked against the verified answer key. Written answers are marked against the rubric by you or the AI Examiner, and labelled accordingly.</p>
      </section>

      <section aria-labelledby="items" className="mt-6">
        <h2 id="items" className="mb-3 text-lg font-semibold">Question by question</h2>
        <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((i) => {
            const e = i.evaluation;
            const icon = !i.answered ? MinusCircle : !e ? CircleDashed : e.awarded === e.maximum ? CheckCircle2 : XCircle;
            const tone = !i.answered ? "text-ink-3" : !e ? "text-ink-3" : e.awarded === e.maximum ? "text-success" : "text-danger";
            const Icon = icon;
            return (
              <li key={i.itemId} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <Icon className={`mt-0.5 size-5 shrink-0 ${tone}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/questions/${i.questionId}`} className="font-medium hover:underline">Question {i.displayNumber}</Link>
                      <span className="text-sm tabular-nums">
                        {!i.answered ? "Not answered" : e ? `${formatMarks(e.awarded)} / ${e.maximum}` : `– / ${i.marks}`}
                      </span>
                    </div>
                    {e && <p className="text-xs text-ink-3">{METHOD_LABELS[e.method as keyof typeof METHOD_LABELS]}{!i.counted ? " · not counted" : ""}</p>}
                    {e?.feedback && <p className="mt-1 text-sm text-ink-2">{e.feedback}</p>}
                    {i.answered && !e && <p className="mt-1 text-sm text-ink-2">Marked on working. Mark it yourself below{integrations.ai ? " or ask the AI Examiner" : ""}.</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ButtonLink href={`/questions/${i.questionId}`} variant="ghost" size="sm">See worked solution</ButtonLink>
                      {i.answered && !e && i.rubricRevisionId && integrations.ai && (
                        <ButtonLink href={`/examiner/${i.questionId}?response=${i.responseId}`} variant="secondary" size="sm">Check with AI Examiner</ButtonLink>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {pendingItems.length > 0 && (
        <section aria-labelledby="mark-yourself" className="mt-8 space-y-4">
          <h2 id="mark-yourself" className="text-lg font-semibold">Mark your written answers</h2>
          {pendingItems.map((i) => {
            const r = rubrics.get(i.responseId);
            return r ? (
              <div key={i.responseId}>
                <p className="mb-2 font-medium">Question {i.displayNumber}</p>
                <SelfAssessment responseId={i.responseId} rubric={buildRubric(r)} />
              </div>
            ) : null;
          })}
        </section>
      )}

      {incorrect.length > 0 && (
        <section aria-labelledby="revisit" className="mt-8">
          <h2 id="revisit" className="text-lg font-semibold">Revisit</h2>
          <p className="mb-2 text-sm text-ink-3">Questions where you lost marks.</p>
          <ul className="flex flex-wrap gap-2">
            {incorrect.map((i) => (
              <li key={i.itemId}>
                <ButtonLink href={`/questions/${i.questionId}`} variant="secondary" size="sm">Question {i.displayNumber}</ButtonLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
