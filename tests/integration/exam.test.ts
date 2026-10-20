import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, createUser, type TestDb } from "../helpers/db";
import { approveAndPublishAll } from "../helpers/publish";
import { runAs } from "@/lib/db/rls";
import * as s from "@/lib/db/schema";
import { loadSeedContent } from "@/lib/content/seed-loader";
import { publishPaper } from "@/lib/dal/review";
import { getExamAttempt, getExamResult, listPapers, PaperError, saveExamAnswer, startExam, submitExam } from "@/lib/dal/papers";

let t: TestDb;
let student: string;
let other: string;
let paperId: string;

beforeAll(async () => {
  t = await createTestDb();
  const reviewer = await createUser(t, { roles: ["student", "teacher_reviewer"] });
  student = await createUser(t);
  other = await createUser(t);
  await loadSeedContent(t.db, "tests/fixtures/seed");
  await approveAndPublishAll(t, reviewer);
  [{ id: paperId }] = await t.db.select({ id: s.papers.id }).from(s.papers);
  await runAs(t.db, reviewer, (tx) => publishPaper(tx, { id: reviewer, roles: ["teacher_reviewer"] }, paperId));
});
afterAll(async () => t.close());

describe("exam mode", () => {
  let attemptId: string;

  it("starts a timed attempt with a server deadline and resumes it", async () => {
    const first = await startExam(t.db, student, paperId);
    const again = await startExam(t.db, student, paperId);
    expect(again).toEqual({ attemptId: first.attemptId, resumed: true });
    attemptId = first.attemptId;
    const [a] = await t.db.select().from(s.attempts).where(eq(s.attempts.id, attemptId));
    expect(a.deadlineAt!.getTime() - a.startedAt.getTime()).toBe(10 * 60_000);
    const listed = await runAs(t.db, student, (tx) => listPapers(tx, { preview: false, userId: student }));
    expect(listed[0].inProgressAttemptId).toBe(attemptId);
  });

  it("hides attempts from other students and never exposes answer keys", async () => {
    expect(await runAs(t.db, other, (tx) => getExamAttempt(tx, other, attemptId))).toBeNull();
    const view = await runAs(t.db, student, (tx) => getExamAttempt(tx, student, attemptId));
    expect(view?.items).toHaveLength(2);
    expect(JSON.stringify(view)).not.toMatch(/"correct"|answerKey|"value":55/);
  });

  it("autosaves answers and rejects saves after the deadline", async () => {
    const view = (await runAs(t.db, student, (tx) => getExamAttempt(tx, student, attemptId)))!;
    const mcq = view.items.find((i) => i.answerFormat === "mcq")!;
    await runAs(t.db, student, (tx) => saveExamAnswer(tx, student, attemptId, mcq.responseId, { choice: "c" }));
    await expect(runAs(t.db, other, (tx) => saveExamAnswer(tx, other, attemptId, mcq.responseId, { choice: "a" }))).rejects.toThrow(PaperError);
    await t.db.execute(sql`update app.attempts set deadline_at = now() - interval '5 minutes' where id = ${attemptId}`);
    await expect(runAs(t.db, student, (tx) => saveExamAnswer(tx, student, attemptId, mcq.responseId, { choice: "a" }))).rejects.toThrow(/Time is up/);
  });

  it("submits, marks objective answers and leaves written ones pending", async () => {
    await submitExam(t.db, student, attemptId);
    expect(await submitExam(t.db, student, attemptId)).toEqual({ alreadySubmitted: true });
    const r = (await runAs(t.db, student, (tx) => getExamResult(tx, student, attemptId)))!;
    expect(r.totals).toMatchObject({ awarded: 1, maximum: 4, pending: 0 });
    const mcq = r.items.find((i) => i.answerFormat === "mcq")!;
    expect(mcq.evaluation).toMatchObject({ method: "deterministic", awarded: 1 });
    const written = r.items.find((i) => i.answerFormat !== "mcq")!;
    expect(written).toMatchObject({ answered: false, evaluation: null });
    const locked = await t.db.select().from(s.responses).where(eq(s.responses.attemptId, attemptId));
    expect(locked.every((x) => x.locked)).toBe(true);
  });

  it("starts a fresh attempt after a submitted one", async () => {
    const next = await startExam(t.db, student, paperId);
    expect(next.resumed).toBe(false);
    expect(next.attemptId).not.toBe(attemptId);
  });
});
