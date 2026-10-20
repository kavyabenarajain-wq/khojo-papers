import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";
import { canEditContent } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { CandidateActions } from "@/components/admin/SourceForms";

export const metadata: Metadata = { title: "Import review" };

export default async function IngestionPage({ params }: PageProps<"/admin/ingestion/[jobId]">) {
  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) notFound();
  const data = await asViewer(async (tx, ctx) => {
    const [job] = await tx.select().from(s.ingestionJobs).where(eq(s.ingestionJobs.id, jobId));
    if (!job) return null;
    const [doc] = await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.id, job.sourceDocumentId));
    const pages = await tx.select().from(s.extractedPages).where(eq(s.extractedPages.jobId, jobId)).orderBy(asc(s.extractedPages.pageNumber));
    const candidates = await tx.select().from(s.extractionCandidates).where(eq(s.extractionCandidates.jobId, jobId)).orderBy(asc(s.extractionCandidates.pageNumber));
    const chapters = await tx.select({ id: s.syllabusTopics.id, name: s.syllabusTopics.name }).from(s.syllabusTopics).where(eq(s.syllabusTopics.kind, "chapter")).orderBy(asc(s.syllabusTopics.position));
    return { job, doc, pages, candidates, chapters, editor: canEditContent(ctx.viewer) };
  });
  if (!data) notFound();
  const { job, doc, pages, candidates, chapters, editor } = data;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-3"><Link href={`/admin/sources/${doc.id}`} className="hover:text-ink">{doc.title}</Link></p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Import review</h1>
        <p className="mt-1 text-sm text-ink-2">
          Status <Badge tone={job.status === "ready" ? "success" : job.status === "failed" ? "danger" : "warning"}>{job.status}</Badge>{" "}
          {Object.entries(job.stats).map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </p>
        {job.status === "processing" && <Notice className="mt-3">Still processing. Refresh in a minute.</Notice>}
        {job.error && <Notice tone="danger" className="mt-3">{job.error}</Notice>}
        <Notice className="mt-3" title="How to use this">
          Candidates are automatic guesses. Compare each with the original page, correct the text and maths, and only then create a draft question.
          Drafts still need academic review and cleared rights before publishing.
        </Notice>
      </div>
      {pages.filter((p) => p.needsReview).length > 0 && (
        <Notice tone="warning" title="Pages needing attention">
          <ul className="list-disc pl-5">{pages.filter((p) => p.needsReview).map((p) => <li key={p.id}>Page {p.pageNumber} ({p.method}, confidence {p.confidence ?? 0}): {p.note ?? "low confidence"}</li>)}</ul>
        </Notice>
      )}
      <ol className="space-y-4">
        {candidates.map((c) => (
          <li key={c.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">Page {c.pageNumber}{c.questionNumber ? ` · Q${c.questionNumber}` : ""}</span>
              <Badge tone={c.confidence >= 0.75 ? "success" : c.confidence >= 0.5 ? "warning" : "danger"}>confidence {c.confidence}</Badge>
              {c.detectedMarks !== null && <Badge>{c.detectedMarks} marks detected</Badge>}
              {c.flags.map((f) => <Badge key={f}>{f.replace(/_/g, " ")}</Badge>)}
              <Badge tone={c.status === "pending" ? "warning" : "neutral"}>{c.status}</Badge>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-2 p-2 font-mono text-xs">{c.rawText}</pre>
              {doc.storagePath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/admin/sources/${doc.id}/page/${c.pageNumber}`} alt={`Original page ${c.pageNumber}`} loading="lazy" className="max-h-80 w-full rounded border border-line object-contain" />
              ) : (
                <p className="text-sm text-ink-3">No stored copy to compare against.</p>
              )}
            </div>
            {c.status === "pending" && editor && <div className="mt-3"><CandidateActions id={c.id} chapters={chapters} defaultMarks={c.detectedMarks} rawText={c.rawText} /></div>}
            {c.questionId && <p className="mt-2 text-sm"><Link href={`/admin/questions/${c.questionId}`} className="underline">Draft question created</Link></p>}
          </li>
        ))}
        {candidates.length === 0 && job.status === "ready" && <p className="text-ink-3">No question boundaries were detected. Add questions manually from the extracted text.</p>}
      </ol>
      <details className="rounded-lg border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">Extracted text by page</summary>
        {pages.map((p) => (
          <div key={p.id} className="mt-3">
            <p className="text-sm font-medium">Page {p.pageNumber} · {p.method}</p>
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-surface-2 p-2 font-mono text-xs">{p.text || "(no text)"}</pre>
          </div>
        ))}
      </details>
    </div>
  );
}
