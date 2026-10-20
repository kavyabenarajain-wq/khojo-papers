import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, ShieldCheck } from "lucide-react";
import { asViewer } from "@/lib/dal/context";
import { getPracticeState, getQuestionDetail } from "@/lib/dal/questions";
import { integrations } from "@/lib/env";
import { consentSettled } from "@/lib/auth/rbac";
import { buildAnswerUi } from "@/lib/content/payloads";
import { renderRichText, toPlainText } from "@/lib/content/richtext";
import { DIFFICULTY_LABELS, FORMAT_LABELS, marksLabel, SOURCE_LABELS } from "@/lib/labels";
import { QuestionBody } from "@/components/question/QuestionBody";
import { SourceBadge } from "@/components/question/SourceBadge";
import { SolveWorkspace } from "@/components/solve/SolveWorkspace";
import { BookmarkButton, ReportIssueButton } from "@/components/solve/QuestionActions";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { DatabaseUnavailable } from "@/components/ui/Unavailable";

async function load(id: string) {
  return asViewer(async (tx, ctx) => {
    const q = await getQuestionDetail(tx, id, { preview: ctx.preview });
    const state = q && ctx.userId ? await getPracticeState(tx, ctx.userId, id) : null;
    return { q, state, ctx };
  });
}

export async function generateMetadata({ params }: PageProps<"/questions/[id]">): Promise<Metadata> {
  if (!integrations.database) return { title: "Question" };
  const { id } = await params;
  const { q } = await load(id);
  if (!q) return { title: "Question not found" };
  return { title: `${q.chapter?.name ?? "Question"} · ${q.code}`, description: toPlainText(q.revision.content.stem).slice(0, 160) };
}

export default async function QuestionPage({ params }: PageProps<"/questions/[id]">) {
  if (!integrations.database) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <DatabaseUnavailable />
      </div>
    );
  }
  const { id } = await params;
  const { q, state, ctx } = await load(id);
  if (!q) notFound();

  const viewer = ctx.viewer;
  const ui = buildAnswerUi(q.answerFormat, q.marks, q.revision.content, q.numericKey);
  const published = q.publicationStatus === "published";
  const reviewed = q.revision.status === "approved" || q.revision.status === "superseded";

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 sm:py-8">
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-ink-3">
        <Link href="/explore" className="hover:text-ink">Explore</Link>
        {q.chapter && (
          <>
            <ChevronRight className="size-3.5" aria-hidden />
            <Link href={`/explore?chapter=${q.chapter.slug}`} className="hover:text-ink">{q.chapter.name}</Link>
          </>
        )}
      </nav>

      {!published && (
        <Notice tone="warning" className="mb-4" title="Staff preview: not published">
          Revision {q.revision.number} is {q.revision.status.replace("_", " ")}. Students cannot see this question.
        </Notice>
      )}

      <header className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <SourceBadge source={q.sourceType} year={q.examYear} />
          <Badge>{marksLabel(q.marks)}</Badge>
          <Badge>{FORMAT_LABELS[q.answerFormat]}</Badge>
          {q.difficulty && q.difficultyValidated && <Badge>{DIFFICULTY_LABELS[q.difficulty]}</Badge>}
        </div>
        <h1 className="sr-only">Question {q.code}{q.chapter ? `, ${q.chapter.name}` : ""}</h1>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-3">
            <span className="font-mono">{q.code}</span>
            {q.topics.length > 0 && <> · {q.topics.map((t) => t.name).join(", ")}</>}
          </p>
          <div className="flex gap-1">
            <BookmarkButton questionId={q.id} initial={state?.bookmarked ?? false} signedIn={Boolean(viewer)} />
            <ReportIssueButton questionId={q.id} />
          </div>
        </div>
      </header>

      <article className="rounded-lg border border-line bg-surface p-4 sm:p-6">
        <QuestionBody content={q.revision.content} />
        <p className="mt-4 text-right text-sm text-ink-3">[{marksLabel(q.marks)}]</p>
      </article>

      <Provenance q={q} reviewed={reviewed} />

      <div className="mt-6">
        <SolveWorkspace
          questionId={q.id}
          ui={ui}
          hintsHtml={q.revision.hints.map((h) => renderRichText(h))}
          signedIn={Boolean(viewer)}
          canSave={consentSettled(viewer)}
          published={published}
          initialDraft={state?.draft?.answer ?? null}
          hasSolution={q.hasSolution}
          hasRubric={q.hasRubric}
          aiAvailable={integrations.ai}
        />
      </div>

      {state && state.history.length > 0 && (
        <section aria-labelledby="history-heading" className="mt-8">
          <h2 id="history-heading" className="mb-2 font-semibold">Your earlier attempts</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {state.history.slice(0, 5).map((h) => (
              <li key={h.responseId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-ink-2">{h.submittedAt ? new Date(h.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Submitted"}</span>
                {h.evaluation ? (
                  <span className="text-ink">
                    {h.evaluation.awarded ?? "–"} / {h.evaluation.maximum}{" "}
                    <span className="text-ink-3">({h.evaluation.method === "deterministic" ? "answer key" : h.evaluation.method === "ai" ? "AI-estimated" : h.evaluation.method === "self" ? "self-assessed" : "teacher"})</span>
                  </span>
                ) : (
                  <span className="text-ink-3">Not marked yet</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Provenance({ q, reviewed }: { q: NonNullable<Awaited<ReturnType<typeof getQuestionDetail>>>; reviewed: boolean }) {
  const label = SOURCE_LABELS[q.sourceType];
  return (
    <div className="mt-3 flex gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
      <div>
        <p>{label.long}</p>
        {q.source && (
          <p className="mt-0.5">
            Source: {q.source.title}
            {q.source.page ? `, page ${q.source.page}` : ""}
            {q.source.questionNumber ? `, question ${q.source.questionNumber}` : ""}
            {q.source.url && (
              <>
                {" "}
                <a href={q.source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-medium text-accent-text underline underline-offset-2">
                  official site <ExternalLink className="size-3" aria-hidden />
                </a>
              </>
            )}
          </p>
        )}
        <p className="mt-0.5">
          {reviewed
            ? `${q.revision.aiAssisted ? "Drafted with AI assistance; " : ""}question, solution and rubric reviewed by a teacher${q.revision.reviewedAt ? ` on ${new Date(q.revision.reviewedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : ""}.`
            : `${q.revision.aiAssisted ? "Drafted with AI assistance. " : ""}Not yet reviewed by a teacher.`}
        </p>
      </div>
    </div>
  );
}
