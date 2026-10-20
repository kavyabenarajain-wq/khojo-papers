import type { Metadata } from "next";
import Link from "next/link";
import { asViewer } from "@/lib/dal/context";
import { adminQuestionList } from "@/lib/dal/admin";
import { canEditContent } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { SOURCE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Questions" };

export default async function AdminQuestions({ searchParams }: PageProps<"/admin/questions">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const { list, viewer } = await asViewer(async (tx, ctx) => ({ list: await adminQuestionList(tx, { status, q }), viewer: ctx.viewer }));
  const tabs = [["", "All"], ["draft", "Draft"], ["published", "Published"], ["unpublished", "Unpublished"]];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Questions</h1>
        {canEditContent(viewer) && <ButtonLink href="/admin/questions/new" size="sm">New question</ButtonLink>}
      </div>
      <form className="mt-4 flex flex-wrap gap-2" action="/admin/questions">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Search code or text" aria-label="Search questions" className="min-h-10 flex-1 rounded-md border border-line-strong bg-surface px-3" />
      </form>
      <nav className="mt-3 flex gap-1" aria-label="Filter by status">
        {tabs.map(([v, l]) => (
          <Link key={v} href={`/admin/questions${v ? `?status=${v}` : ""}`} aria-current={(status ?? "") === v ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-sm ${(status ?? "") === v ? "bg-surface-2 font-medium" : "text-ink-2"}`}>{l}</Link>
        ))}
      </nav>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-left text-ink-2"><tr>{["Code", "Chapter", "Source", "Marks", "Latest revision", "Rights", "Published"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {list.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2"><Link href={`/admin/questions/${r.id}`} className="font-mono underline">{r.code}</Link></td>
                <td className="px-3 py-2">{r.chapter}</td>
                <td className="px-3 py-2">{SOURCE_LABELS[r.source_type as keyof typeof SOURCE_LABELS].short}</td>
                <td className="px-3 py-2 tabular-nums">{r.marks}</td>
                <td className="px-3 py-2"><Badge tone={r.latest_status === "in_review" ? "warning" : r.latest_status === "approved" ? "success" : "neutral"}>{r.latest_status?.replace("_", " ")}</Badge></td>
                <td className="px-3 py-2">{r.permission_status.replace("_", " ")}</td>
                <td className="px-3 py-2">{r.publication_status}{r.has_rubric ? " · rubric" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">{list.length} shown (max 500).</p>
    </div>
  );
}
