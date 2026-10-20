import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";
import { canReviewContent } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { TopicVerifier } from "@/components/admin/SmallForms";

export const metadata: Metadata = { title: "Syllabus" };

export default async function SyllabusPage() {
  const { topics, docs, viewer } = await asViewer(async (tx, ctx) => ({
    topics: await tx.select().from(s.syllabusTopics).orderBy(asc(s.syllabusTopics.position)),
    docs: await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.documentType, "syllabus")),
    viewer: ctx.viewer,
  }));
  const chapters = topics.filter((t) => t.kind === "chapter");
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Syllabus</h1>
      {docs.map((d) => (
        <Notice key={d.id} tone={d.verificationStatus === "verified" ? "success" : "warning"} className="mt-4" title={d.title}>
          {d.knownLimitations}
        </Notice>
      ))}
      <p className="mt-4 text-ink-2">Open the official CISCE syllabus document, check each chapter and topic, and record the page number. Verification is recorded under your name.</p>
      <ol className="mt-5 space-y-4">
        {chapters.map((ch) => (
          <li key={ch.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-3">{ch.unitName}</span>
              <h2 className="font-semibold">{ch.name}</h2>
              <Badge tone={ch.verificationStatus === "verified" ? "success" : ch.verificationStatus === "disputed" ? "danger" : "warning"}>{ch.verificationStatus}</Badge>
            </div>
            {canReviewContent(viewer) && <div className="mt-2"><TopicVerifier id={ch.id} status={ch.verificationStatus} page={ch.sourcePage} /></div>}
            <ul className="mt-3 space-y-2 border-l-2 border-line pl-3">
              {topics.filter((t) => t.parentId === ch.id).map((t) => (
                <li key={t.id}>
                  <p className="text-[0.95rem]">{t.name} <Badge tone={t.verificationStatus === "verified" ? "success" : t.verificationStatus === "disputed" ? "danger" : "warning"}>{t.verificationStatus}</Badge></p>
                  {canReviewContent(viewer) && <div className="mt-1"><TopicVerifier id={t.id} status={t.verificationStatus} page={t.sourcePage} /></div>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
