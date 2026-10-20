import type { Metadata } from "next";
import Link from "next/link";
import { asViewer } from "@/lib/dal/context";
import { reviewQueue } from "@/lib/dal/admin";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SOURCE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Review queue" };

export default async function ReviewQueuePage() {
  const items = await asViewer((tx) => reviewQueue(tx));
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
      <p className="mt-1 text-ink-2">
        Check each question, its worked solution and its rubric. Approve only what you have actually verified: approval is recorded under your name and is
        what students see as &ldquo;reviewed by a teacher&rdquo;.
      </p>
      {items.length === 0 ? (
        <div className="mt-6"><EmptyState title="Nothing waiting for review" /></div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={`/admin/questions/${i.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2">
                <span className="font-mono text-sm">{i.code}</span>
                <span className="text-[0.95rem]">{i.chapter}</span>
                <span className="flex flex-wrap gap-1">
                  {i.pending.question && <Badge tone="warning">Question</Badge>}
                  {i.pending.solution && <Badge tone="warning">Solution</Badge>}
                  {i.pending.rubric && <Badge tone="warning">Rubric</Badge>}
                  {i.aiAssisted && <Badge>AI-drafted</Badge>}
                  <Badge>{SOURCE_LABELS[i.sourceType as keyof typeof SOURCE_LABELS].short}</Badge>
                  {i.openReports > 0 && <Badge tone="danger">{i.openReports} report{i.openReports > 1 ? "s" : ""}</Badge>}
                </span>
                <span className="ml-auto text-xs text-ink-3">{i.publicationStatus}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
