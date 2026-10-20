import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";
import { canEditContent } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/Badge";
import { SourceUploadForm } from "@/components/admin/SourceForms";

export const metadata: Metadata = { title: "Sources and import" };

export default async function SourcesPage() {
  const { docs, viewer } = await asViewer(async (tx, ctx) => ({ docs: await tx.select().from(s.sourceDocuments).orderBy(desc(s.sourceDocuments.createdAt)), viewer: ctx.viewer }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sources and import</h1>
        <p className="mt-1 text-ink-2">Every official question must trace back to a source document with its URL, year, page and publication rights. Public availability doesn&apos;t mean we may republish it.</p>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <Link href={`/admin/sources/${d.id}`} className="font-medium underline">{d.title}</Link>
            <Badge>{d.documentType.replace("_", " ")}</Badge>
            <Badge tone={d.verificationStatus === "verified" ? "success" : "warning"}>{d.verificationStatus}</Badge>
            <Badge tone={["licensed", "own_content"].includes(d.permissionStatus) ? "success" : "neutral"}>{d.permissionStatus.replace("_", " ")}</Badge>
            {d.storagePath && <Badge>file stored</Badge>}
          </li>
        ))}
        {docs.length === 0 && <li className="px-4 py-3 text-ink-3">No source documents yet.</li>}
      </ul>
      {canEditContent(viewer) && (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Add a source document</h2>
          <SourceUploadForm />
        </section>
      )}
    </div>
  );
}
