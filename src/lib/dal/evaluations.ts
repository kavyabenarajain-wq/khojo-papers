import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as s from "../db/schema";
import type { Executor } from "../db/types";

/** One evaluation with everything the results page shows. RLS limits it to the owner (or a reviewer). */
export async function getEvaluationView(db: Executor, evaluationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(evaluationId)) return null;
  const [ev] = await db.select().from(s.evaluations).where(eq(s.evaluations.id, evaluationId));
  if (!ev) return null;
  const [resp] = await db.select().from(s.responses).where(eq(s.responses.id, ev.responseId));
  if (!resp) return null;
  const [rev] = await db.select().from(s.questionRevisions).where(eq(s.questionRevisions.id, resp.questionRevisionId));
  const [q] = await db.select({ id: s.questions.id, code: s.questions.code, chapterId: s.questions.chapterId }).from(s.questions).where(eq(s.questions.id, resp.questionId));
  const scores = await db
    .select({ score: s.criterionScores, criterion: s.rubricCriteria })
    .from(s.criterionScores)
    .leftJoin(s.rubricCriteria, eq(s.rubricCriteria.id, s.criterionScores.criterionId))
    .where(eq(s.criterionScores.evaluationId, ev.id))
    .orderBy(asc(s.rubricCriteria.position));
  const [transcript] = ev.transcriptId ? await db.select().from(s.transcripts).where(eq(s.transcripts.id, ev.transcriptId)) : [];
  const [solution] = await db
    .select()
    .from(s.solutionRevisions)
    .where(and(eq(s.solutionRevisions.questionRevisionId, rev.id), inArray(s.solutionRevisions.status, ["approved", "superseded"])))
    .orderBy(desc(s.solutionRevisions.revisionNumber))
    .limit(1);
  const [review] = await db.select().from(s.humanReviewRequests).where(eq(s.humanReviewRequests.evaluationId, ev.id));
  const later = await db.select().from(s.evaluations).where(and(eq(s.evaluations.responseId, resp.id), eq(s.evaluations.method, "teacher"))).orderBy(desc(s.evaluations.createdAt)).limit(1);
  return { evaluation: ev, response: resp, revision: rev, question: q, scores, transcript: transcript ?? null, solution: solution ?? null, review: review ?? null, teacherEvaluation: later[0] ?? null };
}
