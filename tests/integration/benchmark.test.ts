import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, createUser, type TestDb } from "../helpers/db";
import { approveAndPublishAll } from "../helpers/publish";
import { FakeProvider, fixture } from "../helpers/fake-ai";
import * as s from "@/lib/db/schema";
import { loadSeedContent } from "@/lib/content/seed-loader";
import { runBenchmark } from "@/lib/ai/benchmark";

let t: TestDb;
let reviewer: string;

beforeAll(async () => {
  t = await createTestDb();
  reviewer = await createUser(t, { roles: ["student", "teacher_reviewer"] });
  await loadSeedContent(t.db, "tests/fixtures/seed");
  await approveAndPublishAll(t, reviewer);
});
afterAll(async () => t.close());

describe("benchmark runs", () => {
  it("re-marks teacher-marked answers and stores agreement without touching student data", async () => {
    const [q] = await t.db.select().from(s.questions).where(eq(s.questions.code, "M10-CIR-001"));
    const answer = "angle at centre is double the angle at the circumference\nangle ACB = 110/2\n= 55°";
    await t.db.insert(s.examinerBenchmarks).values([
      { questionId: q.id, rubricRevisionId: q.publishedRubricId!, category: "correct", answerText: answer, teacherTotal: 3, teacherCriteria: { theorem: 1, method: 1, answer: 1 }, markedBy: reviewer, markerName: "Test teacher" },
      { questionId: q.id, rubricRevisionId: q.publishedRubricId!, category: "partially_correct", answerText: answer, teacherTotal: 2, teacherCriteria: { theorem: 0, method: 1, answer: 1 }, markedBy: reviewer, markerName: "Test teacher" },
    ]);
    const provider = new FakeProvider([{ json: fixture("mark_correct") }, { json: fixture("mark_correct") }]);
    const { metrics } = await runBenchmark({ provider, db: t.db }, reviewer);
    expect(metrics).toMatchObject({ items: 2, marked: 2, totals: { exact: 1 }, criteria: { compared: 6, exact: 5, aiHigher: 1, aiLower: 0 } });
    expect(await t.db.select().from(s.evaluations)).toEqual([]);
    const runs = await t.db.select().from(s.benchmarkRuns);
    expect(runs).toHaveLength(1);
    const aiRuns = await t.db.select().from(s.aiRuns).where(eq(s.aiRuns.purpose, "benchmark"));
    expect(aiRuns).toHaveLength(2);
  });
});
