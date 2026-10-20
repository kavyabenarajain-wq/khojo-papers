"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Flag } from "lucide-react";
import { reportIssueAction, toggleBookmarkAction } from "@/app/questions/[id]/actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";

export function BookmarkButton({ questionId, initial, signedIn }: { questionId: string; initial: boolean; signedIn: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={on}
      disabled={pending}
      onClick={() => {
        if (!signedIn) {
          router.push(`/login?next=/questions/${questionId}`);
          return;
        }
        start(async () => {
          const r = await toggleBookmarkAction(questionId);
          if (r.ok) setOn(r.bookmarked);
        });
      }}
    >
      <Bookmark className={`size-4 ${on ? "fill-current text-accent-text" : ""}`} aria-hidden />
      {on ? "Bookmarked" : "Bookmark"}
    </Button>
  );
}

export function ReportIssueButton({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("question_error");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => { setOpen(true); setState({}); }}>
        <Flag className="size-4" aria-hidden /> Report an issue
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Report an issue"
        labelledBy="report-title"
        footer={
          state.ok ? (
            <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Close</Button></div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await reportIssueAction(questionId, { category, message });
                    setState(r.ok ? { ok: true } : { error: r.error });
                  })
                }
              >
                {pending && <Spinner label="Sending" />}
                Send report
              </Button>
            </div>
          )
        }
      >
        {state.ok ? (
          <Notice tone="success" title="Thank you">A reviewer will check this question. Reports help us correct mistakes quickly.</Notice>
        ) : (
          <div className="space-y-4">
            <Field label="What is wrong?" htmlFor="report-category">
              <Select id="report-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="question_error">Mistake in the question</option>
                <option value="solution_error">Mistake in the solution or answer</option>
                <option value="marking">Marking or rubric seems wrong</option>
                <option value="rendering">Maths or diagram doesn&apos;t display properly</option>
                <option value="copyright">Copyright or source concern</option>
                <option value="other">Something else</option>
              </Select>
            </Field>
            <Field label="Details" htmlFor="report-message" error={state.error} help="Please don't include personal information.">
              <Textarea id="report-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={4} />
            </Field>
          </div>
        )}
      </Dialog>
    </>
  );
}
