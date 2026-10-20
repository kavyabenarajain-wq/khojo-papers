import type { Metadata } from "next";
import { getDb } from "@/lib/db/client";
import { inspectConsentToken } from "@/lib/dal/account";
import { integrations } from "@/lib/env";
import { AI_PROCESSING, CONSENT_POLICY_VERSION, DATA_WE_COLLECT, WE_DO_NOT, YOUR_CHOICES } from "@/lib/policies";
import { Notice } from "@/components/ui/Notice";
import { ConsentDecision } from "./ConsentDecision";

export const metadata: Metadata = { title: "Parent or guardian consent", referrer: "no-referrer", robots: { index: false } };

export default async function ConsentPage({ params }: PageProps<"/consent/[token]">) {
  const { token } = await params;
  const info = integrations.database ? await inspectConsentToken(getDb(), token) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        {info?.purpose === "withdraw" ? "Withdraw consent" : "Consent for a student account"}
      </h1>
      {!info || !info.valid ? (
        <Notice tone="warning" className="mt-4" title="This link can't be used">
          {info?.reason === "expired"
            ? "It has expired. Ask the student to send a new request from their account."
            : info?.reason === "used"
              ? "A decision has already been recorded with this link."
              : "It isn't a valid consent link."}
        </Notice>
      ) : (
        <div className="mt-4 space-y-6">
          <p className="text-ink-2">
            {info.studentName ? <strong className="text-ink">{info.studentName}</strong> : "A student"} gave your email address as their parent or
            guardian when creating a KHOJO PAPERS account. KHOJO PAPERS is an independent ICSE Class 10 study tool, not affiliated with CISCE.
          </p>
          {info.purpose === "grant" && (
            <>
              <Section title="What we store if you agree" items={DATA_WE_COLLECT} />
              <Section title="AI marking" items={AI_PROCESSING} />
              <Section title="What we don't do" items={WE_DO_NOT} />
              <Section title="Your choices" items={YOUR_CHOICES} />
              <p className="text-sm text-ink-3">Notice version {CONSENT_POLICY_VERSION}. Until you decide, the student can browse and practise, but nothing they do is saved.</p>
            </>
          )}
          <ConsentDecision token={token} purpose={info.purpose!} />
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-2">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  );
}
