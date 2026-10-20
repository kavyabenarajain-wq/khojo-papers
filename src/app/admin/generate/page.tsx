import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";
import { canEditContent } from "@/lib/auth/rbac";
import { integrations } from "@/lib/env";
import { Notice } from "@/components/ui/Notice";
import { GenerateForm } from "@/components/admin/GenerateForm";

export const metadata: Metadata = { title: "Draft with AI" };

export default async function GeneratePage() {
  const { topics, viewer } = await asViewer(async (tx, ctx) => ({ topics: await tx.select().from(s.syllabusTopics).orderBy(asc(s.syllabusTopics.position)), viewer: ctx.viewer }));
  if (!canEditContent(viewer)) return <Notice tone="warning">Only content editors can draft questions.</Notice>;
  const chapters = topics.filter((t) => t.kind === "chapter").map((c) => ({ id: c.id, name: c.name, topics: topics.filter((t) => t.parentId === c.id).map((t) => ({ id: t.id, name: t.name, objective: t.learningObjective })) }));
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Draft an original question with AI</h1>
      <p className="mt-1 text-ink-2">
        Produces an original practice question with a worked solution and rubric. It is saved as an unpublished draft labelled &ldquo;AI-drafted&rdquo;
        and must be checked and approved by a teacher. It is never presented as a board or specimen question.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-2">
        <li>Automatic checks: structure, maths rendering, rubric totals, recomputed arithmetic, no references to exam years, duplicate detection.</li>
        <li>These checks can&apos;t confirm the maths is correct or the question is good. That is the reviewer&apos;s job.</li>
      </ul>
      {!integrations.ai ? (
        <Notice tone="warning" className="mt-5">The AI service isn&apos;t configured on this server.</Notice>
      ) : (
        <div className="mt-5 rounded-lg border border-line bg-surface p-5"><GenerateForm chapters={chapters} /></div>
      )}
    </div>
  );
}
