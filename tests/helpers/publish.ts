import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { runAs } from "@/lib/db/rls";
import { decideRevision, publishQuestion } from "@/lib/dal/review";
import type { TestDb } from "./db";

/** Approve every in-review revision and publish all questions, as a reviewer would. */
export async function approveAndPublishAll(t: TestDb, reviewerId: string) {
  const actor = { id: reviewerId, roles: ["student", "teacher_reviewer"] };
  for (const [kind, table] of [
    ["question", s.questionRevisions],
    ["solution", s.solutionRevisions],
    ["rubric", s.rubricRevisions],
  ] as const) {
    const pending = await t.db.select({ id: table.id }).from(table).where(eq(table.status, "in_review"));
    for (const r of pending) await runAs(t.db, reviewerId, (tx) => decideRevision(tx, actor, kind, r.id, "approved", null));
  }
  const qs = await t.db.select({ id: s.questions.id }).from(s.questions);
  for (const q of qs) await runAs(t.db, reviewerId, (tx) => publishQuestion(tx, actor, q.id));
}
