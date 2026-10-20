"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CloudOff, Grid3x3, Timer } from "lucide-react";
import type { Answer } from "@/lib/content/types";
import type { AnswerUi } from "@/lib/content/payloads";
import { AnswerInputs } from "@/components/solve/AnswerInputs";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { saveExamAnswerAction, submitExamAction } from "@/app/papers/[slug]/actions";
import { cn } from "@/lib/cn";

export type ExamRunnerItem = { responseId: string; sectionId: string; displayNumber: string; marks: number; ui: AnswerUi; initial: Answer };
export type ExamRunnerSection = { id: string; label: string; instructions: string | null; choiceRule: "all" | "any_n"; chooseN: number | null };

function answered(a: Answer | undefined): boolean {
  const one = (x: Answer | undefined) => Boolean(x && (x.choice || x.value?.trim() || x.text?.trim()));
  return Boolean(a && (one(a) || Object.values(a.parts ?? {}).some((p) => one(p))));
}

function fmt(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function ExamRunner(props: {
  attemptId: string;
  slug: string;
  title: string;
  deadline: string;
  serverNow: string;
  sections: ExamRunnerSection[];
  items: ExamRunnerItem[];
  /** Server-rendered question bodies, in the same order as items. */
  bodies: ReactNode[];
}) {
  const { attemptId, slug, items, sections } = props;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(items.map((i) => [i.responseId, i.initial])));
  const [unsaved, setUnsaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latest = useRef(answers);
  const retryRef = useRef<(id: string) => void>(() => undefined);

  const deadline = new Date(props.deadline).getTime();
  const serverNowMs = new Date(props.serverNow).getTime();
  const [remaining, setRemaining] = useState(deadline - serverNowMs);

  const persist = useCallback(
    async (responseId: string) => {
      setSaving(true);
      const r = await saveExamAnswerAction(attemptId, responseId, latest.current[responseId] ?? {});
      setSaving(false);
      if (r.ok) {
        setSaveError(null);
        setUnsaved((u) => {
          const n = new Set(u);
          n.delete(responseId);
          return n;
        });
      } else {
        setSaveError(r.error);
        if (!r.final) timers.current[responseId] = setTimeout(() => retryRef.current(responseId), 5000);
      }
    },
    [attemptId],
  );

  const flushAll = useCallback(async () => {
    for (const id of Object.keys(timers.current)) clearTimeout(timers.current[id]);
    for (const id of Array.from(unsaved)) await persist(id);
  }, [unsaved, persist]);

  const submit = useCallback(() => {
    setSubmitError(null);
    startSubmit(async () => {
      await flushAll();
      const r = await submitExamAction(attemptId, slug);
      if (r && !r.ok) setSubmitError(r.error);
    });
  }, [attemptId, slug, flushAll]);

  useEffect(() => {
    retryRef.current = (id: string) => void persist(id);
  }, [persist]);

  useEffect(() => {
    // Clock offset so the countdown follows the server, not the device clock.
    const offset = serverNowMs - Date.now();
    const t = setInterval(() => {
      const left = deadline - (Date.now() + offset);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(t);
        submit();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, serverNowMs, submit]);

  // Retry unsaved answers when the connection returns; warn before leaving with unsaved work.
  useEffect(() => {
    const online = () => unsaved.forEach((id) => void persist(id));
    const leave = (e: BeforeUnloadEvent) => {
      if (unsaved.size) e.preventDefault();
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", leave);
    };
  }, [unsaved, persist]);

  const item = items[index];
  const setAnswer = (a: Answer) => {
    latest.current = { ...latest.current, [item.responseId]: a };
    setAnswers((prev) => ({ ...prev, [item.responseId]: a }));
    setUnsaved((u) => new Set(u).add(item.responseId));
    clearTimeout(timers.current[item.responseId]);
    const id = item.responseId;
    timers.current[id] = setTimeout(() => void persist(id), 1000);
  };

  const answeredCount = items.filter((i) => answered(answers[i.responseId])).length;
  const overAttempted = sections
    .filter((s) => s.choiceRule === "any_n" && s.chooseN)
    .map((s) => ({ s, n: items.filter((i) => i.sectionId === s.id && answered(answers[i.responseId])).length }))
    .filter((x) => x.n > (x.s.chooseN ?? 0));
  const section = sections.find((s) => s.id === item.sectionId);
  const lowTime = remaining < 5 * 60_000;

  const Navigator = (
    <div className="space-y-4">
      {sections.map((s) => (
        <div key={s.id}>
          <p className="mb-2 text-sm font-semibold text-ink">
            {s.label}
            {s.choiceRule === "any_n" && <span className="font-normal text-ink-3"> · any {s.chooseN}</span>}
          </p>
          <ul className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {items.map((it, i) =>
              it.sectionId !== s.id ? null : (
                <li key={it.responseId}>
                  <button
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      setNavOpen(false);
                    }}
                    aria-current={i === index ? "step" : undefined}
                    aria-label={`Question ${it.displayNumber}${answered(answers[it.responseId]) ? ", answered" : ", not answered"}`}
                    className={cn(
                      "flex size-11 items-center justify-center rounded-md border text-sm font-semibold",
                      i === index && "ring-2 ring-accent ring-offset-1",
                      answered(answers[it.responseId]) ? "border-accent bg-accent-soft text-accent-text" : "border-line-strong bg-surface text-ink-2",
                    )}
                  >
                    {it.displayNumber}
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
      <p className="text-sm text-ink-3">
        {answeredCount} of {items.length} answered
      </p>
    </div>
  );

  return (
    <div>
      <div className="sticky top-14 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          <div
            className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold tabular-nums", lowTime ? "bg-danger-soft text-danger" : "bg-surface-2 text-ink")}
            role="timer"
            aria-live={lowTime ? "polite" : "off"}
            aria-label={`Time remaining ${fmt(remaining)}`}
          >
            <Timer className="size-4" aria-hidden /> {fmt(remaining)}
          </div>
          <span className="hidden truncate text-sm text-ink-3 sm:inline">{props.title}</span>
          <span className="ml-auto inline-flex items-center gap-2 text-sm text-ink-3" role="status">
            {saving ? (
              <>
                <Spinner className="[&_svg]:size-4" label="Saving" /> Saving
              </>
            ) : saveError ? (
              <span className="inline-flex items-center gap-1 text-danger">
                <CloudOff className="size-4" aria-hidden /> Not saved
              </span>
            ) : unsaved.size ? (
              "Unsaved changes"
            ) : (
              "All answers saved"
            )}
          </span>
          <Button size="sm" onClick={() => setConfirm(true)} disabled={submitting}>
            Submit
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          {saveError && <Notice tone="warning" className="mb-4">{saveError} Your answers stay on this page and we&apos;ll keep retrying.</Notice>}
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-ink-3">
              {section?.label}
              {section?.choiceRule === "any_n" && ` · answer any ${section.chooseN}`}
            </p>
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setNavOpen(true)}>
              <Grid3x3 className="size-4" aria-hidden /> Questions
            </Button>
          </div>
          <article aria-labelledby="exam-q" className="rounded-lg border border-line bg-surface p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="exam-q" className="font-semibold">Question {item.displayNumber}</h2>
              <span className="text-sm text-ink-3">[{item.marks} mark{item.marks === 1 ? "" : "s"}]</span>
            </div>
            {props.bodies[index]}
          </article>
          <div className="mt-4 rounded-lg border border-line bg-surface p-4 sm:p-5">
            <AnswerInputs key={item.responseId} ui={item.ui} answer={answers[item.responseId] ?? {}} setAnswer={setAnswer} disabled={submitting} />
          </div>
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="secondary" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              <ChevronLeft className="size-4" aria-hidden /> Previous
            </Button>
            {index < items.length - 1 ? (
              <Button onClick={() => setIndex((i) => i + 1)}>
                Next <ChevronRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button onClick={() => setConfirm(true)}>Review and submit</Button>
            )}
          </div>
        </div>
        <aside className="hidden lg:block" aria-label="Question navigator">
          <div className="sticky top-32 rounded-lg border border-line bg-surface p-4">{Navigator}</div>
        </aside>
      </div>

      <Dialog open={navOpen} onClose={() => setNavOpen(false)} title="Questions" variant="drawer">
        {Navigator}
      </Dialog>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Submit your paper?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>Keep working</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Spinner label="Submitting" />}
              Submit paper
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-ink-2">
          <p>
            You have answered {answeredCount} of {items.length} questions. Time left: {fmt(remaining)}.
          </p>
          {answeredCount < items.length && <Notice tone="warning">Unanswered questions score zero.</Notice>}
          {overAttempted.map(({ s, n }) => (
            <Notice key={s.id} tone="info">
              In {s.label} you answered {n} questions but only {s.chooseN} count. With this practice set&apos;s rule, your best {s.chooseN} will be counted.
            </Notice>
          ))}
          {submitError && <Notice tone="danger">{submitError}</Notice>}
          <p className="text-sm">After submitting, you can&apos;t change your answers.</p>
        </div>
      </Dialog>
    </div>
  );
}
