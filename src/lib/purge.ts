import "server-only";
import { and, eq, isNull, lt, notExists, sql } from "drizzle-orm";
import { getDb } from "./db/client";
import * as s from "./db/schema";
import { env } from "./env";
import { expiredPendingAccounts } from "./dal/account";
import { deleteAccountCompletely } from "./account-deletion";
import { supabaseAdmin } from "./supabase/admin";

/** Retention jobs. Safe to run repeatedly (e.g. daily). */
export async function runPurge() {
  const db = getDb();
  const report = { expiredAccounts: 0, withdrawnAccounts: 0, aiRuns: 0, rateLimits: 0, orphanUploads: 0, errors: [] as string[] };

  for (const id of await expiredPendingAccounts(db, env.CONSENT_PENDING_TTL_DAYS)) {
    try {
      await deleteAccountCompletely(id, "consent_expired");
      report.expiredAccounts++;
    } catch (e) {
      report.errors.push(`expired ${id.slice(0, 8)}: ${(e as Error).message}`);
    }
  }
  const withdrawn = await db.select({ id: s.profiles.id }).from(s.profiles).where(eq(s.profiles.consentStatus, "withdrawn"));
  for (const { id } of withdrawn) {
    try {
      await deleteAccountCompletely(id, "consent_withdrawn");
      report.withdrawnAccounts++;
    } catch (e) {
      report.errors.push(`withdrawn ${id.slice(0, 8)}: ${(e as Error).message}`);
    }
  }

  report.aiRuns = (await db.delete(s.aiRuns).where(lt(s.aiRuns.createdAt, new Date(Date.now() - env.AI_RUN_RETENTION_DAYS * 86400_000))).returning({ id: s.aiRuns.id })).length;
  report.rateLimits = (await db.delete(s.rateLimits).where(lt(s.rateLimits.windowStart, new Date(Date.now() - 2 * 86400_000))).returning({ k: s.rateLimits.key })).length;

  // Answer photos that were uploaded but never read (abandoned before recognition).
  const orphans = await db
    .select()
    .from(s.uploads)
    .where(
      and(
        eq(s.uploads.purpose, "answer_image"),
        isNull(s.uploads.deletedAt),
        lt(s.uploads.createdAt, new Date(Date.now() - 86400_000)),
        notExists(db.select({ x: sql`1` }).from(s.transcripts).where(eq(s.transcripts.uploadId, s.uploads.id))),
      ),
    )
    .limit(500);
  if (orphans.length) {
    const { error } = await supabaseAdmin().storage.from(orphans[0].bucket).remove(orphans.map((o) => o.storagePath));
    if (error) report.errors.push(`orphan uploads: ${error.message}`);
    else {
      for (const o of orphans) await db.delete(s.uploads).where(eq(s.uploads.id, o.id));
      report.orphanUploads = orphans.length;
    }
  }
  return report;
}
