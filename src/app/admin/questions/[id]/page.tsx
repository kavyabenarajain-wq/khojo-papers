import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";
import { latestRevisions } from "@/lib/dal/editor";
import { runChecksForQuestionRevision } from "@/lib/dal/review";
import { canEditContent, canReviewContent } from "@/lib/auth/rbac";
import { similarity, DUPLICATE_THRESHOLD, questionSearchText } from "@/lib/content/checks";
import { compactDiff, diffLines } from "@/lib/diff";
import { FORMAT_LABELS, SOURCE_LABELS } from "@/lib/labels";
import { renderInline } from "@/lib/content/richtext";
import { QuestionBody } from "@/components/question/QuestionBody";
import { Diagram } from "@/components/diagram/Diagram";
import { Rich } from "@/components/ui/Rich";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { JsonEditor, PermissionForm, PublishControls, ReviewDecision, SubmitForReview, TopicsForm } from "@/components/admin/QuestionAdminControls";

export const metadata: Metadata = { title: "Question" };

type RevStatus = "draft" | "in_review" | "approved" | "rejected" | "superseded";
const STATUS_TONE: Record<RevStatus, "neutral" | "warning" | "success" | "danger"> = { draft: "neutral", in_review: "warning", approved: "success", rejected: "danger", superseded: "neutral" };

export default async function AdminQuestionPage({ params }: PageProps<"/admin/questions/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asViewer(async (tx, ctx) => {
    const [q] = await tx.select().from(s.questions).where(eq(s.questions.id, id));
    if (!q) return null;
    const latest = await latestRevisions(tx, id);
    const checks = latest.question ? await runChecksForQuestionRevision(tx, latest.question.id) : [];
    const qRevs = await tx.select().from(s.questionRevisions).where(eq(s.questionRevisions.questionId, id)).orderBy(desc(s.questionRevisions.revisionNumber));
    const sRevs = await tx.select().from(s.solutionRevisions).where(eq(s.solutionRevisions.questionId, id)).orderBy(desc(s.solutionRevisions.revisionNumber));
    const rRevs = await tx.select().from(s.rubricRevisions).where(eq(s.rubricRevisions.questionId, id)).orderBy(desc(s.rubricRevisions.revisionNumber));
    const chapters = await tx.select().from(s.syllabusTopics).where(eq(s.syllabusTopics.subjectId, q.subjectId)).orderBy(asc(s.syllabusTopics.position));
    const topicIds = (await tx.select().from(s.questionTopics).where(eq(s.questionTopics.questionId, id))).map((t) => t.topicId);
    const [doc] = q.sourceDocumentId ? await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.id, q.sourceDocumentId)) : [];
    const reports = await tx.select().from(s.issueReports).where(eq(s.issueReports.questionId, id)).orderBy(desc(s.issueReports.createdAt));
    const auditRows = await tx.select().from(s.auditLog).where(eq(s.auditLog.entityId, id)).orderBy(desc(s.auditLog.createdAt)).limit(30);
    const siblings = q.chapterId
      ? await tx.select({ id: s.questions.id, code: s.questions.code, text: s.questions.searchText }).from(s.questions).where(and(eq(s.questions.chapterId, q.chapterId), ne(s.questions.id, id)))
      : [];
    const mine = latest.question ? questionSearchText(latest.question.content) : q.searchText;
    const duplicates = siblings.map((x) => ({ ...x, sim: similarity(mine, x.text) })).filter((x) => x.sim >= DUPLICATE_THRESHOLD * 0.75).sort((a, b) => b.sim - a.sim);
    return { q, latest, checks, qRevs, sRevs, rRevs, chapters, topicIds, doc, reports, auditRows, duplicates, viewer: ctx.viewer };
  });
  if (!data) notFound();
  const { q, latest, checks, qRevs, sRevs, rRevs, chapters, topicIds, doc, reports, auditRows, duplicates, viewer } = data;
  const reviewer = canReviewContent(viewer);
  const editor = canEditContent(viewer);
  const lq = latest.question;
  const ls = latest.solution;
  const lr = latest.rubric;
  const errors = checks.filter((c) => c.level === "error");
  const chapterTree = chapters
    .filter((c) => c.kind === "chapter")
    .map((c) => ({ id: c.id, name: c.name, topics: chapters.filter((t) => t.parentId === c.id).map((t) => ({ id: t.id, name: t.name, verified: t.verificationStatus === "verified" })) }));
  const flags = lq?.generation?.flags ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ink-3"><Link href="/admin/questions" className="hover:text-ink">Questions</Link></p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-semibold">{q.code}</h1>
          <Badge tone={q.publicationStatus === "published" ? "success" : q.publicationStatus === "unpublished" ? "danger" : "neutral"}>{q.publicationStatus}</Badge>
          <Badge tone={q.sourceType === "original_practice" ? "original" : q.sourceType === "official_pyq" ? "pyq" : "specimen"}>{SOURCE_LABELS[q.sourceType].short}</Badge>
          {lq?.generation && <Badge>AI-drafted</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-2">
          <Link href={`/questions/${q.id}`} className="underline">Open student view</Link> (unpublished questions need <Link href="/admin/preview" className="underline">preview mode</Link>)
        </p>
      </header>

      {reviewer && (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-2 font-semibold">Publishing</h2>
          <p className="mb-3 text-sm text-ink-2">
            Publishes the newest approved question revision with its approved solution (required) and rubric (optional; needed for AI marking). Published:{" "}
            {q.publishedRevisionId ? `revision ${qRevs.find((r) => r.id === q.publishedRevisionId)?.revisionNumber}` : "none"}.
          </p>
          <PublishControls questionId={q.id} published={q.publicationStatus === "published"} />
        </section>
      )}

      {flags.length > 0 && (
        <Notice tone="warning" title="Author's notes for the reviewer">
          <ul className="list-disc space-y-1 pl-5">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </Notice>
      )}
      {lq?.generation?.note && <p className="text-sm text-ink-3">{lq.generation.note}</p>}

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-2 font-semibold">Automated checks</h2>
        <p className="mb-2 text-sm text-ink-3">These check structure, maths rendering and mark totals. They do not check that the maths is correct.</p>
        {checks.length === 0 ? (
          <p className="text-success">All checks passed.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {checks.map((c, i) => (
              <li key={i} className={c.level === "error" ? "text-danger" : "text-warning"}>
                [{c.level}] {c.field}: {c.message}
              </li>
            ))}
          </ul>
        )}
        {duplicates.length > 0 && (
          <div className="mt-3 text-sm">
            <p className="font-medium">Similar questions in this chapter</p>
            <ul className="mt-1 space-y-0.5">
              {duplicates.map((d) => (
                <li key={d.id}><Link href={`/admin/questions/${d.id}`} className="font-mono underline">{d.code}</Link> similarity {d.sim.toFixed(2)}{d.sim >= DUPLICATE_THRESHOLD ? " (likely duplicate)" : ""}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Provenance and rights</h2>
          <dl className="mb-3 grid grid-cols-[140px_1fr] gap-y-1 text-sm">
            <dt className="text-ink-3">Source type</dt><dd>{SOURCE_LABELS[q.sourceType].long}</dd>
            <dt className="text-ink-3">Source document</dt>
            <dd>{doc ? <Link href={`/admin/sources/${doc.id}`} className="underline">{doc.title}</Link> : "—"}</dd>
            <dt className="text-ink-3">Page / number</dt><dd>{q.sourcePage ?? "—"} / {q.sourceQuestionNumber ?? "—"}</dd>
            <dt className="text-ink-3">Exam year</dt><dd>{q.examYear ?? "—"}</dd>
            <dt className="text-ink-3">Syllabus year</dt><dd>{q.syllabusYear}</dd>
            {doc?.sourceUrl && (<><dt className="text-ink-3">Source URL</dt><dd><a href={doc.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">{doc.sourceUrl}<ExternalLink className="size-3" aria-hidden /></a></dd></>)}
          </dl>
          <PermissionForm questionId={q.id} current={q.permissionStatus} />
        </section>
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Syllabus mapping</h2>
          <TopicsForm questionId={q.id} chapters={chapterTree} chapterId={q.chapterId} topicIds={topicIds} />
        </section>
      </div>

      {/* Question */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <RevisionHeader title="Question" rev={lq} />
        {lq && (
          <>
            <p className="mb-3 text-sm text-ink-3">{FORMAT_LABELS[lq.answerFormat]} · {lq.marks} marks · difficulty (author estimate): {lq.difficulty ?? "—"}</p>
            <div className="rounded-md border border-line p-4"><QuestionBody content={lq.content} /></div>
            {lq.content.options && (
              <ol className="mt-3 space-y-1">{lq.content.options.map((o) => <li key={o.key} className="flex gap-2"><span>({o.key})</span><span dangerouslySetInnerHTML={{ __html: renderInline(o.text) }} /></li>)}</ol>
            )}
            {lq.content.parts && (
              <ol className="mt-3 space-y-2">{lq.content.parts.map((p) => <li key={p.key} className="flex gap-2"><span className="font-semibold">({p.key})</span><span className="flex-1" dangerouslySetInnerHTML={{ __html: renderInline(p.prompt) }} /><span className="text-sm text-ink-3">[{p.marks}] {FORMAT_LABELS[p.format as keyof typeof FORMAT_LABELS]}</span></li>)}</ol>
            )}
            <div className="mt-3 rounded-md bg-surface-2 p-3 text-sm">
              <p className="font-medium">Answer key (used only for automatic checking)</p>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{JSON.stringify(lq.answerKey, null, 2)}</pre>
              {lq.hints.length > 0 && <><p className="mt-2 font-medium">Hints</p><ul className="list-disc pl-5">{lq.hints.map((h) => <li key={h} dangerouslySetInnerHTML={{ __html: renderInline(h) }} />)}</ul></>}
            </div>
            <Actions kind="question" rev={lq} reviewer={reviewer} editor={editor} blockApprove={errors.length > 0} />
            {editor && (
              <div className="mt-3">
                <JsonEditor
                  questionId={q.id}
                  kind="question"
                  initial={{ answerFormat: lq.answerFormat, marks: lq.marks, difficulty: lq.difficulty, content: lq.content, answerKey: lq.answerKey, hints: lq.hints, changeNote: "" }}
                  help="Saving edits the current draft, or creates a new draft revision if the latest is approved. The solution and rubric are carried forward and must be reviewed again."
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* Solution */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <RevisionHeader title="Worked solution" rev={ls} extra={ls && lq && ls.questionRevisionId !== lq.id ? "written for an older question revision" : undefined} />
        {ls && (
          <>
            <ol className="space-y-4">
              {ls.steps.map((st) => (
                <li key={st.n} className="border-l-2 border-line pl-3">
                  <p className="text-sm font-semibold">Step {st.n}{st.partKey ? ` · part (${st.partKey})` : ""}{st.title ? ` · ${st.title}` : ""}{st.isFinal ? " · final" : ""}</p>
                  {st.expression && <Rich source={`\\[${st.expression}\\]`} />}
                  <Rich source={st.explanation} />
                  {st.rule && <p className="text-sm text-ink-2">Rule: <span dangerouslySetInnerHTML={{ __html: renderInline(st.rule) }} /></p>}
                  {st.reason && <p className="text-sm text-ink-2">Why: <span dangerouslySetInnerHTML={{ __html: renderInline(st.reason) }} /></p>}
                  {st.result && <Rich source={`\\[\\boxed{${st.result}}\\]`} />}
                  {st.diagramId && lq?.content.diagrams?.find((d) => d.id === st.diagramId) && (
                    <div className="mt-2 max-w-sm"><Diagram diagram={lq.content.diagrams.find((d) => d.id === st.diagramId)!} visibleStep={st.n} /></div>
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-md bg-surface-2 p-3"><p className="text-sm font-medium">Model answer</p><Rich source={ls.modelAnswer} /></div>
              <div className="rounded-md bg-surface-2 p-3"><p className="text-sm font-medium">Final answer</p><Rich source={ls.finalAnswer} /></div>
            </div>
            {ls.commonMistakes.length > 0 && <div className="mt-3 text-sm"><p className="font-medium">Common mistakes</p><ul className="list-disc pl-5">{ls.commonMistakes.map((m) => <li key={m} dangerouslySetInnerHTML={{ __html: renderInline(m) }} />)}</ul></div>}
            {ls.alternativeMethods.length > 0 && <div className="mt-3 text-sm"><p className="font-medium">Alternative methods</p>{ls.alternativeMethods.map((m) => <div key={m.title}><p>{m.title}</p><Rich source={m.description} /></div>)}</div>}
            <Actions kind="solution" rev={ls} reviewer={reviewer} editor={editor} blockApprove={false} />
            {editor && (
              <div className="mt-3">
                <JsonEditor questionId={q.id} kind="solution" initial={{ modelAnswer: ls.modelAnswer, finalAnswer: ls.finalAnswer, steps: ls.steps, commonMistakes: ls.commonMistakes, alternativeMethods: ls.alternativeMethods, changeNote: "" }} help="Saves a solution draft for the newest question revision." />
              </div>
            )}
          </>
        )}
      </section>

      {/* Rubric */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <RevisionHeader title="Marking rubric" rev={lr} extra={lr && lq && lr.questionRevisionId !== lq.id ? "written for an older question revision" : undefined} />
        {lr && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-ink-3"><tr><th className="py-1 pr-2">Key</th><th className="pr-2">Part</th><th className="pr-2">Criterion</th><th className="pr-2">Marks</th><th className="pr-2">Expected evidence</th><th>Alternatives / partial credit / errors</th></tr></thead>
                <tbody className="divide-y divide-line align-top">
                  {latest.criteria.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-2 font-mono text-xs">{c.criterionKey}</td>
                      <td className="pr-2">{c.partKey ?? "—"}</td>
                      <td className="pr-2" dangerouslySetInnerHTML={{ __html: renderInline(c.description) }} />
                      <td className="pr-2 tabular-nums">{c.marksAvailable}</td>
                      <td className="pr-2" dangerouslySetInnerHTML={{ __html: renderInline(c.expectedEvidence) }} />
                      <td className="text-ink-2">
                        {c.acceptedAlternatives.length > 0 && <p>Also: {c.acceptedAlternatives.join("; ")}</p>}
                        {c.partialCreditRules && <p>Partial: {c.partialCreditRules}</p>}
                        {c.commonErrors.length > 0 && <p>No credit: {c.commonErrors.join("; ")}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-ink-3">Total {latest.criteria.reduce((a, c) => a + c.marksAvailable, 0)} of {lq?.marks} marks. These criteria are not official CISCE marking schemes.</p>
            <Actions kind="rubric" rev={lr} reviewer={reviewer} editor={editor} blockApprove={false} />
            {editor && (
              <div className="mt-3">
                <JsonEditor
                  questionId={q.id}
                  kind="rubric"
                  initial={{ notes: lr.notes, criteria: latest.criteria.map((c) => ({ key: c.criterionKey, partKey: c.partKey ?? undefined, description: c.description, marks: c.marksAvailable, expectedEvidence: c.expectedEvidence, acceptedAlternatives: c.acceptedAlternatives, partialCreditRules: c.partialCreditRules ?? undefined, commonErrors: c.commonErrors })), changeNote: "" }}
                  help="Criteria marks must add up to the question's marks (and each part's marks)."
                />
              </div>
            )}
          </>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 font-semibold">Revision history</h2>
        <History label="Question" revs={qRevs} publishedId={q.publishedRevisionId} snapshot={(r) => JSON.stringify({ format: r.answerFormat, marks: r.marks, content: r.content, answerKey: r.answerKey, hints: r.hints }, null, 2)} />
        <History label="Solution" revs={sRevs} publishedId={q.publishedSolutionId} snapshot={(r) => JSON.stringify({ modelAnswer: r.modelAnswer, finalAnswer: r.finalAnswer, steps: r.steps, commonMistakes: r.commonMistakes }, null, 2)} />
        <History label="Rubric" revs={rRevs} publishedId={q.publishedRubricId} snapshot={(r) => JSON.stringify({ totalMarks: r.totalMarks, notes: r.notes }, null, 2)} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-2 font-semibold">Issue reports</h2>
          {reports.length === 0 ? <p className="text-sm text-ink-3">None.</p> : (
            <ul className="space-y-2 text-sm">{reports.map((r) => <li key={r.id}><Badge tone={r.status === "open" ? "warning" : "neutral"}>{r.status}</Badge> <span className="font-medium">{r.category.replace("_", " ")}</span>: {r.message}</li>)}</ul>
          )}
        </section>
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-2 font-semibold">Audit trail</h2>
          {auditRows.length === 0 ? <p className="text-sm text-ink-3">No question-level events yet.</p> : (
            <ul className="space-y-1 text-sm">{auditRows.map((a) => <li key={a.id}><span className="text-ink-3">{a.createdAt.toLocaleString("en-IN")}</span> {a.action}</li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}

function RevisionHeader({ title, rev, extra }: { title: string; rev: { revisionNumber: number; status: RevStatus; changeNote: string | null; reviewedAt: Date | null; reviewNote: string | null } | null; extra?: string }) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        {rev ? (
          <>
            <Badge tone={STATUS_TONE[rev.status]}>rev {rev.revisionNumber} · {rev.status.replace("_", " ")}</Badge>
            {extra && <Badge tone="warning">{extra}</Badge>}
          </>
        ) : (
          <Badge tone="danger">missing</Badge>
        )}
      </div>
      {rev?.changeNote && <p className="text-sm text-ink-3">Change: {rev.changeNote}</p>}
      {rev?.reviewNote && <p className="text-sm text-ink-3">Reviewer note: {rev.reviewNote}</p>}
    </div>
  );
}

function Actions({ kind, rev, reviewer, editor, blockApprove }: { kind: "question" | "solution" | "rubric"; rev: { id: string; status: RevStatus }; reviewer: boolean; editor: boolean; blockApprove: boolean }) {
  return (
    <div className="mt-3 space-y-2">
      {rev.status === "in_review" && reviewer && (blockApprove ? <Notice tone="danger">Fix the automated-check errors before approving.</Notice> : null)}
      {rev.status === "in_review" && reviewer && <ReviewDecision kind={kind} id={rev.id} label={kind} />}
      {rev.status === "draft" && editor && <SubmitForReview kind={kind} id={rev.id} />}
    </div>
  );
}

function History<T extends { id: string; revisionNumber: number; status: RevStatus; createdAt: Date; reviewedAt: Date | null; changeNote: string | null }>({
  label,
  revs,
  publishedId,
  snapshot,
}: {
  label: string;
  revs: T[];
  publishedId: string | null;
  snapshot: (r: T) => string;
}) {
  return (
    <details className="mb-3">
      <summary className="min-h-9 cursor-pointer font-medium">{label} ({revs.length})</summary>
      <ol className="mt-2 space-y-3">
        {revs.map((r, i) => {
          const prev = revs[i + 1];
          const diff = prev ? compactDiff(diffLines(snapshot(prev), snapshot(r))) : null;
          return (
            <li key={r.id} className="rounded-md border border-line p-3 text-sm">
              <p>
                <span className="font-semibold">rev {r.revisionNumber}</span> · {r.status.replace("_", " ")}
                {r.id === publishedId && <Badge tone="success" className="ml-2">published</Badge>} · created {r.createdAt.toLocaleDateString("en-IN")}
                {r.reviewedAt && ` · reviewed ${r.reviewedAt.toLocaleDateString("en-IN")}`}
              </p>
              {r.changeNote && <p className="text-ink-3">{r.changeNote}</p>}
              {diff && diff.some((d) => d.kind === "add" || d.kind === "del") && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-ink-2">Changes from rev {prev!.revisionNumber}</summary>
                  <pre className="mt-1 max-h-80 overflow-auto rounded bg-surface-2 p-2 font-mono text-xs">
                    {diff.map((d, k) =>
                      d.kind === "gap" ? <div key={k} className="text-ink-3">⋯</div> : <div key={k} className={d.kind === "add" ? "bg-success-soft" : d.kind === "del" ? "bg-danger-soft line-through" : ""}>{d.kind === "add" ? "+ " : d.kind === "del" ? "- " : "  "}{d.text}</div>,
                    )}
                  </pre>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
