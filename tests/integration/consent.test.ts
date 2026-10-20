import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb, type TestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { AccountError, createProfile, expiredPendingAccounts, exportUserData, grantConsent, inspectConsentToken, issueConsentRequest, refuseConsent } from "@/lib/dal/account";
import { runAs } from "@/lib/db/rls";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());

async function authUser(email: string) {
  const id = randomUUID();
  await t.pg.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return id;
}

describe("guardian consent", () => {
  it("requires a different guardian email for under-18s", async () => {
    const id = await authUser("kid@example.test");
    await expect(createProfile(t.db, id, "kid@example.test", { displayName: "Asha", ageBracket: "under_18", guardianEmail: "KID@example.test" })).rejects.toThrow(AccountError);
    await expect(createProfile(t.db, id, "kid@example.test", { displayName: "Asha", ageBracket: "under_18", guardianEmail: null })).rejects.toThrow(AccountError);
  });

  it("adults need no consent; minors start pending", async () => {
    const adult = await authUser("adult@example.test");
    await createProfile(t.db, adult, "adult@example.test", { displayName: null, ageBracket: "adult", guardianEmail: "ignored@example.test" });
    const [a] = await t.db.select().from(s.profiles).where(eq(s.profiles.id, adult));
    expect(a).toMatchObject({ consentStatus: "not_required", guardianEmail: null });
  });

  it("grants consent once via a hashed, single-use token and issues a withdrawal link", async () => {
    const id = await authUser("minor1@example.test");
    await createProfile(t.db, id, "minor1@example.test", { displayName: "Ravi", ageBracket: "under_18", guardianEmail: "Parent@Example.test" });
    const { token, guardianEmail } = await issueConsentRequest(t.db, id);
    expect(guardianEmail).toBe("parent@example.test");
    const stored = await t.db.select().from(s.consentTokens).where(eq(s.consentTokens.userId, id));
    expect(stored[0].tokenHash).not.toContain(token);
    expect(await inspectConsentToken(t.db, token)).toMatchObject({ valid: true, purpose: "grant", studentName: "Ravi" });

    const r = await grantConsent(t.db, token, "iphash");
    const [p] = await t.db.select().from(s.profiles).where(eq(s.profiles.id, id));
    expect(p.consentStatus).toBe("granted");
    await expect(grantConsent(t.db, token, "iphash")).rejects.toThrow(/no longer valid/);
    expect(await inspectConsentToken(t.db, token)).toMatchObject({ valid: false, reason: "used" });
    expect(await inspectConsentToken(t.db, r.withdrawToken)).toMatchObject({ valid: true, purpose: "withdraw" });

    const records = await runAs(t.db, id, (tx) => tx.select().from(s.consentRecords));
    expect(records.map((x) => x.action)).toEqual(["granted"]);

    await refuseConsent(t.db, r.withdrawToken, "iphash");
    const [after] = await t.db.select().from(s.profiles).where(eq(s.profiles.id, id));
    expect(after.consentStatus).toBe("withdrawn");
  });

  it("limits how many requests can be sent per day", async () => {
    const id = await authUser("minor2@example.test");
    await createProfile(t.db, id, "minor2@example.test", { displayName: null, ageBracket: "under_18", guardianEmail: "g2@example.test" });
    for (let i = 0; i < 3; i++) await issueConsentRequest(t.db, id);
    await expect(issueConsentRequest(t.db, id)).rejects.toThrow(/several requests/);
  });

  it("rejects expired tokens and finds accounts pending too long", async () => {
    const id = await authUser("minor3@example.test");
    await createProfile(t.db, id, "minor3@example.test", { displayName: null, ageBracket: "under_18", guardianEmail: "g3@example.test" });
    const { token } = await issueConsentRequest(t.db, id);
    await t.db.execute(sql`update app.consent_tokens set expires_at = now() - interval '1 minute' where user_id = ${id}`);
    await expect(grantConsent(t.db, token, "x")).rejects.toThrow(/no longer valid/);
    await t.db.execute(sql`update app.profiles set created_at = now() - interval '8 days' where id = ${id}`);
    expect(await expiredPendingAccounts(t.db, 7)).toContain(id);
  });

  it("exports only the requesting user's data", async () => {
    const id = await authUser("exp@example.test");
    await createProfile(t.db, id, "exp@example.test", { displayName: "E", ageBracket: "adult", guardianEmail: null });
    const data = await runAs(t.db, id, (tx) => exportUserData(tx, id));
    expect(data.profile.id).toBe(id);
    expect(data.consentRecords).toEqual([]);
  });

  it("deleting the auth user cascades to all student data", async () => {
    const id = await authUser("gone@example.test");
    await createProfile(t.db, id, "gone@example.test", { displayName: null, ageBracket: "adult", guardianEmail: null });
    await t.db.insert(s.attempts).values({ userId: id, mode: "practice" });
    await t.pg.query("delete from auth.users where id = $1", [id]);
    expect(await t.db.select().from(s.profiles).where(eq(s.profiles.id, id))).toEqual([]);
    expect(await t.db.select().from(s.attempts).where(eq(s.attempts.userId, id))).toEqual([]);
  });
});
