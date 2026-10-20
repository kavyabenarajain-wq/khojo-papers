"use client";

import { useState, useTransition } from "react";
import { requestReviewAction } from "@/app/examiner/actions";
import { Button } from "@/components/ui/Button";
import { Label, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";

export function RequestReview({ evaluationId, existing }: { evaluationId: string; existing: "open" | "resolved" | null }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<boolean>(Boolean(existing));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) {
    return (
      <Notice tone="info" title={existing === "resolved" ? "A teacher has reviewed this answer" : "Teacher review requested"}>
        {existing === "resolved" ? "See the teacher's mark below." : "A teacher will check the AI's marking. Their mark will appear here, labelled as teacher-marked."}
      </Notice>
    );
  }
  return open ? (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <Label htmlFor="review-reason">What do you think the AI got wrong? (optional)</Label>
      <Textarea id="review-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => { const r = await requestReviewAction(evaluationId, reason); if (r.ok) setDone(true); else setError(r.error); })}>
          {pending && <Spinner label="Sending" />}Ask a teacher to check
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      <p className="text-xs text-ink-3">A teacher reviewer will see your answer and photo for this question only.</p>
    </div>
  ) : (
    <Button variant="secondary" onClick={() => setOpen(true)}>Ask a teacher to check this mark</Button>
  );
}
