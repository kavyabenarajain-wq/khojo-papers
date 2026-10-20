import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth/rbac";
import { SendConsentRequest } from "@/components/auth/forms";
import { Notice } from "@/components/ui/Notice";
import { mailAvailable } from "@/lib/mail";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Parent or guardian consent" };

export default async function ConsentStatusPage() {
  const v = await requireViewer("/account/consent");
  const mail = mailAvailable();
  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Parent or guardian consent</h1>
      {v.consentStatus === "not_required" && <Notice className="mt-4">Your account doesn&apos;t need guardian consent.</Notice>}
      {v.consentStatus === "granted" && <Notice tone="success" className="mt-4" title="Consent given">Your answers and progress are being saved.</Notice>}
      {v.consentStatus === "pending" && (
        <div className="mt-4 space-y-4">
          <p className="text-ink-2">
            Because you&apos;re under 18, your parent or guardian needs to agree before we save your answers, marks or photos. Until then you can still browse,
            practise and see solutions. If consent isn&apos;t given within {env.CONSENT_PENDING_TTL_DAYS} days of signing up, the account is deleted automatically.
          </p>
          {v.consentRequestedAt && (
            <p className="text-sm text-ink-3">Last request sent {v.consentRequestedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</p>
          )}
          {mail === "unavailable" ? (
            <Notice tone="warning" title="Email isn't set up on this server">Consent requests can&apos;t be sent yet. Please contact us.</Notice>
          ) : (
            <SendConsentRequest alreadySent={Boolean(v.consentRequestedAt)} />
          )}
          <p className="text-sm text-ink-3">We&apos;ll email the address you gave when signing up. This is an interim process and is being reviewed.</p>
        </div>
      )}
    </div>
  );
}
