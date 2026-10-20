import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { asViewer } from "@/lib/dal/context";
import { DEADLINE_GRACE_MS, getExamAttempt } from "@/lib/dal/papers";
import { requireViewer } from "@/lib/auth/rbac";
import { buildAnswerUi } from "@/lib/content/payloads";
import { QuestionBody } from "@/components/question/QuestionBody";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { submitExam } from "@/lib/dal/papers";
import { getDb } from "@/lib/db/client";

export const metadata: Metadata = { title: "Exam mode" };

/** Loads the attempt and the server's current time (the countdown is anchored to the server clock). */
async function loadAttempt(userId: string, attemptId: string) {
  const view = await asViewer((tx) => getExamAttempt(tx, userId, attemptId));
  return { view, now: Date.now() };
}

export default async function ExamPage({ params }: PageProps<"/papers/[slug]/attempt/[attemptId]">) {
  const { slug, attemptId } = await params;
  const viewer = await requireViewer(`/papers/${slug}/attempt/${attemptId}`);
  const { view, now } = await loadAttempt(viewer.id, attemptId);
  if (!view || view.paper.slug !== slug) notFound();
  if (view.attempt.status !== "in_progress") redirect(`/papers/${slug}/results/${attemptId}`);
  if (view.attempt.deadlineAt && now > view.attempt.deadlineAt.getTime() + DEADLINE_GRACE_MS) {
    await submitExam(getDb(), viewer.id, attemptId);
    redirect(`/papers/${slug}/results/${attemptId}?timeout=1`);
  }

  return (
    <ExamRunner
      attemptId={attemptId}
      slug={slug}
      title={view.paper.title}
      deadline={view.attempt.deadlineAt!.toISOString()}
      serverNow={new Date(now).toISOString()}
      sections={view.sections}
      items={view.items.map((i) => ({
        responseId: i.responseId,
        sectionId: i.sectionId,
        displayNumber: i.displayNumber,
        marks: i.marks,
        ui: buildAnswerUi(i.answerFormat, i.marks, i.content, i.numericKey),
        initial: i.answer,
      }))}
      bodies={view.items.map((i) => <QuestionBody key={i.responseId} content={i.content} />)}
    />
  );
}
