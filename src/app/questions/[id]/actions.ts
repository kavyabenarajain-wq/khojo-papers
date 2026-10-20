"use server";

import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { runAs } from "@/lib/db/rls";
import { getViewer } from "@/lib/auth/session";
import { consentSettled, isStaff } from "@/lib/auth/rbac";
import { isPreviewMode } from "@/lib/preview";
import { clientIpHash } from "@/lib/auth/request";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentRubric, getQuestionDetail, getSolution } from "@/lib/dal/questions";
import {
  checkWithoutSaving,
  parseAnswer,
  PracticeError,
  recordReveal,
  recordSelfAssessment,
  reportIssue,
  saveDraft,
  submitPractice,
  toggleBookmark,
} from "@/lib/dal/practice";
import { buildRubric, buildWhiteboard, type RubricPayload, type WhiteboardPayload } from "@/lib/content/payloads";
import type { DeterministicResult, PartResult } from "@/lib/grading/deterministic";

type Fail = { ok: false; error: string; code?: "signin" | "consent" | "rate" };
const fail = (error: string, code?: Fail["code"]): Fail => ({ ok: false, error, code });
const Id = z.string().uuid();

function message(e: unknown): string {
  if (e instanceof PracticeError) return e.message;
  console.error(e);
  return "Something went wrong on our side. Your answer is still on this page; please try again.";
}

async function signedInViewer() {
  const v = await getViewer();
  return v && !v.needsProfile ? v : null;
}

export async function saveDraftAction(questionId: string, rawAnswer: unknown): Promise<{ ok: true; savedAt: string } | Fail> {
  if (!Id.safeParse(questionId).success) return fail("Unknown question.");
  const v = await signedInViewer();
  if (!v) return fail("Sign in to save drafts.", "signin");
  if (!consentSettled(v)) return fail("Saving is paused until your parent or guardian confirms consent.", "consent");
  try {
    const answer = parseAnswer(rawAnswer);
    const r = await runAs(getDb(), v.id, (tx) => saveDraft(tx, v.id, questionId, answer));
    return { ok: true, savedAt: r.savedAt.toISOString() };
  } catch (e) {
    return fail(message(e));
  }
}

export type SubmitOutcome = {
  ok: true;
  saved: boolean;
  responseId: string | null;
  deterministic: DeterministicResult | null;
  finalValueCheck: PartResult | null;
  needsRubricMarking: boolean;
};

export async function submitAnswerAction(questionId: string, rawAnswer: unknown): Promise<SubmitOutcome | Fail> {
  if (!Id.safeParse(questionId).success) return fail("Unknown question.");
  const v = await signedInViewer();
  const db = getDb();
  try {
    const answer = parseAnswer(rawAnswer);
    const limit = await rateLimit(db, `submit:${v?.id ?? await clientIpHash()}`, 60, 600);
    if (!limit.ok) return fail("You're submitting very quickly. Please wait a few minutes.", "rate");
    if (!v || !consentSettled(v)) {
      const r = await checkWithoutSaving(db, questionId, answer);
      return { ok: true, saved: false, responseId: null, deterministic: r.deterministic, finalValueCheck: r.finalValueCheck, needsRubricMarking: !r.deterministic?.complete };
    }
    const r = await submitPractice(db, v.id, questionId, answer);
    return { ok: true, saved: true, responseId: r.responseId, deterministic: r.deterministic, finalValueCheck: r.finalValueCheck, needsRubricMarking: r.needsRubricMarking };
  } catch (e) {
    return fail(message(e));
  }
}

export async function revealSolutionAction(questionId: string): Promise<{ ok: true; whiteboard: WhiteboardPayload; rubric: RubricPayload | null } | Fail> {
  if (!Id.safeParse(questionId).success) return fail("Unknown question.");
  const v = await signedInViewer();
  const preview = isStaff(v) && (await isPreviewMode());
  try {
    return await runAs(getDb(), v?.id ?? null, async (tx) => {
      const q = await getQuestionDetail(tx, questionId, { preview });
      const sol = q && (await getSolution(tx, questionId, { preview }));
      if (!q || !sol) return fail("A worked solution isn't available for this question.");
      const rubric = await getCurrentRubric(tx, questionId, { preview });
      if (v && consentSettled(v) && q.publicationStatus === "published") await recordReveal(tx, v.id, questionId, sol.id);
      return { ok: true as const, whiteboard: buildWhiteboard(sol, q.revision.content), rubric: rubric ? buildRubric(rubric) : null };
    });
  } catch (e) {
    return fail(message(e));
  }
}

export async function toggleBookmarkAction(questionId: string): Promise<{ ok: true; bookmarked: boolean } | Fail> {
  if (!Id.safeParse(questionId).success) return fail("Unknown question.");
  const v = await signedInViewer();
  if (!v) return fail("Sign in to bookmark questions.", "signin");
  try {
    const bookmarked = await runAs(getDb(), v.id, (tx) => toggleBookmark(tx, v.id, questionId));
    return { ok: true, bookmarked };
  } catch (e) {
    return fail(message(e));
  }
}

export async function selfAssessAction(responseId: string, marks: Record<string, number>): Promise<{ ok: true; awarded: number; maximum: number } | Fail> {
  if (!Id.safeParse(responseId).success) return fail("Unknown answer.");
  const v = await signedInViewer();
  if (!v) return fail("Sign in to record a self-assessment.", "signin");
  const parsed = z.record(z.string().max(32), z.number().min(0).max(20)).safeParse(marks);
  if (!parsed.success) return fail("Choose a mark for every criterion.");
  try {
    const r = await runAs(getDb(), v.id, (tx) => recordSelfAssessment(tx, v.id, responseId, parsed.data));
    return { ok: true, awarded: r.awarded, maximum: r.maximum };
  } catch (e) {
    return fail(message(e));
  }
}

const ReportSchema = z.object({
  category: z.enum(["question_error", "solution_error", "rendering", "marking", "copyright", "other"]),
  message: z.string().trim().min(10, "Please describe the problem in a sentence or two.").max(2000),
});

export async function reportIssueAction(questionId: string, input: unknown): Promise<{ ok: true } | Fail> {
  if (!Id.safeParse(questionId).success) return fail("Unknown question.");
  const parsed = ReportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const v = await signedInViewer();
  const db = getDb();
  const limit = await rateLimit(db, `report:${v?.id ?? await clientIpHash()}`, 10, 3600);
  if (!limit.ok) return fail("Too many reports from you in the last hour. Please try again later.", "rate");
  try {
    await reportIssue(db, { questionId, userId: v?.id ?? null, ...parsed.data });
    return { ok: true };
  } catch (e) {
    return fail(message(e));
  }
}
