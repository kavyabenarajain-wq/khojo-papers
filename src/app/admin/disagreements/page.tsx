import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, inArray } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";
import { canReviewContent } from "@/lib/auth/rbac";
import { formatMarks } from "@/lib/labels";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { TeacherMarkForm } from "@/components/admin/TeacherMarkForm";

export const metadata: Metadata = { title: "Teacher reviews" };

export default async function DisagreementsPage() {
  const data = await asViewer(async (tx, ctx) => {
    if (!canReviewContent(ctx.viewer)) return null;
    const reqs = await tx.select().from(s.humanReviewRequests).orderBy(asc(s.humanReviewRequests.status), desc(s.humanReviewRequests.createdAt)).limit(50);
    const evIds = reqs.flatMap((r) => [r.evaluationId, r.teacherEvaluationId].filter(Boolean) as string[]);
    const evals = evIds.length ? await tx.select().from(s.evaluations).where(inArray(s.evaluations.id, evIds)) : [];
    const respIds = evals.map((e) => e.responseId);
    const resps = respIds.length ? await tx.select().from(s.responses).where(inArray(s.responses.id, respIds)) : [];
    const transcripts = respIds.length ? await tx.select().from(s.transcripts).where(inArray(s.transcripts.responseId, respIds)) : [];
    const scores = evIds.length ? await tx.select().from(s.criterionScores).where(inArray(s.criterionScores.evaluationId, evIds)) : [];
    const rubricIds = resps.map((r) => r.rubricRevisionId).filter(Boolean) as string[];
    const criteria = rubricIds.length ? await tx.select().from(s.rubricCriteria).where(inArray(s.rubricCriteria.rubricRevisionId, rubricIds)).orderBy(asc(s.rubricCriteria.position)) : [];
    const qIds = resps.map((r) => r.questionId);
    const qs = qIds.length ? await tx.select({ id: s.questions.id, code: s.questions.code }).from(s.questions).where(inArray(s.questions.id, qIds)) : [];
    return { reqs, evals, resps, transcripts, scores, criteria, qs };
  });
  if (!data) return <Notice tone="warning">Only teacher reviewers and administrators can mark student answers.</Notice>;
  const { reqs, evals, resps, transcripts, scores, criteria, qs } = data;

  const resolved = reqs.filter((r) => r.status === "resolved" && r.teacherEvaluationId);
  const diffs = resolved.map((r) => {
    const ai = evals.find((e) => e.id === r.evaluationId)?.awarded ?? null;
    const t = evals.find((e) => e.id === r.teacherEvaluationId)?.awarded ?? null;
    return ai != null && t != null ? t - ai : null;
  }).filter((d): d is number => d !== null);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Teacher reviews</h1>
      <p className="mt-1 text-ink-2">
        Answers the AI was unsure about, or that students asked a teacher to check. You see only answers sent for review. Viewing a student&apos;s photo is recorded in the audit log.
      </p>
      {diffs.length > 0 && (
        <p className="mt-3 text-sm text-ink-2">
          Across {diffs.length} re-marked answers: teacher − AI averages {(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2)} marks; AI higher in {diffs.filter((d) => d < 0).length}, lower in {diffs.filter((d) => d > 0).length}, equal in {diffs.filter((d) => d === 0).length}.
          These are not a random sample, so they don&apos;t measure overall accuracy; use the benchmark set for that.
        </p>
      )}
      {reqs.length === 0 ? <div className="mt-6"><EmptyState title="No answers waiting for a teacher" /></div> : (
        <ul className="mt-5 space-y-5">
          {reqs.map((r) => {
            const ai = evals.find((e) => e.id === r.evaluationId);
            const resp = resps.find((x) => x.id === ai?.responseId);
            const tr = transcripts.filter((t) => t.responseId === resp?.id).sort((a, b) => +b.createdAt - +a.createdAt)[0];
            const crit = criteria.filter((c) => c.rubricRevisionId === resp?.rubricRevisionId);
            const aiScores = scores.filter((x) => x.evaluationId === ai?.id);
            const teacher = evals.find((e) => e.id === r.teacherEvaluationId);
            const code = qs.find((q) => q.id === resp?.questionId)?.code;
            return (
              <li key={r.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={r.status === "open" ? "warning" : "success"}>{r.status}</Badge>
                  <Badge>{r.source === "student" ? "requested by student" : "AI uncertain"}</Badge>
                  {resp && <Link href={`/admin/questions/${resp.questionId}`} className="font-mono underline">{code}</Link>}
                  <span className="text-ink-3">{r.createdAt.toLocaleString("en-IN")}</span>
                  <span className="ml-auto">AI: {formatMarks(ai?.awarded)} / {ai?.maximum}{teacher ? ` · Teacher: ${formatMarks(teacher.awarded)}` : ""}</span>
                </div>
                {r.reason && <p className="mt-2 text-sm text-ink-2">Reason: {r.reason}</p>}
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="text-sm font-semibold">Student answer</p>
                    {tr?.uploadId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/files/${tr.uploadId}`} alt="Student's handwritten answer" className="mt-2 max-h-96 w-auto max-w-full rounded border border-line object-contain" />
                    )}
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-surface-2 p-2 font-mono text-xs">{tr?.confirmedText ?? resp?.answer.text ?? "—"}</pre>
                    {tr && tr.aiText !== tr.confirmedText && <p className="mt-1 text-xs text-ink-3">The student edited the AI transcript (edit distance {tr.editDistance}).</p>}
                    <p className="mt-3 text-sm font-semibold">AI marking</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {aiScores.map((x) => (
                        <li key={x.id}>
                          <span className="font-mono text-xs">{x.criterionKey}</span> {formatMarks(x.marksAwarded)}/{formatMarks(x.marksAvailable)}{x.uncertain ? " (uncertain)" : ""} — {x.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    {r.status === "open" ? (
                      <TeacherMarkForm requestId={r.id} criteria={crit.map((c) => ({ key: c.criterionKey, description: c.description, marks: c.marksAvailable, aiMarks: aiScores.find((x) => x.criterionKey === c.criterionKey)?.marksAwarded ?? null }))} />
                    ) : (
                      <p className="text-sm text-ink-2">Resolved {r.resolvedAt?.toLocaleString("en-IN")}. {teacher?.summary.overallFeedback}</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
