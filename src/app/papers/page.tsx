import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ExternalLink, FileText } from "lucide-react";
import { asViewer } from "@/lib/dal/context";
import { listPapers, type PaperListItem } from "@/lib/dal/papers";
import { integrations } from "@/lib/env";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DatabaseUnavailable } from "@/components/ui/Unavailable";

export const metadata: Metadata = { title: "Papers" };

const TYPE = {
  board: { label: "Board paper", tone: "pyq" as const, heading: "Board examination papers" },
  specimen: { label: "Specimen paper", tone: "specimen" as const, heading: "Specimen papers" },
  practice_set: { label: "KHOJO practice set", tone: "original" as const, heading: "KHOJO PAPERS practice sets" },
};

export default async function PapersPage() {
  if (!integrations.database) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold">Papers</h1>
        <DatabaseUnavailable />
      </div>
    );
  }
  const papers = await asViewer((tx, ctx) => listPapers(tx, { preview: ctx.preview, userId: ctx.userId }));
  const groups = (["board", "specimen", "practice_set"] as const).map((t) => ({ type: t, items: papers.filter((p) => p.paperType === t) }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Papers</h1>
      <p className="mt-1 text-ink-2">ICSE Class 10 Mathematics. Take a paper in timed exam mode, then review your marks.</p>

      <div className="mt-6 space-y-8">
        {groups.map((g) => (
          <section key={g.type} aria-labelledby={`h-${g.type}`}>
            <h2 id={`h-${g.type}`} className="mb-3 text-lg font-semibold">{TYPE[g.type].heading}</h2>
            {g.items.length ? (
              <ul className="space-y-3">
                {g.items.map((p) => (
                  <li key={p.id}>
                    <PaperCard p={p} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<FileText className="size-5" />} title={g.type === "practice_set" ? "No practice sets published yet" : "None available yet"}>
                {g.type === "practice_set"
                  ? "Practice sets appear once every question in them has been reviewed."
                  : "Official CISCE papers will only be listed once we have the right to host them, or as links to the official source."}
              </EmptyState>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function PaperCard({ p }: { p: PaperListItem }) {
  const t = TYPE[p.paperType];
  return (
    <article className="relative rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Badge tone={t.tone}>{t.label}{p.examinationYear ? ` ${p.examinationYear}` : ""}</Badge>
        {p.availability === "external_reference" && <Badge>Link to official source</Badge>}
        {p.publicationStatus !== "published" && <Badge tone="warning">Unpublished · preview</Badge>}
        {p.inProgressAttemptId && <Badge tone="accent">In progress</Badge>}
      </div>
      <h3 className="text-lg font-semibold">
        {p.availability === "external_reference" && p.externalUrl ? (
          <a href={p.externalUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 after:absolute after:inset-0">
            {p.title} <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : (
          <Link href={`/papers/${p.slug}`} className="after:absolute after:inset-0">{p.title}</Link>
        )}
      </h3>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
        {p.questionCount > 0 && <span>{p.questionCount} questions</span>}
        {p.maximumMarks && <span>{p.maximumMarks} marks</span>}
        {p.durationMinutes && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {p.durationMinutes} minutes
          </span>
        )}
        {p.lastResult && <span>Last taken {p.lastResult.submittedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>}
      </p>
    </article>
  );
}
