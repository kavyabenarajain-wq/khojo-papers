import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportResolver } from "@/components/admin/SmallForms";

export const metadata: Metadata = { title: "Issue reports" };

export default async function ReportsPage() {
  const list = await asViewer((tx) =>
    tx
      .select({ r: s.issueReports, code: s.questions.code })
      .from(s.issueReports)
      .innerJoin(s.questions, eq(s.questions.id, s.issueReports.questionId))
      .orderBy(s.issueReports.status, desc(s.issueReports.createdAt))
      .limit(200),
  );
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Issue reports</h1>
      <p className="mt-1 text-ink-2">From students, and from the AI Examiner when a rubric couldn&apos;t be applied. Fix content by creating a new revision; unpublish if students could be misled meanwhile.</p>
      {list.length === 0 ? <div className="mt-6"><EmptyState title="No reports" /></div> : (
        <ul className="mt-5 space-y-3">
          {list.map(({ r, code }) => (
            <li key={r.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={r.status === "open" ? "warning" : "neutral"}>{r.status}</Badge>
                <Badge>{r.category.replace("_", " ")}</Badge>
                <Link href={`/admin/questions/${r.questionId}`} className="font-mono underline">{code}</Link>
                <span className="text-ink-3">{r.createdAt.toLocaleString("en-IN")}{r.userId ? "" : " · anonymous or system"}</span>
              </div>
              <p className="mt-2 whitespace-pre-line">{r.message}</p>
              {r.resolutionNote && <p className="mt-1 text-sm text-ink-3">Resolution: {r.resolutionNote}</p>}
              {r.status === "open" && <ReportResolver id={r.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
