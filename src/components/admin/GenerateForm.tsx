"use client";

import { useState, useTransition } from "react";
import { generateQuestionAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";

type Chapter = { id: string; name: string; topics: { id: string; name: string; objective: string | null }[] };

export function GenerateForm({ chapters }: { chapters: Chapter[] }) {
  const [chapterId, setChapterId] = useState(chapters[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chapter = chapters.find((c) => c.id === chapterId);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await generateQuestionAction({
            code: String(f.get("code")).trim().toUpperCase(),
            chapterId,
            topicId: (f.get("topicId") as string) || null,
            learningObjective: f.get("learningObjective"),
            difficulty: f.get("difficulty"),
            marks: Number(f.get("marks")),
            answerFormat: f.get("answerFormat"),
            referenceNotes: (f.get("referenceNotes") as string) || null,
          });
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New question code" htmlFor="g-code" help="e.g. M10-QE-120"><Input id="g-code" name="code" required /></Field>
        <Field label="Chapter" htmlFor="g-ch"><Select id="g-ch" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>{chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Topic" htmlFor="g-topic"><Select id="g-topic" name="topicId"><option value="">Any topic in the chapter</option>{chapter?.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Answer format" htmlFor="g-format"><Select id="g-format" name="answerFormat" defaultValue="math_working"><option value="math_working">Show working</option><option value="structured">Structured (parts)</option><option value="numerical">Numerical</option><option value="mcq">Multiple choice (1 mark)</option><option value="short_answer">Short answer</option></Select></Field>
        <Field label="Marks" htmlFor="g-marks"><Input id="g-marks" name="marks" type="number" min={1} max={12} defaultValue={3} /></Field>
        <Field label="Difficulty" htmlFor="g-diff"><Select id="g-diff" name="difficulty" defaultValue="medium"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></Select></Field>
      </div>
      <Field label="Learning objective" htmlFor="g-obj" help="What the student should be able to do."><Textarea id="g-obj" name="learningObjective" rows={2} required /></Field>
      <Field label="Reference notes (optional)" htmlFor="g-ref" help="Verified examination conventions or authorised reference questions to align with. The draft must not copy them.">
        <Textarea id="g-ref" name="referenceNotes" rows={3} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" disabled={pending}>{pending ? <><Spinner label="Drafting" /> Drafting and checking (up to a minute)…</> : "Draft question"}</Button>
    </form>
  );
}
