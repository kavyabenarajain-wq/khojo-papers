"use client";

import { useState, useTransition } from "react";
import { createQuestionAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { MathPreview } from "./QuestionAdminControls";

export function NewQuestionForm({ chapters, sources }: { chapters: { id: string; name: string }[]; sources: { id: string; title: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sourceType, setSourceType] = useState("original_practice");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const str = (k: string) => (String(f.get(k) ?? "").trim() || null);
        const meta = {
          code: String(f.get("code") ?? "").trim().toUpperCase(),
          chapterId: f.get("chapterId"),
          sourceType,
          sourceDocumentId: str("sourceDocumentId"),
          sourcePage: str("sourcePage"),
          sourceQuestionNumber: str("sourceQuestionNumber"),
          examYear: str("examYear") ? Number(f.get("examYear")) : null,
          permissionStatus: f.get("permissionStatus"),
        };
        const marks = Number(f.get("marks"));
        const draft = {
          answerFormat: f.get("answerFormat"),
          marks,
          difficulty: str("difficulty"),
          content: { stem: String(f.get("stem") ?? "") },
          answerKey: null,
          hints: [],
          changeNote: "Created",
        };
        start(async () => {
          const r = await createQuestionAction(meta, draft);
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" htmlFor="code" help="e.g. M10-QE-101"><Input id="code" name="code" required /></Field>
        <Field label="Chapter" htmlFor="chapterId"><Select id="chapterId" name="chapterId">{chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Source type" htmlFor="sourceType">
          <Select id="sourceType" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            <option value="original_practice">Original practice (ours)</option>
            <option value="official_pyq">Official previous-year question</option>
            <option value="official_specimen">Official specimen question</option>
          </Select>
        </Field>
        <Field label="Publication rights" htmlFor="permissionStatus">
          <Select id="permissionStatus" name="permissionStatus" defaultValue={sourceType === "original_practice" ? "own_content" : "unknown"} key={sourceType}>
            <option value="own_content">Our own content</option>
            <option value="licensed">Licensed</option>
            <option value="reference_only">Reference only</option>
            <option value="unknown">Unknown</option>
          </Select>
        </Field>
        {sourceType !== "original_practice" && (
          <>
            <Field label="Source document" htmlFor="sourceDocumentId" help="Required for official questions.">
              <Select id="sourceDocumentId" name="sourceDocumentId"><option value="">Choose…</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</Select>
            </Field>
            <Field label="Examination year" htmlFor="examYear"><Input id="examYear" name="examYear" inputMode="numeric" /></Field>
            <Field label="Source page" htmlFor="sourcePage"><Input id="sourcePage" name="sourcePage" /></Field>
            <Field label="Question number in source" htmlFor="sourceQuestionNumber"><Input id="sourceQuestionNumber" name="sourceQuestionNumber" /></Field>
          </>
        )}
        <Field label="Answer format" htmlFor="answerFormat">
          <Select id="answerFormat" name="answerFormat" defaultValue="math_working">
            {["mcq", "numerical", "math_working", "short_answer", "long_answer", "structured"].map((f) => <option key={f} value={f}>{f.replace("_", " ")}</option>)}
          </Select>
        </Field>
        <Field label="Marks" htmlFor="marks"><Input id="marks" name="marks" type="number" min={1} max={20} defaultValue={3} /></Field>
        <Field label="Difficulty (author estimate)" htmlFor="difficulty">
          <Select id="difficulty" name="difficulty"><option value="">Not set</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></Select>
        </Field>
      </div>
      <Field label="Question text" htmlFor="stem" help="Maths in \( … \) and \[ … \]. Options, parts, diagrams and the answer key can be added after creating, in the question editor.">
        <Textarea id="stem" name="stem" rows={6} required />
      </Field>
      <MathPreview />
      <Button type="submit" disabled={pending}>{pending && <Spinner label="Creating" />}Create draft</Button>
    </form>
  );
}
