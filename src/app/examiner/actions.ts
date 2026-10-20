"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { runAs } from "@/lib/db/rls";
import * as s from "@/lib/db/schema";
import { getViewer } from "@/lib/auth/session";
import { consentSettled } from "@/lib/auth/rbac";
import { env, integrations } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { azureProvider } from "@/lib/ai/azure";
import { confirmTranscript, createExaminerResponse, evaluateResponse, ExaminerError, recognizeAnswer, requestHumanReview } from "@/lib/ai/examiner";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { TranscriptSegment } from "@/lib/content/types";

type Fail = { ok: false; error: string };
const Id = z.string().uuid();

async function examinerViewer() {
  const v = await getViewer();
  if (!v || v.needsProfile) throw new ExaminerError("Your session has expired. Please sign in again.");
  if (!consentSettled(v)) throw new ExaminerError("Your parent or guardian needs to confirm consent first.", "consent");
  if (!integrations.ai) throw new ExaminerError("The AI Examiner isn't connected to an AI service on this server yet.", "not_evaluable");
  return v;
}

async function aiQuota(userId: string) {
  const r = await rateLimit(getDb(), `ai-day:${userId}`, env.AI_DAILY_LIMIT_PER_USER, 86400);
  if (!r.ok) throw new ExaminerError(`You've reached today's limit of ${env.AI_DAILY_LIMIT_PER_USER} AI checks. It resets within 24 hours; you can still mark answers yourself against the rubric.`);
}

function failMessage(e: unknown): Fail {
  if (e instanceof ExaminerError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Something went wrong on our side. Nothing was marked; please try again." };
}

export type RecognizeResult =
  | { ok: true; transcriptId: string; status: "ready" | "unreadable" | "failed"; legibility: string | null; text: string; segments: TranscriptSegment[]; notes: string | null }
  | Fail;

export async function recognizeAction(responseId: string, uploadId: string): Promise<RecognizeResult> {
  if (!Id.safeParse(responseId).success || !Id.safeParse(uploadId).success) return { ok: false, error: "Unknown upload." };
  try {
    const v = await examinerViewer();
    await aiQuota(v.id);
    const db = getDb();
    const [u] = await db.select().from(s.uploads).where(and(eq(s.uploads.id, uploadId), eq(s.uploads.userId, v.id)));
    if (!u) throw new ExaminerError("Upload not found.", "not_found");
    const { data, error } = await supabaseAdmin().storage.from(u.bucket).download(u.storagePath);
    if (error || !data) throw new ExaminerError("We couldn't read the stored photo. Please upload it again.");
    const dataUrl = `data:image/jpeg;base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`;
    const r = await recognizeAnswer({ provider: azureProvider, db }, { userId: v.id, responseId, uploadId, imageDataUrl: dataUrl });
    return { ok: true, transcriptId: r.transcript.id, status: r.transcript.status, legibility: r.transcript.legibility, text: r.transcript.aiText ?? "", segments: r.transcript.segments, notes: r.transcript.notes };
  } catch (e) {
    return failMessage(e);
  }
}

export async function confirmAndEvaluateAction(responseId: string, transcriptId: string, text: string): Promise<Fail> {
  if (!Id.safeParse(responseId).success || !Id.safeParse(transcriptId).success) return { ok: false, error: "Unknown answer." };
  let evaluationId: string;
  try {
    const v = await examinerViewer();
    await runAs(getDb(), v.id, (tx) => confirmTranscript(tx, v.id, transcriptId, text));
    await aiQuota(v.id);
    ({ evaluationId } = await evaluateResponse({ provider: azureProvider, db: getDb() }, { userId: v.id, responseId }));
  } catch (e) {
    return failMessage(e);
  }
  redirect(`/examiner/result/${evaluationId}`);
}

/** Mark a typed answer: either an existing submitted response, or new text. */
export async function evaluateTypedAction(questionId: string, responseId: string | null, text: string | null): Promise<Fail> {
  if (!Id.safeParse(questionId).success || (responseId && !Id.safeParse(responseId).success)) return { ok: false, error: "Unknown question." };
  let evaluationId: string;
  try {
    const v = await examinerViewer();
    await aiQuota(v.id);
    const db = getDb();
    let rid = responseId;
    if (!rid) {
      const clean = (text ?? "").trim();
      if (clean.length < 2) throw new ExaminerError("Write your answer first.");
      rid = await createExaminerResponse(db, v.id, questionId, clean.slice(0, 20000));
    }
    ({ evaluationId } = await evaluateResponse({ provider: azureProvider, db }, { userId: v.id, responseId: rid }));
  } catch (e) {
    return failMessage(e);
  }
  redirect(`/examiner/result/${evaluationId}`);
}

export async function requestReviewAction(evaluationId: string, reason: string): Promise<{ ok: true } | Fail> {
  if (!Id.safeParse(evaluationId).success) return { ok: false, error: "Unknown evaluation." };
  const v = await getViewer();
  if (!v || v.needsProfile) return { ok: false, error: "Please sign in again." };
  try {
    await runAs(getDb(), v.id, (tx) => requestHumanReview(tx, v.id, evaluationId, reason));
    return { ok: true };
  } catch (e) {
    return failMessage(e);
  }
}
