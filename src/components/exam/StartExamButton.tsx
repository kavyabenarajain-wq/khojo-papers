"use client";

import { useState, useTransition } from "react";
import { Play } from "lucide-react";
import { startExamAction } from "@/app/papers/[slug]/actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";

export function StartExamButton({ paperId, slug, resume, minutes }: { paperId: string; slug: string; resume: boolean; minutes: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = await startExamAction(paperId, slug);
      if (r && !r.ok) setError(r.error);
    });
  return (
    <>
      <Button size="lg" onClick={() => (resume ? go() : setOpen(true))} disabled={pending}>
        {pending ? <Spinner label="Starting" /> : <Play className="size-4" aria-hidden />}
        {resume ? "Resume timed attempt" : "Start in exam mode"}
      </Button>
      {error && !open && <Notice tone="danger" className="w-full">{error}</Notice>}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Start the timed paper?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Not yet</Button>
            <Button onClick={go} disabled={pending}>
              {pending && <Spinner label="Starting" />}
              Start now
            </Button>
          </div>
        }
      >
        <ul className="list-disc space-y-2 pl-5 text-ink-2">
          <li>You have {minutes} minutes. The timer keeps running if you close the page.</li>
          <li>Answers save automatically as you type. You can come back to any question.</li>
          <li>When time is up, your saved answers are submitted.</li>
          <li>Multiple-choice and numerical answers are marked straight away; written answers can then be marked against the rubric.</li>
        </ul>
        {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
      </Dialog>
    </>
  );
}
