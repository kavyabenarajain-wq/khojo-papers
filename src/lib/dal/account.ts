import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import * as s from "../db/schema";
import type { Db, Executor } from "../db/types";
import { newToken, sha256 } from "../auth/crypto";
import { audit } from "../audit";
import { CONSENT_POLICY_VERSION } from "../policies";

export class AccountError extends Error {}

export const CONSENT_TOKEN_TTL_DAYS = 7;
export const CONSENT_RESEND_LIMIT_PER_DAY = 3;

const normEmail = (e: string) => e.trim().toLowerCase();

export type NewProfile = {
  displayName: string | null;
  ageBracket: "under_18" | "adult";
  guardianEmail: string | null;
};

/** Create the KHOJO profile for a Supabase user. Under-18s start with consent pending. */
export async function createProfile(db: Executor, userId: string, email: string | null, p: NewProfile) {
  if (p.ageBracket === "under_18") {
    if (!p.guardianEmail) throw new AccountError("A parent or guardian's email address is needed for students under 18.");
    if (email && normEmail(p.guardianEmail) === normEmail(email)) {
      throw new AccountError("The parent or guardian's email must be different from your own.");
    }
  }
  await db
    .insert(s.profiles)
    .values({
      id: userId,
      displayName: p.displayName?.trim().slice(0, 40) || null,
      ageBracket: p.ageBracket,
      guardianEmail: p.ageBracket === "under_18" ? normEmail(p.guardianEmail!) : null,
      consentStatus: p.ageBracket === "under_18" ? "pending" : "not_required",
    })
    .onConflictDoNothing();
}

/**
 * Issue a consent request for a pending student. Sent only after the student has a verified
 * session (so unverified sign-ups can't be used to email strangers) and rate-limited per day.
 */
export async function issueConsentRequest(db: Db, userId: string): Promise<{ token: string; guardianEmail: string }> {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(s.profiles).where(eq(s.profiles.id, userId));
    if (!p || p.consentStatus !== "pending" || !p.guardianEmail) throw new AccountError("No consent request is needed for this account.");
    const [{ count }] = (await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(s.consentTokens)
      .where(and(eq(s.consentTokens.userId, userId), eq(s.consentTokens.purpose, "grant"), gt(s.consentTokens.createdAt, new Date(Date.now() - 86400_000))))) as { count: number }[];
    if (count >= CONSENT_RESEND_LIMIT_PER_DAY) throw new AccountError("We've already sent several requests today. Please try again tomorrow.");
    const { token, hash } = newToken();
    await tx.insert(s.consentTokens).values({
      userId,
      guardianEmail: p.guardianEmail,
      purpose: "grant",
      tokenHash: hash,
      policyVersion: CONSENT_POLICY_VERSION,
      expiresAt: new Date(Date.now() + CONSENT_TOKEN_TTL_DAYS * 86400_000),
    });
    await tx.update(s.profiles).set({ consentRequestedAt: new Date(), updatedAt: new Date() }).where(eq(s.profiles.id, userId));
    return { token, guardianEmail: p.guardianEmail };
  });
}

export type ConsentTokenInfo = {
  valid: boolean;
  purpose: "grant" | "withdraw" | null;
  studentName: string | null;
  reason?: "expired" | "used" | "unknown";
  userId?: string;
};

export async function inspectConsentToken(db: Executor, token: string): Promise<ConsentTokenInfo> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { valid: false, purpose: null, studentName: null, reason: "unknown" };
  const [row] = await db
    .select({ t: s.consentTokens, name: s.profiles.displayName, status: s.profiles.consentStatus })
    .from(s.consentTokens)
    .innerJoin(s.profiles, eq(s.profiles.id, s.consentTokens.userId))
    .where(eq(s.consentTokens.tokenHash, sha256(token)));
  if (!row) return { valid: false, purpose: null, studentName: null, reason: "unknown" };
  if (row.t.usedAt && row.t.purpose === "grant") return { valid: false, purpose: row.t.purpose, studentName: row.name, reason: "used" };
  if (row.t.expiresAt < new Date()) return { valid: false, purpose: row.t.purpose, studentName: row.name, reason: "expired" };
  return { valid: true, purpose: row.t.purpose, studentName: row.name, userId: row.t.userId };
}

/** Guardian grants consent. Returns a long-lived withdrawal token to email them. */
export async function grantConsent(db: Db, token: string, ipHash: string): Promise<{ withdrawToken: string; guardianEmail: string; userId: string }> {
  return db.transaction(async (tx) => {
    const [t] = await tx
      .select()
      .from(s.consentTokens)
      .where(and(eq(s.consentTokens.tokenHash, sha256(token)), eq(s.consentTokens.purpose, "grant"), isNull(s.consentTokens.usedAt), gt(s.consentTokens.expiresAt, new Date())))
      .for("update");
    if (!t) throw new AccountError("This consent link is no longer valid. Ask the student to send a new one.");
    const [p] = await tx.select().from(s.profiles).where(eq(s.profiles.id, t.userId));
    if (!p || p.consentStatus !== "pending" || p.guardianEmail !== t.guardianEmail) throw new AccountError("This consent link is no longer valid.");
    const now = new Date();
    await tx.update(s.consentTokens).set({ usedAt: now }).where(eq(s.consentTokens.id, t.id));
    await tx.update(s.profiles).set({ consentStatus: "granted", consentGrantedAt: now, updatedAt: now }).where(eq(s.profiles.id, t.userId));
    await tx.insert(s.consentRecords).values({ userId: t.userId, guardianEmail: t.guardianEmail, action: "granted", policyVersion: t.policyVersion, method: "email_link", ipHash });
    const w = newToken();
    await tx.insert(s.consentTokens).values({
      userId: t.userId,
      guardianEmail: t.guardianEmail,
      purpose: "withdraw",
      tokenHash: w.hash,
      policyVersion: t.policyVersion,
      expiresAt: new Date(now.getTime() + 5 * 365 * 86400_000),
    });
    await audit(tx, { actorId: null, action: "consent.granted", entityType: "profile", entityId: t.userId });
    return { withdrawToken: w.token, guardianEmail: t.guardianEmail, userId: t.userId };
  });
}

/** Guardian declines or withdraws: the account is marked withdrawn; caller then deletes it. */
export async function refuseConsent(db: Db, token: string, ipHash: string): Promise<{ userId: string }> {
  return db.transaction(async (tx) => {
    const [t] = await tx
      .select()
      .from(s.consentTokens)
      .where(and(eq(s.consentTokens.tokenHash, sha256(token)), gt(s.consentTokens.expiresAt, new Date())))
      .for("update");
    if (!t || (t.purpose === "grant" && t.usedAt)) throw new AccountError("This link is no longer valid.");
    await tx.update(s.consentTokens).set({ usedAt: new Date() }).where(eq(s.consentTokens.id, t.id));
    await tx.update(s.profiles).set({ consentStatus: "withdrawn", updatedAt: new Date() }).where(eq(s.profiles.id, t.userId));
    await tx.insert(s.consentRecords).values({ userId: t.userId, guardianEmail: t.guardianEmail, action: "withdrawn", policyVersion: t.policyVersion, method: "email_link", ipHash });
    return { userId: t.userId };
  });
}

/** Storage paths of everything a user uploaded, so the caller can delete the files. */
export async function uploadPaths(db: Executor, userId: string): Promise<{ bucket: string; path: string }[]> {
  const list = await db.select({ bucket: s.uploads.bucket, path: s.uploads.storagePath }).from(s.uploads).where(eq(s.uploads.userId, userId));
  return list;
}

/** Accounts still waiting for guardian consent after the allowed period. */
export async function expiredPendingAccounts(db: Executor, ttlDays: number): Promise<string[]> {
  const list = await db
    .select({ id: s.profiles.id })
    .from(s.profiles)
    .where(and(eq(s.profiles.consentStatus, "pending"), lt(s.profiles.createdAt, new Date(Date.now() - ttlDays * 86400_000))));
  return list.map((r) => r.id);
}

export async function recordDeletion(db: Executor, reason: "user_request" | "consent_withdrawn" | "consent_expired", ok: boolean, detail?: string) {
  await db.insert(s.deletionRequests).values({ reason, status: ok ? "completed" : "failed", detail: detail ?? null, completedAt: ok ? new Date() : null });
}

/** Everything we hold about a user, for the "download my data" feature. Runs under RLS. */
export async function exportUserData(db: Executor, userId: string) {
  const [profile] = await db.select().from(s.profiles).where(eq(s.profiles.id, userId));
  const attempts = await db.select().from(s.attempts).where(eq(s.attempts.userId, userId));
  const responses = await db.select().from(s.responses).where(eq(s.responses.userId, userId));
  const evaluations = await db.select().from(s.evaluations).where(eq(s.evaluations.userId, userId));
  const scores = evaluations.length
    ? await db.select().from(s.criterionScores).where(sql`${s.criterionScores.evaluationId} in ${evaluations.map((e) => e.id)}`)
    : [];
  const transcripts = await db.select().from(s.transcripts).where(eq(s.transcripts.userId, userId));
  const uploads = await db
    .select({ id: s.uploads.id, purpose: s.uploads.purpose, createdAt: s.uploads.createdAt, sizeBytes: s.uploads.sizeBytes })
    .from(s.uploads)
    .where(eq(s.uploads.userId, userId));
  const bookmarks = await db.select().from(s.bookmarks).where(eq(s.bookmarks.userId, userId));
  const reveals = await db.select().from(s.solutionReveals).where(eq(s.solutionReveals.userId, userId));
  const consent = await db.select().from(s.consentRecords).where(eq(s.consentRecords.userId, userId));
  const reviewRequests = await db.select().from(s.humanReviewRequests).where(eq(s.humanReviewRequests.userId, userId));
  return {
    exportedAt: new Date().toISOString(),
    note: "Photos you uploaded are not included in this file; they can be viewed from your attempt history.",
    profile,
    attempts,
    responses,
    evaluations,
    criterionScores: scores,
    transcripts,
    uploads,
    bookmarks,
    solutionReveals: reveals,
    consentRecords: consent,
    humanReviewRequests: reviewRequests,
  };
}
