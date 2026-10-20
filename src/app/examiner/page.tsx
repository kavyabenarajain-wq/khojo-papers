import type { Metadata } from "next";
import { PenLine } from "lucide-react";
import { asViewer } from "@/lib/dal/context";
import { searchQuestions } from "@/lib/dal/library";
import { integrations } from "@/lib/env";
import { QuestionCard } from "@/components/question/QuestionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { DatabaseUnavailable } from "@/components/ui/Unavailable";

export const metadata: Metadata = { title: "AI Examiner" };

export default async function ExaminerPage() {
  const list = integrations.database
    ? await asViewer((tx, ctx) => searchQuestions(tx, { examinerReady: true }, { userId: ctx.userId, preview: false, pageSize: 50 }))
    : null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">AI Examiner</h1>
      <p className="mt-2 text-ink-2">
        Photograph your handwritten answer, or type it, and get it marked criterion by criterion against an approved rubric, with the reason for every mark
        you earned or lost.
      </p>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["1", "Answer on paper", "Pick a question below and write your answer as you would in the exam."],
          ["2", "Upload and check", "We read your handwriting. You confirm or correct what we read."],
          ["3", "See your marks", "Marks per criterion, what was missing, and the model answer side by side."],
        ].map(([n, t, b]) => (
          <li key={n} className="rounded-lg border border-line bg-surface p-4">
            <span className="text-sm font-semibold text-accent-text">Step {n}</span>
            <p className="mt-1 font-semibold">{t}</p>
            <p className="mt-1 text-sm text-ink-2">{b}</p>
          </li>
        ))}
      </ol>
      <Notice className="mt-5" title="What to expect">
        Marks are AI estimates against our teacher-approved rubric. They are not official CISCE marks and may differ from board marking. When handwriting is
        unclear or the AI is unsure, we say so rather than guess, and you can ask a teacher to check.
      </Notice>
      {!integrations.ai && (
        <Notice tone="warning" className="mt-4" title="The AI Examiner isn't available on this server yet">
          It hasn&apos;t been connected to an AI service. You can still answer questions and mark yourself against each question&apos;s rubric after revealing the solution.
        </Notice>
      )}
      <section className="mt-8" aria-labelledby="ready">
        <h2 id="ready" className="mb-3 text-lg font-semibold">Questions with an approved rubric</h2>
        {!list ? (
          <DatabaseUnavailable />
        ) : list.items.length ? (
          <ul className="space-y-3">
            {list.items.map((q) => (
              <li key={q.id}><QuestionCard q={q} /></li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<PenLine className="size-5" />} title="No questions are ready for AI marking yet">
            A question appears here once a teacher has approved its marking rubric.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
