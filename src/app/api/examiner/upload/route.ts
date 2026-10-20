import { NextResponse, type NextRequest } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { getViewer } from "@/lib/auth/session";
import { consentSettled } from "@/lib/auth/rbac";
import { isSameOrigin } from "@/lib/auth/request";
import { rateLimit } from "@/lib/rate-limit";
import { integrations } from "@/lib/env";
import { BUCKETS, supabaseAdmin } from "@/lib/supabase/admin";
import { ImageError, MAX_UPLOAD_BYTES, processAnswerImage } from "@/lib/storage/images";
import { createExaminerResponse, ExaminerError } from "@/lib/ai/examiner";

const err = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** Upload a photo of a handwritten answer. Returns the response and upload ids for recognition. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return err(403, "Cross-site requests are not allowed.");
  if (!integrations.supabase || !integrations.database) return err(503, "Uploads aren't available on this server yet.");
  if (!integrations.ai) return err(503, "The AI Examiner isn't connected to an AI service on this server yet.");
  const v = await getViewer();
  if (!v || v.needsProfile) return err(401, "Your session has expired. Please sign in again.");
  if (!consentSettled(v)) return err(403, "Your parent or guardian needs to confirm consent before you can upload answers.");
  const length = Number(req.headers.get("content-length") ?? 0);
  if (!length || length > MAX_UPLOAD_BYTES + 64 * 1024) return err(413, "That photo is larger than 8 MB.");

  const db = getDb();
  const limit = await rateLimit(db, `upload:${v.id}`, 30, 3600);
  if (!limit.ok) return err(429, "You've uploaded a lot of photos in the last hour. Please wait a little.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err(400, "The upload was interrupted. Please try again.");
  }
  const file = form.get("file");
  const ids = z.object({ questionId: z.string().uuid(), responseId: z.string().uuid().nullable() }).safeParse({
    questionId: form.get("questionId"),
    responseId: form.get("responseId") || null,
  });
  if (!(file instanceof File) || !ids.success) return err(400, "Missing photo or question.");

  let image: Awaited<ReturnType<typeof processAnswerImage>>;
  try {
    image = await processAnswerImage(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return err(422, e instanceof ImageError ? e.message : "We couldn't process that photo.");
  }

  // Use the student's existing submitted answer, or start a new examiner response.
  let responseId = ids.data.responseId;
  try {
    if (responseId) {
      const [r] = await db.select().from(s.responses).where(and(eq(s.responses.id, responseId), eq(s.responses.userId, v.id), eq(s.responses.questionId, ids.data.questionId)));
      if (!r || !r.locked) return err(404, "Answer not found.");
    } else {
      responseId = await createExaminerResponse(db, v.id, ids.data.questionId, null);
    }
  } catch (e) {
    return err(e instanceof ExaminerError && e.code === "not_found" ? 404 : 422, e instanceof Error ? e.message : "Can't use this question.");
  }

  const path = `${v.id}/${randomUUID()}.jpg`;
  const { error } = await supabaseAdmin().storage.from(BUCKETS.answers).upload(path, image.data, { contentType: "image/jpeg", upsert: false });
  if (error) {
    console.error("Storage upload failed", error.message);
    return err(502, "We couldn't store the photo. Please try again.");
  }
  const [u] = await db
    .insert(s.uploads)
    .values({
      userId: v.id,
      purpose: "answer_image",
      bucket: BUCKETS.answers,
      storagePath: path,
      mimeType: "image/jpeg",
      sizeBytes: image.data.length,
      width: image.width,
      height: image.height,
      sha256: createHash("sha256").update(image.data).digest("hex"),
    })
    .returning({ id: s.uploads.id });
  return NextResponse.json({ responseId, uploadId: u.id }, { headers: { "Cache-Control": "no-store" } });
}
