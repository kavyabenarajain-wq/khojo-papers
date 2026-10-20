import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import * as s from "./db/schema";
import { supabaseAdmin } from "./supabase/admin";
import { recordDeletion, uploadPaths } from "./dal/account";

/**
 * Permanently delete an account and everything attached to it:
 * uploaded photos (storage), AI request logs, then the Supabase auth user, whose deletion
 * cascades to the profile, attempts, answers, marks, bookmarks and consent records.
 * Only an anonymous completion record is kept.
 */
export async function deleteAccountCompletely(userId: string, reason: "user_request" | "consent_withdrawn" | "consent_expired"): Promise<void> {
  const db = getDb();
  const admin = supabaseAdmin();
  try {
    const files = await uploadPaths(db, userId);
    const byBucket = new Map<string, string[]>();
    for (const f of files) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path]);
    for (const [bucket, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw new Error(`Storage deletion failed: ${error.message}`);
      }
    }
    await db.delete(s.aiRuns).where(eq(s.aiRuns.userId, userId));
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message)) throw new Error(`Auth deletion failed: ${error.message}`);
    // If the auth user was already gone, make sure the profile (and its cascade) is too.
    await db.delete(s.profiles).where(eq(s.profiles.id, userId));
    await recordDeletion(db, reason, true);
  } catch (e) {
    await recordDeletion(db, reason, false, e instanceof Error ? e.message.slice(0, 200) : "unknown error");
    throw e;
  }
}
