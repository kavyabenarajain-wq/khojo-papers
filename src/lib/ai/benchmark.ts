import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as s from "../db/schema";
import type { Db } from "../db/types";
import type { AiProvider } from "./provider";
import { markAnswerText } from "./examiner";
import { checkMarking } from "../grading/invariants";
import { computeAgreement, type BenchmarkOutcome } from "../grading/agreement";
import { MARK_PROMPT_VERSION } from "./prompts/mark";

/**
 * Re-mark every teacher-marked benchmark answer with the live marking pipeline and store the
 * agreement metrics. Nothing is written to any student's records.
 */
export async function runBenchmark(deps: { provider: AiProvider; db: Db }, actorId: string, limit = 100) {
  const items = await deps.db.select().from(s.examinerBenchmarks).orderBy(asc(s.examinerBenchmarks.createdAt)).limit(limit);
  const outcomes: BenchmarkOutcome[] = [];
  const results: unknown[] = [];
  let model = "unknown";
  for (const item of items) {
    const [rubric] = await deps.db.select().from(s.rubricRevisions).where(eq(s.rubricRevisions.id, item.rubricRevisionId));
    const [revision] = await deps.db.select().from(s.questionRevisions).where(eq(s.questionRevisions.id, rubric.questionRevisionId));
    const criteria = await deps.db.select().from(s.rubricCriteria).where(eq(s.rubricCriteria.rubricRevisionId, rubric.id)).orderBy(asc(s.rubricCriteria.position));
    const [solution] = await deps.db
      .select()
      .from(s.solutionRevisions)
      .where(and(eq(s.solutionRevisions.questionRevisionId, revision.id), inArray(s.solutionRevisions.status, ["approved", "superseded"])))
      .orderBy(desc(s.solutionRevisions.revisionNumber))
      .limit(1);
    let aiStatus: BenchmarkOutcome["aiStatus"] = "failed";
    let aiTotal: number | null = null;
    let aiCriteria: Record<string, number> | null = null;
    if (solution) {
      const r = await markAnswerText(deps, {
        purpose: "benchmark",
        userId: null,
        revision,
        criteria,
        solution,
        studentAnswer: item.answerText,
        recognition: { source: "typed", legibility: null, uncertainSegments: [], editedByStudent: false },
        finalValueCheck: null,
        meta: { benchmarkId: item.id },
      });
      if (r.ok) {
        model = r.model;
        const rep = checkMarking(r.data, criteria.map((c) => ({ key: c.criterionKey, marks: c.marksAvailable })), item.answerText);
        if (r.data.status === "cannot_evaluate") aiStatus = "not_evaluable";
        else {
          aiStatus = r.data.status === "needs_review" || rep.anyUncertain || r.data.humanReviewRecommended ? "needs_review" : "completed";
          aiTotal = rep.total;
          aiCriteria = Object.fromEntries(r.data.criteria.map((c) => [c.key, c.marksAwarded]));
        }
      }
    }
    const outcome: BenchmarkOutcome = {
      itemId: item.id,
      category: item.category,
      answerFormat: revision.answerFormat,
      teacherTotal: item.teacherTotal,
      teacherCriteria: item.teacherCriteria,
      expectNeedsReview: item.expectNeedsReview,
      aiTotal,
      aiCriteria,
      aiStatus,
    };
    outcomes.push(outcome);
    results.push(outcome);
  }
  const metrics = computeAgreement(outcomes);
  const [run] = await deps.db
    .insert(s.benchmarkRuns)
    .values({ createdBy: actorId, model, promptVersion: MARK_PROMPT_VERSION, itemCount: items.length, metrics: metrics as unknown as Record<string, unknown>, results })
    .returning();
  return { runId: run.id, metrics };
}
