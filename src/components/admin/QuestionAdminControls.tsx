"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  decideAction,
  previewRichTextAction,
  publishAction,
  saveQuestionAction,
  saveRubricAction,
  saveSolutionAction,
  setPermissionAction,
  setTopicsAction,
  submitForReviewAction,
  unpublishAction,
  type ActionResult,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { RichHtml } from "@/components/ui/RichHtml";

function useAction() {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) router.refresh();
    });
  return { result, pending, run, setResult };
}

function Result({ r }: { r: ActionResult | null }) {
  if (!r) return null;
  return r.ok ? <Notice tone="success">{r.message ?? "Done."}</Notice> : <Notice tone="danger">{r.error}</Notice>;
}

export function ReviewDecision({ kind, id, label }: { kind: "question" | "solution" | "rubric"; id: string; label: string }) {
  const { result, pending, run } = useAction();
  const [comments, setComments] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="space-y-3 rounded-md border border-warning/30 bg-warning-soft/40 p-3">
      <p className="text-sm font-semibold">Review this {label}</p>
      <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} label={`I have checked this ${label} myself${kind === "solution" ? ", including every step and the final answer" : kind === "rubric" ? ", and the marks are fair and add up" : ", including the maths, the marks and the source label"}.`} />
      <Label htmlFor={`c-${id}`}>Comments (required if returning or rejecting)</Label>
      <Textarea id={`c-${id}`} rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || !confirmed} onClick={() => run(() => decideAction(kind, id, "approved", comments))}>
          {pending && <Spinner label="Saving" />}Approve
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => decideAction(kind, id, "changes_requested", comments))}>
          Request changes
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideAction(kind, id, "rejected", comments))}>
          Reject
        </Button>
      </div>
      <Result r={result} />
    </div>
  );
}

export function SubmitForReview({ kind, id }: { kind: "question" | "solution" | "rubric"; id: string }) {
  const { result, pending, run } = useAction();
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => submitForReviewAction(kind, id))}>
        {pending && <Spinner label="Submitting" />}Submit for review
      </Button>
      <Result r={result} />
    </div>
  );
}

export function PublishControls({ questionId, published }: { questionId: string; published: boolean }) {
  const { result, pending, run } = useAction();
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      {published ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Label htmlFor="unpub">Reason for unpublishing</Label>
            <Input id="unpub" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. error in step 3" />
          </div>
          <Button variant="danger" disabled={pending || reason.trim().length < 3} onClick={() => run(() => unpublishAction(questionId, reason))}>
            Unpublish
          </Button>
        </div>
      ) : (
        <Button disabled={pending} onClick={() => run(() => publishAction(questionId))}>
          {pending && <Spinner label="Publishing" />}Publish approved revision
        </Button>
      )}
      <Result r={result} />
    </div>
  );
}

export function PermissionForm({ questionId, current }: { questionId: string; current: string }) {
  const { result, pending, run } = useAction();
  const [status, setStatus] = useState(current);
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto] sm:items-end">
        <Field label="Publication rights" htmlFor="perm">
          <Select id="perm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="own_content">Our own content</option>
            <option value="licensed">Licensed</option>
            <option value="reference_only">Reference only (cannot host)</option>
            <option value="unknown">Unknown</option>
            <option value="restricted">Restricted / concern raised</option>
          </Select>
        </Field>
        <Field label="Note" htmlFor="perm-note">
          <Input id="perm-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Evidence or reason" />
        </Field>
        <Button variant="secondary" disabled={pending || status === current} onClick={() => run(() => setPermissionAction(questionId, status, note))}>
          Save
        </Button>
      </div>
      <p className="text-xs text-ink-3">Anything other than “own content” or “licensed” takes a published question down immediately.</p>
      <Result r={result} />
    </div>
  );
}

export function TopicsForm({
  questionId,
  chapters,
  chapterId,
  topicIds,
}: {
  questionId: string;
  chapters: { id: string; name: string; topics: { id: string; name: string; verified: boolean }[] }[];
  chapterId: string | null;
  topicIds: string[];
}) {
  const { result, pending, run } = useAction();
  const [ch, setCh] = useState(chapterId ?? chapters[0]?.id);
  const [sel, setSel] = useState<string[]>(topicIds);
  const chapter = chapters.find((c) => c.id === ch);
  return (
    <div className="space-y-2">
      <Field label="Chapter" htmlFor="chapter">
        <Select id="chapter" value={ch} onChange={(e) => { setCh(e.target.value); setSel([]); }}>
          {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Topics</legend>
        {chapter?.topics.map((t) => (
          <Checkbox
            key={t.id}
            checked={sel.includes(t.id)}
            onChange={(e) => setSel((s) => (e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id)))}
            label={<>{t.name}{!t.verified && <span className="ml-1 text-xs text-warning">(topic unverified)</span>}</>}
          />
        ))}
      </fieldset>
      <Button size="sm" variant="secondary" disabled={pending || !sel.length} onClick={() => run(() => setTopicsAction(questionId, ch!, sel))}>
        Save mapping
      </Button>
      <Result r={result} />
    </div>
  );
}

/** JSON editor with validation on save and a maths preview helper. */
export function JsonEditor({
  questionId,
  kind,
  initial,
  help,
}: {
  questionId: string;
  kind: "question" | "solution" | "rubric";
  initial: Record<string, unknown>;
  help: string;
}) {
  const { result, pending, run, setResult } = useAction();
  const [text, setText] = useState(JSON.stringify(initial, null, 2));
  const [open, setOpen] = useState(false);
  const save = () => {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      setResult({ ok: false, error: `Not valid JSON: ${(e as Error).message}` });
      return;
    }
    run(() => (kind === "question" ? saveQuestionAction(questionId, payload) : kind === "solution" ? saveSolutionAction(questionId, payload) : saveRubricAction(questionId, payload)));
  };
  if (!open) return <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Edit {kind}</Button>;
  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <p className="text-sm text-ink-2">{help}</p>
      <Label htmlFor={`json-${kind}`}>{kind} JSON</Label>
      <Textarea id={`json-${kind}`} rows={18} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" spellCheck={false} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={save}>{pending && <Spinner label="Saving" />}Save as draft</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </div>
      <Result r={result} />
      <MathPreview />
    </div>
  );
}

export function MathPreview() {
  const [src, setSrc] = useState("");
  const [out, setOut] = useState<{ html: string; issues: string[] } | null>(null);
  const [pending, start] = useTransition();
  return (
    <details className="rounded-md bg-surface-2 p-3">
      <summary className="cursor-pointer text-sm font-medium">Maths preview</summary>
      <p className="mt-2 text-xs text-ink-3">Inline maths: \( x^2 \). Display maths: \[ \frac{"{a}"}{"{b}"} \]. Rupees: ₹. Never use $.</p>
      <Textarea rows={3} value={src} onChange={(e) => setSrc(e.target.value)} className="mt-2 font-mono text-sm" aria-label="Rich text to preview" />
      <Button size="sm" variant="secondary" className="mt-2" disabled={pending} onClick={() => start(async () => setOut(await previewRichTextAction(src)))}>Render</Button>
      {out && (
        <div className="mt-2 space-y-1">
          {out.issues.map((i) => <p key={i} className="text-sm text-danger">{i}</p>)}
          <RichHtml html={out.html} variant="question" className="rounded bg-surface p-2" />
        </div>
      )}
    </details>
  );
}
