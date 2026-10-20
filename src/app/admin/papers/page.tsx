import type { Metadata } from "next";
import Link from "next/link";
import { asViewer } from "@/lib/dal/context";
import { listPapers } from "@/lib/dal/papers";
import { canReviewContent } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/Badge";
import { PaperPublishButton } from "@/components/admin/SmallForms";

export const metadata: Metadata = { title: "Papers" };

export default async function AdminPapers() {
  const { papers, viewer } = await asViewer(async (tx, ctx) => ({ papers: await listPapers(tx, { preview: true, userId: null }), viewer: ctx.viewer }));
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Papers</h1>
      <p className="mt-1 text-ink-2">A paper can be published only when every question in it is published.</p>
      <ul className="mt-5 divide-y divide-line rounded-lg border border-line bg-surface">
        {papers.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Link href={`/papers/${p.slug}`} className="font-medium underline">{p.title}</Link>
            <Badge>{p.paperType.replace("_", " ")}</Badge>
            <Badge tone={p.publicationStatus === "published" ? "success" : "neutral"}>{p.publicationStatus}</Badge>
            <span className="text-sm text-ink-3">{p.questionCount} questions · {p.maximumMarks ?? "?"} marks · {p.durationMinutes ?? "?"} min</span>
            {canReviewContent(viewer) && <span className="ml-auto"><PaperPublishButton paperId={p.id} published={p.publicationStatus === "published"} /></span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
