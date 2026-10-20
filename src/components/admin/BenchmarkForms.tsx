"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBenchmarkAction, runBenchmarkAction, type ActionResult } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";

type Q = { id: string; code: string; criteria: { key: string; description: string; marks: number }[] };
const CATEGORIES = ["correct", "partially_correct", "incorrect", "alternative_method", "equivalent_wording", "misconception", "illegible", "ambiguous_notation", "crossed_out", "diagram", "incomplete_rubric"];

export function AddBenchmarkForm({ questions }: { questions: Q[] }) {
  const [qid, setQid] = useState(questions[0]?.id ?? "");
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const q = questions.find((x) => x.id === qid);
  if (!questions.length) return <Notice>Publish a question with an approved rubric first.</Notice>;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await addBenchmarkAction({
            questionId: qid,
            category: f.get("category"),
            answerText: f.get("answerText"),
            teacherCriteria: marks,
            expectNeedsReview: f.get("expect") === "on",
            markerName: f.get("markerName"),
            notes: String(f.get("notes") ?? "") || null,
          });
          setMsg(r);
          if (r.ok) {
            (e.target as HTMLFormElement).reset();
            setMarks({});
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Question" htmlFor="bq">
          <Select id="bq" value={qid} onChange={(e) => { setQid(e.target.value); setMarks({}); }}>{questions.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</Select>
        </Field>
        <Field label="Category" htmlFor="bc"><Select id="bc" name="category">{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</Select></Field>
      </div>
      <Field label="Student answer (as written)" htmlFor="ba" help="Use real anonymised student work where you have permission, or carefully constructed examples. Remove names."><Textarea id="ba" name="answerText" rows={6} required /></Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Teacher marks per criterion (marked independently)</legend>
        {q?.criteria.map((c) => (
          <div key={c.key} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">{c.description} [{c.marks}]</span>
            <Input type="number" step={0.5} min={0} max={c.marks} aria-label={`Marks for ${c.description}`} className="min-h-9 w-24" value={marks[c.key] ?? ""} onChange={(e) => setMarks((m) => ({ ...m, [c.key]: Number(e.target.value) }))} />
          </div>
        ))}
      </fieldset>
      <Checkbox name="expect" label="A careful examiner should flag this for human review (e.g. illegible, rubric doesn't fit)" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Marked by" htmlFor="bm" help="Name of the qualified teacher who marked it."><Input id="bm" name="markerName" required /></Field>
        <Field label="Notes" htmlFor="bn"><Input id="bn" name="notes" /></Field>
      </div>
      <Button type="submit" disabled={pending}>{pending && <Spinner label="Saving" />}Add benchmark answer</Button>
      {msg && <Notice tone={msg.ok ? "success" : "danger"}>{msg.ok ? msg.message : msg.error}</Notice>}
    </form>
  );
}

export function RunBenchmarkButton({ disabled }: { disabled: boolean }) {
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      <Button disabled={disabled || pending} onClick={() => start(async () => { const r = await runBenchmarkAction(); setMsg(r); if (r.ok) router.refresh(); })}>
        {pending && <Spinner label="Running" />}Run benchmark now
      </Button>
      {pending && <p className="text-sm text-ink-3">Marking every benchmark answer with the live AI pipeline. This can take several minutes.</p>}
      {msg && <Notice tone={msg.ok ? "success" : "danger"}>{msg.ok ? msg.message : msg.error}</Notice>}
    </div>
  );
}
