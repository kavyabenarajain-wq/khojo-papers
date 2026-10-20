"use client";

import { useState, useTransition } from "react";
import { decideConsentAction, type ConsentResult } from "./actions";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";

export function ConsentDecision({ token, purpose }: { token: string; purpose: "grant" | "withdraw" }) {
  const [result, setResult] = useState<ConsentResult | null>(null);
  const [confirmRefuse, setConfirmRefuse] = useState(false);
  const [pending, start] = useTransition();
  const decide = (d: "grant" | "refuse") => start(async () => setResult(await decideConsentAction(token, d)));

  if (result?.ok) {
    return result.outcome === "granted" ? (
      <Notice tone="success" title="Thank you, consent recorded">
        The student can now save answers and use the AI Examiner. We&apos;ve emailed you a link you can use to withdraw consent at any time.
      </Notice>
    ) : (
      <Notice tone="info" title="Done">The account and everything saved in it have been deleted.</Notice>
    );
  }
  return (
    <div className="space-y-3">
      {result && !result.ok && <Notice tone="danger">{result.error}</Notice>}
      {purpose === "grant" && !confirmRefuse && (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={() => decide("grant")} disabled={pending}>
            {pending && <Spinner label="Saving" />}I give consent
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setConfirmRefuse(true)} disabled={pending}>
            I do not consent
          </Button>
        </div>
      )}
      {(purpose === "withdraw" || confirmRefuse) && (
        <div className="space-y-3">
          <p className="text-ink-2">
            {purpose === "withdraw" ? "Withdrawing consent" : "Refusing consent"} permanently deletes the student&apos;s account, answers, photos and marks. This cannot be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="danger" onClick={() => decide("refuse")} disabled={pending}>
              {pending && <Spinner label="Deleting" />}
              {purpose === "withdraw" ? "Withdraw consent and delete the account" : "Refuse and delete the account"}
            </Button>
            {confirmRefuse && (
              <Button size="lg" variant="ghost" onClick={() => setConfirmRefuse(false)}>
                Go back
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
