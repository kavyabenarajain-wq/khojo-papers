import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";
import { canEditContent } from "@/lib/auth/rbac";
import { NewQuestionForm } from "@/components/admin/NewQuestionForm";
import { Notice } from "@/components/ui/Notice";

export const metadata: Metadata = { title: "New question" };

export default async function NewQuestionPage() {
  const { chapters, sources, viewer } = await asViewer(async (tx, ctx) => ({
    chapters: await tx.select({ id: s.syllabusTopics.id, name: s.syllabusTopics.name }).from(s.syllabusTopics).where(eq(s.syllabusTopics.kind, "chapter")).orderBy(asc(s.syllabusTopics.position)),
    sources: await tx.select({ id: s.sourceDocuments.id, title: s.sourceDocuments.title }).from(s.sourceDocuments),
    viewer: ctx.viewer,
  }));
  if (!canEditContent(viewer)) return <Notice tone="warning">Only content editors can create questions.</Notice>;
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">New question</h1>
      <p className="mt-1 text-ink-2">Creates an unpublished draft. Official questions must be linked to their source document and need cleared publication rights before they can be published.</p>
      <div className="mt-5 rounded-lg border border-line bg-surface p-5"><NewQuestionForm chapters={chapters} sources={sources} /></div>
    </div>
  );
}
