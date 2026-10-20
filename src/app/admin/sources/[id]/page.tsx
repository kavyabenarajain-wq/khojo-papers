import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";
import { Badge } from "@/components/ui/Badge";
import { SourceEditForm } from "@/components/admin/SourceForms";

export const metadata: Metadata = { title: "Source document" };

export default async function SourcePage({ params }: PageProps<"/admin/sources/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asViewer(async (tx) => {
    const [doc] = await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.id, id));
    if (!doc) return null;
    const jobs = await tx.select().from(s.ingestionJobs).where(eq(s.ingestionJobs.sourceDocumentId, id)).orderBy(desc(s.ingestionJobs.createdAt));
    const questions = await tx.select({ id: s.questions.id, code: s.questions.code, status: s.questions.publicationStatus }).from(s.questions).where(eq(s.questions.sourceDocumentId, id));
    const topics = await tx.select({ id: s.syllabusTopics.id }).from(s.syllabusTopics).where(eq(s.syllabusTopics.sourceDocumentId, id));
    return { doc, jobs, questions, topics };
  });
  if (!data) notFound();
  const { doc, jobs, questions, topics } = data;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-3"><Link href="/admin/sources" className="hover:text-ink">Sources</Link></p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{doc.title}</h1>
        <dl className="mt-3 grid grid-cols-[160px_1fr] gap-y-1 text-sm">
          <dt className="text-ink-3">Type</dt><dd>{doc.documentType.replace("_", " ")}</dd>
          <dt className="text-ink-3">Class / exam year / syllabus</dt><dd>{doc.classLevel ?? "—"} / {doc.examinationYear ?? "—"} / {doc.syllabusYear ?? "—"}</dd>
          <dt className="text-ink-3">URL</dt><dd className="break-all">{doc.sourceUrl ? <a href={doc.sourceUrl} target="_blank" rel="noreferrer" className="underline">{doc.sourceUrl}</a> : "—"}</dd>
          <dt className="text-ink-3">Retrieved</dt><dd>{doc.retrievalDate ?? "—"}</dd>
          <dt className="text-ink-3">Stored copy</dt><dd>{doc.storagePath ? "Yes (private)" : "No"}</dd>
          <dt className="text-ink-3">Used by</dt><dd>{questions.length} questions · {topics.length} syllabus topics</dd>
        </dl>
      </div>
      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 font-semibold">Provenance and rights</h2>
        <SourceEditForm id={doc.id} initial={{ verificationStatus: doc.verificationStatus, permissionStatus: doc.permissionStatus, permissionNotes: doc.permissionNotes ?? "", knownLimitations: doc.knownLimitations ?? "", sourceUrl: doc.sourceUrl ?? "", retrievalDate: doc.retrievalDate ?? "" }} />
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Import jobs</h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <Link href={`/admin/ingestion/${j.id}`} className="underline">{j.createdAt.toLocaleString("en-IN")}</Link>
              <Badge tone={j.status === "ready" ? "success" : j.status === "failed" ? "danger" : "warning"}>{j.status}</Badge>
              <span className="text-ink-3">{Object.entries(j.stats).map(([k, v]) => `${k} ${v}`).join(" · ")}</span>
            </li>
          ))}
          {jobs.length === 0 && <li className="px-4 py-2 text-ink-3">No imports.</li>}
        </ul>
      </section>
      {questions.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Questions from this source</h2>
          <ul className="flex flex-wrap gap-2 text-sm">{questions.map((q) => <li key={q.id}><Link href={`/admin/questions/${q.id}`} className="font-mono underline">{q.code}</Link> ({q.status})</li>)}</ul>
        </section>
      )}
    </div>
  );
}
