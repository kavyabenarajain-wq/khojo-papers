import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { createTestDb, createUser, type TestDb } from "../helpers/db";
import { approveAndPublishAll } from "../helpers/publish";
import * as s from "@/lib/db/schema";
import { runAs } from "@/lib/db/rls";
import { loadSeedContent } from "@/lib/content/seed-loader";
import { createQuestion, EditorError, latestRevisions, saveQuestionDraft, saveRubricDraft, saveSolutionDraft } from "@/lib/dal/editor";
import { decideRevision, publishQuestion, submitForReview } from "@/lib/dal/review";

let t: TestDb;
let editor: string;
let reviewer: string;
let qid: string;
const E = () => ({ id: editor, roles: ["content_editor"] });
const R = () => ({ id: reviewer, roles: ["teacher_reviewer"] });

beforeAll(async () => {
  t = await createTestDb();
  editor = await createUser(t, { roles: ["student", "content_editor"] });
  reviewer = await createUser(t, { roles: ["student", "teacher_reviewer"] });
  await loadSeedContent(t.db, "tests/fixtures/seed");
  await approveAndPublishAll(t, reviewer);
  qid = (await t.db.select().from(s.questions).where(eq(s.questions.code, "M10-CIR-001")))[0].id;
});
afterAll(async () => t.close());

describe("editing published content", () => {
  it("creates a new draft revision (never overwrites the approved one) and carries solution and rubric forward", async () => {
    const before = await runAs(t.db, editor, (tx) => latestRevisions(tx, qid));
    const draft = {
      answerFormat: before.question!.answerFormat,
      marks: before.question!.marks,
      difficulty: before.question!.difficulty,
      content: { ...before.question!.content, stem: before.question!.content.stem.replace("Give a reason", "State a reason") },
      answerKey: before.question!.answerKey ?? null,
      hints: before.question!.hints,
      changeNote: "Clarified wording",
    };
    const revId = await runAs(t.db, editor, (tx) => saveQuestionDraft(tx, E(), qid, draft));
    const after = await runAs(t.db, editor, (tx) => latestRevisions(tx, qid));
    expect(after.question).toMatchObject({ id: revId, revisionNumber: 2, status: "draft" });
    expect(after.solution).toMatchObject({ questionRevisionId: revId, status: "draft" });
    expect(after.rubric).toMatchObject({ questionRevisionId: revId, status: "draft" });
    expect(after.criteria).toHaveLength(3);
    const [q] = await t.db.select().from(s.questions).where(eq(s.questions.id, qid));
    expect(q.publishedRevisionId).toBe(before.question!.id);
    const [old] = await t.db.select().from(s.questionRevisions).where(eq(s.questionRevisions.id, before.question!.id));
    expect(old.content.stem).toContain("Give a reason");
  });

  it("edits the draft in place on further saves", async () => {
    const latest = await runAs(t.db, editor, (tx) => latestRevisions(tx, qid));
    const id = await runAs(t.db, editor, (tx) =>
      saveQuestionDraft(tx, E(), qid, { answerFormat: latest.question!.answerFormat, marks: 3, difficulty: "easy", content: latest.question!.content, answerKey: latest.question!.answerKey ?? null, hints: [], changeNote: "Removed hints" }),
    );
    expect(id).toBe(latest.question!.id);
  });

  it("goes through review and republishes, superseding the old revision", async () => {
    const latest = await runAs(t.db, editor, (tx) => latestRevisions(tx, qid));
    await runAs(t.db, editor, (tx) => submitForReview(tx, E(), "question", latest.question!.id));
    await runAs(t.db, editor, (tx) => submitForReview(tx, E(), "solution", latest.solution!.id));
    await runAs(t.db, editor, (tx) => submitForReview(tx, E(), "rubric", latest.rubric!.id));
    await expect(runAs(t.db, editor, (tx) => saveSolutionDraft(tx, E(), qid, { modelAnswer: "x", finalAnswer: "x", steps: [{ n: 1, explanation: "x", isFinal: true }], commonMistakes: [], alternativeMethods: [], changeNote: "xxx" }))).rejects.toThrow(EditorError);
    // The editor wrote these revisions, so they cannot approve them; the reviewer can.
    await expect(runAs(t.db, editor, (tx) => decideRevision(tx, { id: editor, roles: ["content_editor", "teacher_reviewer"] }, "question", latest.question!.id, "approved", null))).rejects.toThrow(/someone else/);
    for (const [kind, id] of [["question", latest.question!.id], ["solution", latest.solution!.id], ["rubric", latest.rubric!.id]] as const) {
      await runAs(t.db, reviewer, (tx) => decideRevision(tx, R(), kind, id, "approved", null));
    }
    await runAs(t.db, reviewer, (tx) => publishQuestion(tx, R(), qid));
    const revs = await t.db.select().from(s.questionRevisions).where(eq(s.questionRevisions.questionId, qid)).orderBy(desc(s.questionRevisions.revisionNumber));
    expect(revs.map((r) => r.status)).toEqual(["approved", "superseded"]);
  });

  it("requires rubric criteria to add up before review", async () => {
    await runAs(t.db, editor, (tx) =>
      saveRubricDraft(tx, E(), qid, { notes: null, changeNote: "Rebalanced", criteria: [{ key: "a", description: "Everything", marks: 2, expectedEvidence: "All", acceptedAlternatives: [], commonErrors: [] }] }),
    );
    const latest = await runAs(t.db, editor, (tx) => latestRevisions(tx, qid));
    await expect(runAs(t.db, editor, (tx) => submitForReview(tx, E(), "rubric", latest.rubric!.id))).rejects.toThrow(/add up|criteria total/i);
  });

  it("does not let students edit, and official questions need a source document", async () => {
    const student = await createUser(t);
    const [ch] = await t.db.select().from(s.syllabusTopics).where(eq(s.syllabusTopics.slug, "circles"));
    const draft = { answerFormat: "short_answer" as const, marks: 1, difficulty: null, content: { stem: "What is a chord?" }, answerKey: null, hints: [], changeNote: "New" };
    const meta = { code: "M10-CIR-777", chapterId: ch.id, sourceType: "official_pyq" as const, sourceDocumentId: null, sourcePage: null, sourceQuestionNumber: null, examYear: 2024, permissionStatus: "unknown" as const };
    await expect(runAs(t.db, student, (tx) => createQuestion(tx, { id: student, roles: ["student"] }, meta, draft))).rejects.toThrow(EditorError);
    await expect(runAs(t.db, editor, (tx) => createQuestion(tx, E(), meta, draft))).rejects.toThrow(/source document/);
    const ok = await runAs(t.db, editor, (tx) => createQuestion(tx, E(), { ...meta, sourceType: "original_practice", examYear: null, permissionStatus: "own_content" }, draft));
    expect(ok.questionId).toBeTruthy();
  });
});
