"use client";

import { useState, useTransition } from "react";
import type { RubricPayload } from "@/lib/content/payloads";
import { selfAssessAction } from "@/app/questions/[id]/actions";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { RichHtml } from "@/components/ui/RichHtml";

/** Students mark their own answer against each rubric criterion. Saved as "self-assessed". */
export function SelfAssessment({ responseId, rubric }: { responseId: string; rubric: RubricPayload }) {
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ awarded: number; maximum: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const complete = rubric.criteria.every((c) => marks[c.key] !== undefined);

  if (result) {
    return (
      <Notice tone="success" title={`Self-assessed: ${result.awarded} / ${result.maximum}`}>
        Saved to your progress as a self-assessed mark. It is kept separate from marks checked by the answer key, the AI Examiner or a teacher.
      </Notice>
    );
  }

  return (
    <section aria-labelledby="self-heading" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <h2 id="self-heading" className="text-lg font-semibold">
        Mark your answer against the rubric
      </h2>
      <p className="mt-1 text-[0.95rem] text-ink-2">For each criterion, compare your working with what the examiner looks for. Be honest; this is for your own revision.</p>
      <ol className="mt-4 space-y-4">
        {rubric.criteria.map((c, i) => {
          const options = Array.from({ length: c.marks * 2 + 1 }, (_, k) => k / 2).filter((v) => Number.isInteger(v) || c.marks > 1);
          return (
            <li key={c.key} className="rounded-md border border-line p-3">
              <fieldset>
                <legend className="w-full">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium text-ink">
                      {i + 1}. {c.partKey ? `(${c.partKey}) ` : ""}
                      <RichHtml html={c.descriptionHtml} inline />
                    </span>
                    <span className="shrink-0 text-sm text-ink-3">[{c.marks}]</span>
                  </span>
                </legend>
                <p className="mt-1 text-sm text-ink-2">
                  <span className="font-medium">Looks for: </span>
                  <RichHtml html={c.evidenceHtml} inline />
                </p>
                {c.alternatives.length > 0 && <p className="mt-1 text-sm text-ink-3">Also accepted: {c.alternatives.join("; ")}</p>}
                {c.partialCredit && <p className="mt-1 text-sm text-ink-3">Partial credit: {c.partialCredit}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {options.map((v) => (
                    <label key={v} className={`inline-flex min-h-11 min-w-12 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium ${marks[c.key] === v ? "border-accent bg-accent-soft text-accent-text" : "border-line-strong"}`}>
                      <input type="radio" className="sr-only" name={`c-${c.key}`} checked={marks[c.key] === v} onChange={() => setMarks((m) => ({ ...m, [c.key]: v }))} />
                      {v}
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
      <div className="mt-4 flex items-center gap-3">
        <Button
          disabled={!complete || pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await selfAssessAction(responseId, marks);
              if (r.ok) setResult({ awarded: r.awarded, maximum: r.maximum });
              else setError(r.error);
            })
          }
        >
          {pending && <Spinner label="Saving" />}
          Save self-assessment
        </Button>
        <span className="text-sm text-ink-3">
          {Object.values(marks).reduce((a, b) => a + b, 0)} / {rubric.totalMarks}
        </span>
      </div>
    </section>
  );
}
