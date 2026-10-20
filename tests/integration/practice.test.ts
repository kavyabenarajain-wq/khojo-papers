import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, createUser, type TestDb } from "../helpers/db";
import { approveAndPublishAll } from "../helpers/publish";
import { runAs } from "@/lib/db/rls";
import * as s from "@/lib/db/schema";
import { loadSeedContent } from "@/lib/content/seed-loader";
import { libraryFacets, searchQuestions } from "@/lib/dal/library";
import { getPracticeState, getQuestionDetail, getSolution } from "@/lib/dal/questions";
import { recordSelfAssessment, saveDraft, submitPractice, toggleBookmark, PracticeError } from "@/lib/dal/practice";

let t: TestDb;
let alice: string;
let bob: string;
let minor: string;
let mcqId: string;
let workingId: string;

beforeAll(async () => {
  t = await createTestDb();
  const reviewer = await createUser(t, { roles: ["student", "teacher_reviewer"] });
  alice = await createUser(t);
  bob = await createUser(t);
  minor = await createUser(t, { ageBracket: "under_18", consent: "pending" });
  await loadSeedContent(t.db, "tests/fixtures/seed");
  await approveAndPublishAll(t, reviewer);
  mcqId = (await t.db.select().from(s.questions).where(eq(s.questions.code, "M10-CIR-002")))[0].id;
  workingId = (await t.db.select().from(s.questions).where(eq(s.questions.code, "M10-CIR-001")))[0].id;
});
afterAll(async () => t.close());

describe("library", () => {
  it("searches published questions with full-text search and filters", async () => {
    const all = await runAs(t.db, null, (tx) => searchQuestions(tx, {}, { userId: null, preview: false }));
    expect(all.total).toBe(2);
    const semicircle = await runAs(t.db, null, (tx) => searchQuestions(tx, { q: "semicircle" }, { userId: null, preview: false }));
    expect(semicircle.items.map((i) => i.code)).toEqual(["M10-CIR-002"]);
    const byFormat = await runAs(t.db, null, (tx) => searchQuestions(tx, { format: "math_working", chapter: "circles", marks: 3 }, { userId: null, preview: false }));
    expect(byFormat.items.map((i) => i.code)).toEqual(["M10-CIR-001"]);
    const none = await runAs(t.db, null, (tx) => searchQuestions(tx, { source: "official_pyq" }, { userId: null, preview: false }));
    expect(none.total).toBe(0);
    // Hostile search input is treated as text, not syntax.
    const odd = await runAs(t.db, null, (tx) => searchQuestions(tx, { q: "'):& | !(" }, { userId: null, preview: false }));
    expect(odd.total).toBe(0);
  });

  it("offers only filter values that exist", async () => {
    const f = await runAs(t.db, null, (tx) => libraryFacets(tx, { preview: false }));
    expect(f.examYears).toEqual([]);
    expect(f.marks).toEqual([1, 3]);
    expect(f.sources.find((x) => x.value === "original_practice")?.count).toBe(2);
    expect(f.sources.find((x) => x.value === "official_pyq")?.count).toBe(0);
  });

  it("paginates", async () => {
    const p1 = await runAs(t.db, null, (tx) => searchQuestions(tx, {}, { userId: null, preview: false, pageSize: 1, page: 1 }));
    const p2 = await runAs(t.db, null, (tx) => searchQuestions(tx, {}, { userId: null, preview: false, pageSize: 1, page: 2 }));
    expect(p1.pageCount).toBe(2);
    expect(p1.items[0].code).not.toBe(p2.items[0].code);
  });
});

describe("question detail", () => {
  it("never exposes the answer key or solution", async () => {
    const d = await runAs(t.db, null, (tx) => getQuestionDetail(tx, mcqId, { preview: false }));
    expect(d).not.toBeNull();
    const json = JSON.stringify(d);
    expect(json).not.toContain("answerKey");
    expect(json).not.toContain("correct");
    expect(d!.objective).toBe(true);
    expect(d!.revision.aiAssisted).toBe(true);
    const sol = await runAs(t.db, null, (tx) => getSolution(tx, mcqId, { preview: false }));
    expect(sol?.finalAnswer).toBe("(c)");
  });
});

describe("practice", () => {
  it("autosaves drafts pinned to the published revision", async () => {
    const first = await runAs(t.db, alice, (tx) => saveDraft(tx, alice, workingId, { text: "angle at centre" }));
    const second = await runAs(t.db, alice, (tx) => saveDraft(tx, alice, workingId, { text: "angle at centre is double" }));
    expect(second.responseId).toBe(first.responseId);
    const state = await runAs(t.db, alice, (tx) => getPracticeState(tx, alice, workingId));
    expect(state.draft?.answer.text).toBe("angle at centre is double");
  });

  it("marks MCQs deterministically and records the evaluation", async () => {
    const wrong = await submitPractice(t.db, alice, mcqId, { choice: "a" });
    expect(wrong.deterministic).toMatchObject({ complete: true, awarded: 0, maximum: 1 });
    const right = await submitPractice(t.db, alice, mcqId, { choice: "c" });
    expect(right.deterministic?.awarded).toBe(1);
    const lib = await runAs(t.db, alice, (tx) => searchQuestions(tx, { status: "attempted" }, { userId: alice, preview: false }));
    expect(lib.items.map((i) => i.code)).toEqual(["M10-CIR-002"]);
    expect(lib.items[0].attemptStatus).toBe("correct");
    const unattempted = await runAs(t.db, alice, (tx) => searchQuestions(tx, { status: "unattempted" }, { userId: alice, preview: false }));
    expect(unattempted.items.map((i) => i.code)).toEqual(["M10-CIR-001"]);
  });

  it("leaves working-based answers for rubric marking and supports self-assessment", async () => {
    const res = await submitPractice(t.db, alice, workingId, { text: "∠ACB = 110/2 = 55°", value: "55", unit: "°" });
    expect(res.needsRubricMarking).toBe(true);
    expect(res.evaluationId).toBeNull();
    expect(res.finalValueCheck?.correct).toBe(true);
    await expect(runAs(t.db, alice, (tx) => recordSelfAssessment(tx, alice, res.responseId, { theorem: 1 }))).rejects.toThrow(PracticeError);
    const self = await runAs(t.db, alice, (tx) => recordSelfAssessment(tx, alice, res.responseId, { theorem: 1, method: 1, answer: 5 }));
    expect(self).toMatchObject({ awarded: 3, maximum: 3 });
    const [ev] = await t.db.select().from(s.evaluations).where(eq(s.evaluations.id, self.evaluationId));
    expect(ev.method).toBe("self");
  });

  it("keeps each student's work private", async () => {
    const bobSees = await runAs(t.db, bob, (tx) => tx.select().from(s.responses));
    expect(bobSees).toEqual([]);
    expect(await runAs(t.db, bob, (tx) => tx.select().from(s.evaluations))).toEqual([]);
    expect(await runAs(t.db, null, (tx) => tx.select().from(s.attempts))).toEqual([]);
    const alicesResponse = (await t.db.select().from(s.responses).where(eq(s.responses.userId, alice)))[0];
    await expect(runAs(t.db, bob, (tx) => recordSelfAssessment(tx, bob, alicesResponse.id, {}))).rejects.toThrow(/not found/);
    const bobState = await runAs(t.db, bob, (tx) => getPracticeState(tx, bob, workingId));
    expect(bobState).toEqual({ bookmarked: false, draft: null, history: [] });
  });

  it("blocks saving work until guardian consent is settled", async () => {
    await expect(submitPractice(t.db, minor, mcqId, { choice: "c" })).rejects.toThrow(/consent/);
    await expect(runAs(t.db, minor, (tx) => saveDraft(tx, minor, mcqId, { choice: "c" }))).rejects.toThrow();
    expect(await runAs(t.db, minor, (tx) => toggleBookmark(tx, minor, mcqId))).toBe(true);
  });

  it("does not let submitted answers change", async () => {
    const [locked] = await t.db.select().from(s.responses).where(eq(s.responses.locked, true));
    await expect(t.db.update(s.responses).set({ answer: { choice: "b" } }).where(eq(s.responses.id, locked.id))).rejects.toThrow();
  });
});
