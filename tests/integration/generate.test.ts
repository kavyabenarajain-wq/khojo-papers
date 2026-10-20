import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, createUser, type TestDb } from "../helpers/db";
import { FakeProvider, fixture } from "../helpers/fake-ai";
import * as s from "@/lib/db/schema";
import { loadSeedContent } from "@/lib/content/seed-loader";
import { generateQuestion } from "@/lib/ai/generate";
import { latestRevisions } from "@/lib/dal/editor";
import { runAs } from "@/lib/db/rls";

let t: TestDb;
let editor: string;
let chapterId: string;
beforeAll(async () => {
  t = await createTestDb();
  editor = await createUser(t, { roles: ["content_editor"] });
  await loadSeedContent(t.db, "tests/fixtures/seed");
  chapterId = (await t.db.select().from(s.syllabusTopics).where(eq(s.syllabusTopics.slug, "quadratic-equations")))[0].id;
});
afterAll(async () => t.close());

const req = { chapterId: "", topicId: null, learningObjective: "Solve quadratics by factorisation", difficulty: "easy" as const, marks: 3, answerFormat: "math_working" as const, referenceNotes: null };
const E = () => ({ id: editor, roles: ["content_editor"] });

describe("AI question generation", () => {
  it("creates an unpublished, AI-labelled original practice draft with solution and rubric", async () => {
    const r = await generateQuestion({ provider: new FakeProvider([{ json: fixture("generate_valid") }]), db: t.db }, E(), { ...req, chapterId }, "M10-QE-901");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [q] = await t.db.select().from(s.questions).where(eq(s.questions.id, r.questionId));
    expect(q).toMatchObject({ sourceType: "original_practice", publicationStatus: "draft", permissionStatus: "own_content", examYear: null });
    const latest = await runAs(t.db, editor, (tx) => latestRevisions(tx, r.questionId));
    expect(latest.question).toMatchObject({ status: "draft", createdBy: null });
    expect(latest.question?.generation).toMatchObject({ method: "ai_assisted_authoring", promptVersion: "generate.v1", requestedBy: editor });
    expect(latest.solution?.status).toBe("draft");
    expect(latest.criteria.reduce((a, c) => a + c.marksAvailable, 0)).toBe(3);
  });

  it("rejects wrong arithmetic and references to exam years (after one retry)", async () => {
    const p1 = new FakeProvider([{ json: fixture("generate_bad_arith") }, { json: fixture("generate_bad_arith") }]);
    const r1 = await generateQuestion({ provider: p1, db: t.db }, E(), { ...req, chapterId }, "M10-QE-902");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.problems.join()).toMatch(/Calculation check failed/);
    expect(p1.calls[1].system).toMatch(/REJECTED/);
    const r2 = await generateQuestion({ provider: new FakeProvider([{ json: fixture("generate_mentions_year") }, { json: fixture("generate_mentions_year") }]), db: t.db }, E(), { ...req, chapterId }, "M10-QE-903");
    expect(r2.ok).toBe(false);
    expect(await t.db.select().from(s.questions).where(eq(s.questions.code, "M10-QE-902"))).toEqual([]);
  });

  it("flags near-duplicates for the reviewer", async () => {
    const r = await generateQuestion({ provider: new FakeProvider([{ json: fixture("generate_valid") }]), db: t.db }, E(), { ...req, chapterId }, "M10-QE-904");
    expect(r.ok && r.duplicates.map((d) => d.code)).toEqual(["M10-QE-901"]);
  });
});
