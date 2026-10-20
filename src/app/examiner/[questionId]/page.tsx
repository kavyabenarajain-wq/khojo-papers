import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import { getQuestionDetail } from "@/lib/dal/questions";
import { requireViewer, consentSettled } from "@/lib/auth/rbac";
import { integrations } from "@/lib/env";
import * as s from "@/lib/db/schema";
import { marksLabel } from "@/lib/labels";
import { QuestionBody } from "@/components/question/QuestionBody";
import { ExaminerFlow } from "@/components/examiner/ExaminerFlow";
import { Notice } from "@/components/ui/Notice";
import { renderInline } from "@/lib/content/richtext";

export const metadata: Metadata = { title: "Check my answer" };

export default async function ExaminerQuestionPage({ params, searchParams }: PageProps<"/examiner/[questionId]">) {
  const { questionId } = await params;
  const { response } = await searchParams;
  const viewer = await requireViewer(`/examiner/${questionId}`);
  const data = await asViewer(async (tx) => {
    const q = await getQuestionDetail(tx, questionId, { preview: false });
    const resp =
      typeof response === "string" && /^[0-9a-f-]{36}$/i.test(response)
        ? (await tx.select().from(s.responses).where(and(eq(s.responses.id, response), eq(s.responses.userId, viewer.id), eq(s.responses.questionId, questionId))))[0]
        : undefined;
    return { q, resp };
  });
  if (!data.q) notFound();
  const { q, resp } = data;

  let blocker: string | null = null;
  if (!integrations.ai) blocker = "The AI Examiner hasn't been connected to an AI service on this server yet. You can mark yourself against the rubric from the question page.";
  else if (!q.hasRubric) blocker = "This question doesn't have a teacher-approved marking rubric yet, so the AI Examiner can't mark it.";
  else if (!consentSettled(viewer)) blocker = "Your parent or guardian needs to confirm consent before the AI Examiner can be used.";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <p className="text-sm text-ink-3">
        <Link href="/examiner" className="hover:text-ink">AI Examiner</Link> · <Link href={`/questions/${q.id}`} className="hover:text-ink">{q.code}</Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Check my answer</h1>
      <details className="mt-4 rounded-lg border border-line bg-surface p-4" open={!resp}>
        <summary className="min-h-9 cursor-pointer font-semibold">Question · {marksLabel(q.marks)}</summary>
        <div className="mt-3">
          <QuestionBody content={q.revision.content} />
          {q.revision.content.parts && (
            <ol className="mt-3 space-y-2">
              {q.revision.content.parts.map((p) => (
                <li key={p.key} className="flex gap-2">
                  <span className="font-semibold text-ink-2">({p.key})</span>
                  <span className="prose-question min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: renderInline(p.prompt) }} />
                  <span className="text-sm text-ink-3">[{p.marks}]</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </details>
      <div className="mt-5">
        {blocker ? (
          <Notice tone="warning">{blocker}</Notice>
        ) : (
          <ExaminerFlow questionId={q.id} responseId={resp?.locked ? resp.id : null} submittedText={resp?.locked ? resp.answer.text ?? null : null} />
        )}
      </div>
    </div>
  );
}
