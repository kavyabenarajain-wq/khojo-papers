"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { teacherMarkAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Label, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";

export function TeacherMarkForm({ requestId, criteria }: { requestId: string; criteria: { key: string; description: string; marks: number; aiMarks: number | null }[] }) {
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const complete = criteria.every((c) => marks[c.key] !== undefined);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">Mark independently from the rubric. The AI&apos;s marks are shown for comparison only.</p>
      {criteria.map((c) => (
        <fieldset key={c.key} className="rounded-md border border-line p-3">
          <legend className="px-1 text-sm font-medium">{c.description} [{c.marks}]</legend>
          <p className="text-xs text-ink-3">AI: {c.aiMarks ?? "—"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: c.marks * 2 + 1 }, (_, i) => i / 2).map((v) => (
              <label key={v} className={`inline-flex min-h-10 min-w-11 cursor-pointer items-center justify-center rounded-md border px-2 text-sm ${marks[c.key] === v ? "border-accent bg-accent-soft" : "border-line-strong"}`}>
                <input type="radio" className="sr-only" name={`${requestId}-${c.key}`} checked={marks[c.key] === v} onChange={() => setMarks((m) => ({ ...m, [c.key]: v }))} />
                {v}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <Label htmlFor={`fb-${requestId}`}>Feedback for the student</Label>
      <Textarea id={`fb-${requestId}`} rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <Button
        disabled={!complete || pending}
        onClick={() =>
          start(async () => {
            const r = await teacherMarkAction(requestId, marks, feedback);
            setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Saved" : r.error });
            if (r.ok) router.refresh();
          })
        }
      >
        Save teacher mark
      </Button>
      {msg && <Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice>}
    </div>
  );
}
