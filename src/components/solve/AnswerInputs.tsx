"use client";

import type { Answer, SingleAnswer } from "@/lib/content/types";
import type { AnswerUi } from "@/lib/content/payloads";
import { RichHtml } from "@/components/ui/RichHtml";
import { Input, Label, Textarea } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

type OptionHtml = { key: string; html: string };

export function McqInput({ name, options, value, onChange, disabled, result }: {
  name: string;
  options: OptionHtml[];
  value?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  result?: { correctKey?: string; chosen?: string } | null;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">Choose one option</legend>
      {options.map((o) => {
        const checked = value === o.key;
        const isCorrect = result?.correctKey === o.key;
        const isWrongChoice = result && result.chosen === o.key && result.correctKey && result.correctKey !== o.key;
        return (
          <label
            key={o.key}
            className={cn(
              "flex min-h-12 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
              checked ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
              isCorrect && "border-success bg-success-soft",
              isWrongChoice && "border-danger bg-danger-soft",
              disabled && "cursor-default",
            )}
          >
            <input type="radio" name={name} value={o.key} checked={checked} onChange={() => onChange(o.key)} className="mt-1 size-4 shrink-0 accent-[var(--accent)]" />
            <span className="font-medium text-ink-2">({o.key})</span>
            <RichHtml html={o.html} inline className="min-w-0 flex-1" />
          </label>
        );
      })}
    </fieldset>
  );
}

export function NumericInput({ id, value, unit, expectedUnit, label, onChange, disabled }: {
  id: string;
  value: SingleAnswer;
  unit: string | null;
  expectedUnit?: boolean;
  label?: string | null;
  onChange: (v: SingleAnswer) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-40">
        <Label htmlFor={`${id}-value`}>{label ?? "Your answer"}</Label>
        <Input
          id={`${id}-value`}
          inputMode="decimal"
          autoComplete="off"
          value={value.value ?? ""}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
          placeholder="e.g. 12.5 or 3/4"
          disabled={disabled}
        />
      </div>
      {(unit || expectedUnit) && (
        <div className="w-32">
          <Label htmlFor={`${id}-unit`}>Unit</Label>
          <Input id={`${id}-unit`} autoComplete="off" value={value.unit ?? ""} onChange={(e) => onChange({ ...value, unit: e.target.value })} placeholder={unit ?? ""} disabled={disabled} />
        </div>
      )}
    </div>
  );
}

export function TextAnswer({ id, value, onChange, format, disabled }: { id: string; value: string; onChange: (v: string) => void; format: string; disabled?: boolean }) {
  const long = format === "long_answer" || format === "math_working";
  return (
    <div>
      <Label htmlFor={id}>{format === "math_working" ? "Your working" : "Your answer"}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={long ? 8 : 4}
        disabled={disabled}
        spellCheck={format !== "math_working"}
        placeholder={format === "math_working" ? "Write each step on a new line, e.g.\n2x² − 7x + 3 = 0\n(2x − 1)(x − 3) = 0" : ""}
        className="font-[inherit]"
      />
    </div>
  );
}

/** Renders the right input(s) for a question's answer format. */
export function AnswerInputs({ ui, answer, setAnswer, disabled, mcqResult }: {
  ui: AnswerUi;
  answer: Answer;
  setAnswer: (a: Answer) => void;
  disabled?: boolean;
  mcqResult?: Record<string, { correctKey?: string; chosen?: string }> | null;
}) {
  const single = (format: string, value: SingleAnswer, onChange: (v: SingleAnswer) => void, opts: { id: string; options: OptionHtml[] | null; unit: string | null; label?: string | null; resultKey?: string }) => {
    if (format === "mcq" && opts.options) {
      return <McqInput name={opts.id} options={opts.options} value={value.choice} onChange={(choice) => onChange({ ...value, choice })} disabled={disabled} result={mcqResult?.[opts.resultKey ?? "_"] ?? null} />;
    }
    if (format === "numerical") {
      return <NumericInput id={opts.id} value={value} unit={opts.unit} expectedUnit={Boolean(opts.unit)} label={opts.label} onChange={onChange} disabled={disabled} />;
    }
    return <TextAnswer id={opts.id} value={value.text ?? ""} onChange={(text) => onChange({ ...value, text })} format={format} disabled={disabled} />;
  };

  if (ui.format === "structured" && ui.parts) {
    return (
      <div className="space-y-6">
        {ui.parts.map((p) => {
          const v = answer.parts?.[p.key] ?? {};
          return (
            <div key={p.key} className="border-l-2 border-line pl-3 sm:pl-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-2">
                  <span className="font-semibold text-ink-2">({p.key})</span>
                  <RichHtml html={p.promptHtml} variant="question" className="min-w-0" />
                </div>
                <span className="shrink-0 text-sm text-ink-3">[{p.marks}]</span>
              </div>
              {single(p.format, v, (nv) => setAnswer({ ...answer, parts: { ...(answer.parts ?? {}), [p.key]: nv } }), {
                id: `part-${p.key}`,
                options: p.optionsHtml,
                unit: p.numericUnit,
                resultKey: p.key,
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {single(ui.format, answer, (nv) => setAnswer({ ...answer, ...nv }), { id: "answer", options: ui.optionsHtml, unit: ui.numericUnit, label: ui.answerLabel, resultKey: "_" })}
      {ui.finalValue && (
        <div className="rounded-md bg-surface-2 p-3">
          <NumericInput
            id="final"
            value={{ value: answer.value, unit: answer.unit }}
            unit={ui.finalValue.unit}
            expectedUnit={Boolean(ui.finalValue.unit)}
            label="Final answer (optional)"
            onChange={(v) => setAnswer({ ...answer, value: v.value, unit: v.unit })}
            disabled={disabled}
          />
          <p className="mt-2 text-sm text-ink-3">We&apos;ll tell you if your final value matches. Marks for working come from the rubric.</p>
        </div>
      )}
    </div>
  );
}
