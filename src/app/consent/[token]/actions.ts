"use server";

import { getDb } from "@/lib/db/client";
import { clientIpHash } from "@/lib/auth/request";
import { AccountError, grantConsent, refuseConsent } from "@/lib/dal/account";
import { deleteAccountCompletely } from "@/lib/account-deletion";
import { sendMail } from "@/lib/mail";
import { consentConfirmedEmail } from "@/lib/mail/templates";
import { appUrl } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { profiles } from "@/lib/db/schema";

export type ConsentResult = { ok: true; outcome: "granted" | "refused" } | { ok: false; error: string };

export async function decideConsentAction(token: string, decision: "grant" | "refuse"): Promise<ConsentResult> {
  const db = getDb();
  const ip = await clientIpHash();
  const limit = await rateLimit(db, `consent:${ip}`, 20, 3600);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Please try again later." };
  try {
    if (decision === "grant") {
      const r = await grantConsent(db, token, ip);
      const [p] = await db.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.id, r.userId));
      await sendMail({ to: r.guardianEmail, ...consentConfirmedEmail({ studentName: p?.name ?? null, withdrawLink: `${appUrl()}/consent/${r.withdrawToken}` }) }).catch((e) =>
        console.error("Consent confirmation email failed", e),
      );
      return { ok: true, outcome: "granted" };
    }
    const r = await refuseConsent(db, token, ip);
    await deleteAccountCompletely(r.userId, "consent_withdrawn");
    return { ok: true, outcome: "refused" };
  } catch (e) {
    if (e instanceof AccountError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try the link again." };
  }
}
