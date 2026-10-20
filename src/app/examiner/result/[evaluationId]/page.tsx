import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleMinus, HelpCircle } from "lucide-react";
import { asViewer } from "@/lib/dal/context";
import { getEvaluationView } from "@/lib/dal/evaluations";
import { requireViewer } from "@/lib/auth/rbac";
import { Rich } from "@/components/ui/Rich";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { RequestReview } from "@/components/examiner/RequestReview";
import { formatMarks, METHOD_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Your marks" };

export default async function ExaminerResultPage({ params }: PageProps<"/examiner/result/[evaluationId]">) {
  const { evaluationId } = await params;
  await requireViewer(`/examiner/result/${evaluationId}`);
  const v = await asViewer((tx) => getEvaluationView(tx, evaluationId));
  if (!v) notFound();
  const { evaluation: ev, scores, transcript, solution, revision, question, review, teacherEvaluation } = v;
  const studentAnswer = transcript?.confirmedText ?? v.response.answer.text ?? "";
  const s = ev.summary;
  const marksShown = ev.status === "completed" || ev.status === "needs_review";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <p className="text-sm text-ink-3">
        <Link href={`/questions/${question.id}`} className="hover:text-ink">{question.code}</Link> · {METHOD_LABELS[ev.method]} ·{" "}
        {ev.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your marks</h1>

      <section className="mt-4 rounded-lg border border-line bg-surface p-5" aria-labelledby="total">
        <h2 id="total" className="sr-only">Total</h2>
        {marksShown ? (
          <>
            <p className="text-4xl font-semibold tabular-nums">
              {formatMarks(ev.awarded)}
              <span className="text-xl font-normal text-ink-3"> / {ev.maximum}</span>
            </p>
            <p className="mt-1 text-ink-2">
              {ev.method === "ai" ? "AI-estimated against the approved rubric." : METHOD_LABELS[ev.method]}
              {ev.status === "needs_review" && " Provisional: part of this marking is uncertain."}
            </p>
          </>
        ) : ev.status === "not_evaluable" ? (
          <Notice tone="warning" title="This answer couldn't be marked reliably">
            The AI found a problem with the marking rubric for this answer, so it gave no marks rather than invent its own scheme. Our reviewers have been told.
          </Notice>
        ) : (
          <Notice tone="danger" title="Marking didn't complete">
            The AI Examiner couldn&apos;t produce a reliable evaluation, so no marks were given. You can try again, or mark yourself against the rubric.
          </Notice>
        )}
        {s.overallFeedback && <p className="mt-3 text-[0.95rem] text-ink">{s.overallFeedback}</p>}
        {teacherEvaluation && (
          <Notice tone="success" className="mt-3" title={`Teacher-marked: ${formatMarks(teacherEvaluation.awarded)} / ${teacherEvaluation.maximum}`}>
            {teacherEvaluation.summary.overallFeedback ?? "A teacher reviewed this answer."}
          </Notice>
        )}
      </section>

      {s.limitations && s.limitations.length > 0 && (
        <Notice tone="warning" className="mt-4" title="Limitations of this evaluation">
          <ul className="list-disc space-y-1 pl-5">{s.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </Notice>
      )}

      {scores.length > 0 && (
        <section className="mt-6" aria-labelledby="criteria">
          <h2 id="criteria" className="mb-3 text-lg font-semibold">Mark by mark</h2>
          <ol className="space-y-3">
            {scores.map(({ score, criterion }) => {
              const full = score.marksAwarded === score.marksAvailable;
              const none = score.marksAwarded === 0;
              const Icon = score.uncertain ? HelpCircle : full ? CheckCircle2 : none ? CircleMinus : AlertTriangle;
              return (
                <li key={score.id} className="rounded-lg border border-line bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <Icon className={`mt-0.5 size-5 shrink-0 ${score.uncertain ? "text-warning" : full ? "text-success" : none ? "text-danger" : "text-warning"}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">
                          {criterion?.partKey ? `(${criterion.partKey}) ` : ""}
                          {criterion?.description ?? score.criterionKey}
                        </p>
                        <span className="tabular-nums">{formatMarks(score.marksAwarded)} / {formatMarks(score.marksAvailable)}</span>
                      </div>
                      {score.uncertain && <p className="mt-1 text-sm font-medium text-warning">Uncertain: a teacher should check this mark.</p>}
                      {score.evidence && (
                        <p className="mt-2 border-l-2 border-line-strong pl-3 font-mono text-sm text-ink-2">“{score.evidence}”</p>
                      )}
                      {score.reason && <p className="mt-2 text-[0.95rem] text-ink-2">{score.reason}</p>}
                      {score.alternativeMethod && <p className="mt-1 text-sm text-ink-3">Accepted alternative method: {score.alternativeMethod}</p>}
                      {!full && score.feedback && <p className="mt-2 text-[0.95rem] text-ink"><span className="font-semibold">To improve: </span>{score.feedback}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {(s.missingOrIncorrect?.length || s.corrections?.length || s.correctElements?.length) ? (
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {s.correctElements && s.correctElements.length > 0 && (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="font-semibold text-success">What you got right</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">{s.correctElements.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          {(s.missingOrIncorrect?.length || s.corrections?.length) ? (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="font-semibold text-danger">Where marks were lost</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">{[...(s.missingOrIncorrect ?? []), ...(s.corrections ?? [])].map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6 grid gap-4 md:grid-cols-2" aria-labelledby="compare">
        <h2 id="compare" className="sr-only">Your answer compared with the model answer</h2>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="font-semibold">Your answer</h3>
          {transcript?.uploadId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${transcript.uploadId}`} alt="Photo of your handwritten answer" className="mt-2 max-h-80 w-auto max-w-full rounded-md border border-line object-contain" />
          )}
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-sm text-ink-2">{studentAnswer}</pre>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="font-semibold">Model answer</h3>
          {solution ? <Rich source={solution.modelAnswer} variant="question" className="mt-2" /> : <p className="mt-2 text-ink-3">Not available.</p>}
          <Link href={`/questions/${question.id}`} className="mt-3 inline-block text-sm font-medium text-accent-text underline">See the full worked solution</Link>
        </div>
      </section>

      {s.revisionTopic && <p className="mt-4 text-ink-2"><span className="font-semibold text-ink">Revise: </span>{s.revisionTopic}</p>}

      <div className="mt-6 flex flex-wrap items-start gap-3">
        <ButtonLink href={`/examiner/${question.id}`}>Try again</ButtonLink>
        {ev.method === "ai" && marksShown && <RequestReview evaluationId={ev.id} existing={review?.status ?? null} />}
      </div>
      <p className="mt-6 text-xs text-ink-3">
        Marked against rubric revision {ev.rubricRevisionId ? "pinned to this answer" : "n/a"} for question revision {revision.revisionNumber}. AI marks are estimates and may differ from CISCE board marking.
      </p>
    </div>
  );
}
