"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { runAs } from "@/lib/db/rls";
import { getViewer } from "@/lib/auth/session";
import { consentSettled } from "@/lib/auth/rbac";
import { PaperError, saveExamAnswer, startExam, submitExam } from "@/lib/dal/papers";
import { parseAnswer, PracticeError } from "@/lib/dal/practice";
import { rateLimit } from "@/lib/rate-limit";

const Id = z.string().uuid();

export async function startExamAction(paperId: string, slug: string): Promise<{ ok: false; error: string }> {
  const v = await getViewer();
  if (!v || v.needsProfile) redirect(`/login?next=/papers/${slug}`);
  if (!Id.safeParse(paperId).success) return { ok: false, error: "Unknown paper." };
  if (!consentSettled(v)) return { ok: false, error: "Your parent or guardian needs to confirm consent before you can take a timed paper." };
  let attemptId: string;
  try {
    ({ attemptId } = await startExam(getDb(), v.id, paperId));
  } catch (e) {
    if (e instanceof PaperError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Couldn't start the paper. Please try again." };
  }
  redirect(`/papers/${slug}/attempt/${attemptId}`);
}

export async function saveExamAnswerAction(attemptId: string, responseId: string, raw: unknown): Promise<{ ok: true; savedAt: string } | { ok: false; error: string; final?: boolean }> {
  if (!Id.safeParse(attemptId).success || !Id.safeParse(responseId).success) return { ok: false, error: "Unknown answer." };
  const v = await getViewer();
  if (!v || v.needsProfile) return { ok: false, error: "Your session has expired. Sign in again; your saved answers are kept." };
  const limit = await rateLimit(getDb(), `exam-save:${v.id}`, 600, 600);
  if (!limit.ok) return { ok: false, error: "Saving too often; retrying shortly." };
  try {
    const answer = parseAnswer(raw);
    const at = await runAs(getDb(), v.id, (tx) => saveExamAnswer(tx, v.id, attemptId, responseId, answer));
    return { ok: true, savedAt: at.toISOString() };
  } catch (e) {
    if (e instanceof PaperError || e instanceof PracticeError) return { ok: false, error: e.message, final: /submitted|Time is up/.test(e.message) };
    console.error(e);
    return { ok: false, error: "Couldn't save. We'll keep retrying." };
  }
}

export async function submitExamAction(attemptId: string, slug: string): Promise<{ ok: false; error: string }> {
  const v = await getViewer();
  if (!v || v.needsProfile) redirect(`/login?next=/papers/${slug}/attempt/${attemptId}`);
  if (!Id.safeParse(attemptId).success) return { ok: false, error: "Unknown attempt." };
  try {
    await submitExam(getDb(), v.id, attemptId);
  } catch (e) {
    if (e instanceof PaperError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Couldn't submit. Your answers are saved; please try again." };
  }
  redirect(`/papers/${slug}/results/${attemptId}`);
}
