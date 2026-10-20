import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, createUser, expectDbError, type TestDb } from "../helpers/db";
import { runAs } from "@/lib/db/rls";
import * as s from "@/lib/db/schema";
import { loadSeedContent } from "@/lib/content/seed-loader";
import { decideRevision, publishPaper, publishQuestion, ReviewError, unpublishQuestion } from "@/lib/dal/review";

let t: TestDb;
let reviewer: string;
let editor: string;
let student: string;

beforeAll(async () => {
  t = await createTestDb();
  reviewer = await createUser(t, { roles: ["student", "teacher_reviewer"] });
  editor = await createUser(t, { roles: ["student", "content_editor"] });
  student = await createUser(t);
  const report = await loadSeedContent(t.db, "tests/fixtures/seed");
  expect(report.questionsAdded).toBe(2);
  expect(report.papersAdded).toBe(1);
});
afterAll(async () => t.close());

const R = () => ({ id: reviewer, roles: ["student", "teacher_reviewer"] });
const questionId = async (code: string) => (await t.db.select().from(s.questions).where(eq(s.questions.code, code)))[0].id;

async function revisionIds(qid: string) {
  const [q] = await t.db.select().from(s.questionRevisions).where(eq(s.questionRevisions.questionId, qid));
  const [sol] = await t.db.select().from(s.solutionRevisions).where(eq(s.solutionRevisions.questionId, qid));
  const [rub] = await t.db.select().from(s.rubricRevisions).where(eq(s.rubricRevisions.questionId, qid));
  return { q: q.id, sol: sol.id, rub: rub.id };
}

describe("seeded content", () => {
  it("is in review, unpublished and invisible to students and the public", async () => {
    const all = await t.db.select().from(s.questions);
    expect(all.every((q) => q.publicationStatus === "draft" && q.sourceType === "original_practice")).toBe(true);
    const revs = await t.db.select().from(s.questionRevisions);
    expect(revs.every((r) => r.status === "in_review" && r.generation?.method === "ai_assisted_authoring")).toBe(true);
    expect(await runAs(t.db, null, (tx) => tx.select().from(s.questions))).toEqual([]);
    expect(await runAs(t.db, student, (tx) => tx.select().from(s.questionRevisions))).toEqual([]);
    expect((await runAs(t.db, editor, (tx) => tx.select().from(s.questions))).length).toBe(2);
  });

  it("is idempotent and never overwrites existing questions", async () => {
    const again = await loadSeedContent(t.db, "tests/fixtures/seed");
    expect(again).toMatchObject({ questionsAdded: 0, questionsSkipped: 2, papersAdded: 0 });
  });
});

describe("review and publishing", () => {
  it("does not let students or editors approve content", async () => {
    const qid = await questionId("M10-CIR-001");
    const ids = await revisionIds(qid);
    // RLS hides the row from students, so the update silently matches nothing.
    await runAs(t.db, student, (tx) =>
      tx.execute(sql`update app.question_revisions set status = 'approved', reviewed_by = ${student}, reviewed_at = now() where id = ${ids.q}`),
    );
    const [still] = await t.db.select().from(s.questionRevisions).where(eq(s.questionRevisions.id, ids.q));
    expect(still.status).toBe("in_review");
    await expectDbError(
      runAs(t.db, editor, (tx) => tx.execute(sql`update app.question_revisions set status = 'approved', reviewed_by = ${editor}, reviewed_at = now() where id = ${ids.q}`)),
      /Only teacher reviewers or administrators can approve/,
    );
  });

  it("will not publish until question and solution are approved", async () => {
    const qid = await questionId("M10-CIR-001");
    await expect(runAs(t.db, reviewer, (tx) => publishQuestion(tx, R(), qid))).rejects.toThrow(ReviewError);
    const ids = await revisionIds(qid);
    await runAs(t.db, reviewer, (tx) => decideRevision(tx, R(), "question", ids.q, "approved", null));
    await expect(runAs(t.db, reviewer, (tx) => publishQuestion(tx, R(), qid))).rejects.toThrow(/solution/);
    await runAs(t.db, reviewer, (tx) => decideRevision(tx, R(), "solution", ids.sol, "approved", null));
    await runAs(t.db, reviewer, (tx) => decideRevision(tx, R(), "rubric", ids.rub, "approved", null));
    const res = await runAs(t.db, reviewer, (tx) => publishQuestion(tx, R(), qid));
    expect(res).toEqual({ revision: 1, hasRubric: true });

    const visible = await runAs(t.db, null, (tx) => tx.select({ code: s.questions.code }).from(s.questions));
    expect(visible).toEqual([{ code: "M10-CIR-001" }]);
    const revs = await runAs(t.db, null, (tx) => tx.select({ id: s.questionRevisions.id }).from(s.questionRevisions));
    expect(revs).toEqual([{ id: ids.q }]);
    const reviews = await t.db.select().from(s.contentReviews);
    expect(reviews.filter((r) => r.decision === "approved")).toHaveLength(3);
  });

  it("keeps approved revisions immutable", async () => {
    const ids = await revisionIds(await questionId("M10-CIR-001"));
    await expectDbError(
      t.db.execute(sql`update app.question_revisions set marks = 5 where id = ${ids.q}`),
      /cannot change/,
    );
    await expectDbError(t.db.execute(sql`update app.rubric_criteria set marks_available = 3 where rubric_revision_id = ${ids.rub}`), /cannot change/);
    await expectDbError(t.db.execute(sql`delete from app.solution_revisions where id = ${ids.sol}`), /Only draft revisions/);
  });

  it("requires a comment when requesting changes, and blocks self-approval", async () => {
    const qid = await questionId("M10-CIR-002");
    const ids = await revisionIds(qid);
    await expect(runAs(t.db, reviewer, (tx) => decideRevision(tx, R(), "question", ids.q, "changes_requested", " "))).rejects.toThrow(/explain/);
    // Simulate the reviewer having authored it (edits are only possible in draft).
    await t.db.execute(sql`update app.question_revisions set status = 'draft' where id = ${ids.q}`);
    await t.db.execute(sql`update app.question_revisions set created_by = ${reviewer} where id = ${ids.q}`);
    await t.db.execute(sql`update app.question_revisions set status = 'in_review' where id = ${ids.q}`);
    await expect(runAs(t.db, reviewer, (tx) => decideRevision(tx, R(), "question", ids.q, "approved", null))).rejects.toThrow(/someone else/);
  });

  it("blocks publishing content without cleared rights", async () => {
    await expectDbError(
      t.db.execute(sql`update app.questions set permission_status = 'reference_only' where code = 'M10-CIR-001'`),
      /permission status is reference_only/,
    );
  });

  it("only publishes papers whose questions are all published, and unpublishing a question takes its papers down", async () => {
    const [paper] = await t.db.select().from(s.papers);
    await expect(runAs(t.db, reviewer, (tx) => publishPaper(tx, R(), paper.id))).rejects.toThrow(/M10-CIR-002/);
    expect(paper.maximumMarks).toBe(4);
    const qid = await questionId("M10-CIR-001");
    await runAs(t.db, reviewer, (tx) => unpublishQuestion(tx, R(), qid, "Typo in stem"));
    expect(await runAs(t.db, null, (tx) => tx.select().from(s.questions))).toEqual([]);
    const log = await t.db.select().from(s.auditLog).where(eq(s.auditLog.action, "question.unpublished"));
    expect(log[0]).toMatchObject({ actorId: reviewer, details: { reason: "Typo in stem" } });
  });
});
