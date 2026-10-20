import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, createUser, type TestDb } from "../helpers/db";
import { approveAndPublishAll } from "../helpers/publish";
import * as s from "@/lib/db/schema";
import { runAs } from "@/lib/db/rls";
import { loadSeedContent } from "@/lib/content/seed-loader";
import { recordSelfAssessment, submitPractice } from "@/lib/dal/practice";
import { getProgressSummary, getRecentActivity, getRevisionSuggestions } from "@/lib/dal/progress";

let t: TestDb;
let student: string;
let mcq: string;
let working: string;

beforeAll(async () => {
  t = await createTestDb();
  const reviewer = await createUser(t, { roles: ["student", "teacher_reviewer"] });
  student = await createUser(t);
  await loadSeedContent(t.db, "tests/fixtures/seed");
  await approveAndPublishAll(t, reviewer);
  mcq = (await t.db.select().from(s.questions).where(eq(s.questions.code, "M10-CIR-002")))[0].id;
  working = (await t.db.select().from(s.questions).where(eq(s.questions.code, "M10-CIR-001")))[0].id;
});
afterAll(async () => t.close());

describe("progress", () => {
  it("is empty with no data, and never invents weaknesses or trends", async () => {
    const p = await runAs(t.db, student, (tx) => getProgressSummary(tx, student));
    expect(p).toMatchObject({ questionsAttempted: 0, submissions: 0, objective: { total: 0, correct: 0 }, weakChapters: [], trend: null });
  });

  it("separates objective accuracy from rubric marks by method, and flags weak chapters only with enough data", async () => {
    await submitPractice(t.db, student, mcq, { choice: "a" });
    await submitPractice(t.db, student, mcq, { choice: "b" });
    let p = await runAs(t.db, student, (tx) => getProgressSummary(tx, student));
    expect(p.objective).toEqual({ total: 2, correct: 0 });
    expect(p.weakChapters).toEqual([]); // only 2 answers, threshold is 3
    await submitPractice(t.db, student, mcq, { choice: "c" });
    const w = await submitPractice(t.db, student, working, { text: "55" });
    await runAs(t.db, student, (tx) => recordSelfAssessment(tx, student, w.responseId, { theorem: 0, method: 0, answer: 1 }));

    p = await runAs(t.db, student, (tx) => getProgressSummary(tx, student));
    expect(p.questionsAttempted).toBe(2);
    expect(p.submissions).toBe(4);
    expect(p.objective).toEqual({ total: 3, correct: 1 });
    expect(p.weakChapters.map((c) => c.slug)).toEqual(["circles"]);
    expect(p.byMethod.find((m) => m.method === "self")).toMatchObject({ awarded: 1, maximum: 3, evaluations: 1 });
    expect(p.byMethod.find((m) => m.method === "teacher")).toBeUndefined();
    expect(p.missedCriteria.map((m) => m.times)).toEqual([1, 1]);
    expect(p.mistakeCategories).toEqual([{ category: "incorrect_answer", times: 2 }]);
  });

  it("lists recent activity and revision suggestions from the student's own data only", async () => {
    const recent = await runAs(t.db, student, (tx) => getRecentActivity(tx, student));
    expect(recent.recent.map((r) => r.code).sort()).toEqual(["M10-CIR-001", "M10-CIR-002"]);
    const other = await createUser(t);
    const theirs = await runAs(t.db, other, (tx) => getProgressSummary(tx, other));
    expect(theirs.submissions).toBe(0);
    // M10-CIR-002 was eventually answered correctly, so it is not suggested for retry.
    const sugg = await runAs(t.db, student, (tx) => getRevisionSuggestions(tx, student, ["circles"]));
    expect(sugg.map((x) => x.code)).not.toContain("M10-CIR-002");
  });
});
