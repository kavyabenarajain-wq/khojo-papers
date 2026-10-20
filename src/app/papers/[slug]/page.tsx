import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, ExternalLink } from "lucide-react";
import { asViewer } from "@/lib/dal/context";
import { getPaperBySlug, listPapers } from "@/lib/dal/papers";
import { getQuestionDetail } from "@/lib/dal/questions";
import { integrations } from "@/lib/env";
import { consentSettled } from "@/lib/auth/rbac";
import { renderInline } from "@/lib/content/richtext";
import { FORMAT_LABELS, marksLabel } from "@/lib/labels";
import { QuestionBody } from "@/components/question/QuestionBody";
import { StartExamButton } from "@/components/exam/StartExamButton";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { DatabaseUnavailable } from "@/components/ui/Unavailable";

export async function generateMetadata({ params }: PageProps<"/papers/[slug]">): Promise<Metadata> {
  if (!integrations.database) return { title: "Paper" };
  const { slug } = await params;
  const data = await asViewer((tx, ctx) => getPaperBySlug(tx, slug, { preview: ctx.preview }));
  return { title: data?.paper.title ?? "Paper not found" };
}

export default async function PaperPage({ params, searchParams }: PageProps<"/papers/[slug]">) {
  if (!integrations.database) return <div className="mx-auto max-w-3xl px-4 py-8"><DatabaseUnavailable /></div>;
  const { slug } = await params;
  const { view } = await searchParams;
  const fullView = view === "paper";

  const data = await asViewer(async (tx, ctx) => {
    const structure = await getPaperBySlug(tx, slug, { preview: ctx.preview });
    if (!structure) return null;
    const mine = (await listPapers(tx, { preview: ctx.preview, userId: ctx.userId })).find((p) => p.id === structure.paper.id);
    const details = fullView
      ? await Promise.all(structure.sections.flatMap((s) => s.items).map((i) => getQuestionDetail(tx, i.questionId, { preview: ctx.preview })))
      : [];
    return { structure, mine, details, ctx };
  });
  if (!data) notFound();
  const { structure, mine, details, ctx } = data;
  const p = structure.paper;
  const isPractice = p.paperType === "practice_set";

  if (p.availability === "external_reference") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        <Notice className="mt-4" title="Available from the official source">
          This paper is listed for reference only; we don&apos;t host it.{" "}
          {p.externalUrl && (
            <a href={p.externalUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-accent-text underline">
              Open on the official site <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </Notice>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-sm text-ink-3">
        <Link href="/papers" className="hover:text-ink">Papers</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="truncate">{p.title}</span>
      </nav>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Badge tone={isPractice ? "original" : p.paperType === "board" ? "pyq" : "specimen"}>
          {isPractice ? "KHOJO practice set" : p.paperType === "board" ? `Board paper ${p.examinationYear ?? ""}` : `Specimen paper ${p.examinationYear ?? ""}`}
        </Badge>
        {p.publicationStatus !== "published" && <Badge tone="warning">Unpublished · preview</Badge>}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{p.title}</h1>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-ink-2">
        {p.durationMinutes && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden /> {p.durationMinutes} minutes
          </span>
        )}
        {p.maximumMarks && <span>{p.maximumMarks} marks</span>}
        <span>{structure.sections.reduce((a, s) => a + s.items.length, 0)} questions</span>
      </p>
      {isPractice && (
        <p className="mt-2 text-sm text-ink-3">
          A practice set made by KHOJO PAPERS from original questions. Its timing and marks are ours, not a CISCE paper&apos;s.
        </p>
      )}
      {structure.source && (
        <p className="mt-2 text-sm text-ink-3">
          Source: {structure.source.title}
          {structure.source.url && (
            <>
              {" "}
              <a href={structure.source.url} target="_blank" rel="noreferrer noopener" className="text-accent-text underline">official site</a>
            </>
          )}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {p.publicationStatus === "published" && p.durationMinutes ? (
          ctx.viewer ? (
            consentSettled(ctx.viewer) ? (
              <StartExamButton paperId={p.id} slug={p.slug} resume={Boolean(mine?.inProgressAttemptId)} minutes={p.durationMinutes} />
            ) : (
              <Notice tone="warning">Timed papers are available once your parent or guardian confirms consent.</Notice>
            )
          ) : (
            <ButtonLink href={`/login?next=/papers/${p.slug}`} size="lg">Sign in to take this paper</ButtonLink>
          )
        ) : null}
        <ButtonLink href={fullView ? `/papers/${p.slug}` : `/papers/${p.slug}?view=paper`} variant="secondary" size="lg">
          {fullView ? "Show structure" : "Read the paper"}
        </ButtonLink>
        {mine?.lastResult && (
          <ButtonLink href={`/papers/${p.slug}/results/${mine.lastResult.attemptId}`} variant="ghost" size="lg">
            Your last result
          </ButtonLink>
        )}
      </div>

      {p.instructions && (
        <section aria-labelledby="instr" className="mt-6 rounded-lg border border-line bg-surface p-4">
          <h2 id="instr" className="font-semibold">Instructions</h2>
          <p className="mt-1 whitespace-pre-line text-ink-2">{p.instructions}</p>
        </section>
      )}

      <div className="mt-6 space-y-6">
        {structure.sections.map((sec) => (
          <section key={sec.id} aria-labelledby={`sec-${sec.id}`}>
            <h2 id={`sec-${sec.id}`} className="text-lg font-semibold">
              {sec.label}
              {sec.choiceRule === "any_n" && <span className="ml-2 text-sm font-normal text-ink-3">Answer any {sec.chooseN} of {sec.items.length}</span>}
            </h2>
            {sec.instructions && <p className="text-sm text-ink-3">{sec.instructions}</p>}
            {fullView ? (
              <ol className="mt-3 space-y-4">
                {sec.items.map((i) => {
                  const d = details.find((x) => x?.id === i.questionId);
                  return (
                    <li key={i.id} className="rounded-lg border border-line bg-surface p-4">
                      <div className="mb-2 flex items-center justify-between text-sm text-ink-3">
                        <span className="font-semibold text-ink">Question {i.displayNumber}</span>
                        <span>[{marksLabel(i.marks)}]</span>
                      </div>
                      {d ? <QuestionBody content={d.revision.content} /> : <p className="text-ink-3">This question is being corrected.</p>}
                      {d?.revision.content.parts && (
                        <ol className="mt-3 space-y-2">
                          {d.revision.content.parts.map((part) => (
                            <li key={part.key} className="flex gap-2">
                              <span className="font-semibold text-ink-2">({part.key})</span>
                              <span className="prose-question min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: renderInline(part.prompt) }} />
                              <span className="text-sm text-ink-3">[{part.marks}]</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <ol className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
                {sec.items.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-6 shrink-0 font-semibold text-ink-2">{i.displayNumber}</span>
                    <span className="min-w-0 flex-1">
                      <span className="prose-question line-clamp-2 block text-[0.95rem]" dangerouslySetInnerHTML={{ __html: renderInline(i.stem.split(/\n\s*\n/)[0]) }} />
                      <span className="text-xs text-ink-3">{i.chapter} · {i.answerFormat ? FORMAT_LABELS[i.answerFormat] : ""}</span>
                    </span>
                    <span className="shrink-0 text-sm text-ink-3">{i.marks}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
