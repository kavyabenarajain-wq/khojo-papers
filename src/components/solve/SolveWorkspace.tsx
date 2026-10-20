"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, CloudOff, Eye, Lightbulb, PenLine, RefreshCw, XCircle } from "lucide-react";
import type { Answer } from "@/lib/content/types";
import type { AnswerUi, RubricPayload, WhiteboardPayload } from "@/lib/content/payloads";
import { AnswerInputs } from "./AnswerInputs";
import { SelfAssessment } from "./SelfAssessment";
import { Whiteboard } from "@/components/whiteboard/Whiteboard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { RichHtml } from "@/components/ui/RichHtml";
import { Spinner } from "@/components/ui/Spinner";
import { Dialog } from "@/components/ui/Dialog";
import { revealSolutionAction, saveDraftAction, submitAnswerAction, type SubmitOutcome } from "@/app/questions/[id]/actions";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date; where: "account" | "device" } | { kind: "error"; message: string };

function isEmpty(a: Answer): boolean {
  const single = (x: Answer | undefined) => !x || (!x.choice && !x.value?.trim() && !x.text?.trim() && !x.unit?.trim());
  return single(a) && Object.values(a.parts ?? {}).every((p) => single(p));
}

export function SolveWorkspace(props: {
  questionId: string;
  ui: AnswerUi;
  hintsHtml: string[];
  signedIn: boolean;
  canSave: boolean;
  published: boolean;
  initialDraft: Answer | null;
  hasSolution: boolean;
  hasRubric: boolean;
  aiAvailable: boolean;
}) {
  const { questionId, ui, signedIn, canSave, published } = props;
  const storageKey = `khojo:draft:${questionId}`;
  const [answer, setAnswerState] = useState<Answer>(props.initialDraft ?? {});
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [solution, setSolution] = useState<{ whiteboard: WhiteboardPayload; rubric: RubricPayload | null } | null>(null);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [solutionError, setSolutionError] = useState<string | null>(null);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [revealing, startReveal] = useTransition();
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const solutionRef = useRef<HTMLDivElement>(null);
  const saveToAccount = signedIn && canSave && published;

  // Signed-out (or not yet able to save) students keep a draft on this device only.
  useEffect(() => {
    if (saveToAccount || props.initialDraft) return;
    // Restore after hydration (localStorage doesn't exist on the server).
    const frame = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) setAnswerState(JSON.parse(raw));
      } catch {
        /* storage unavailable */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [saveToAccount, props.initialDraft, storageKey]);

  const persist = useCallback(
    async (a: Answer) => {
      if (!saveToAccount) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(a));
          setSave({ kind: "saved", at: new Date(), where: "device" });
        } catch {
          setSave({ kind: "idle" });
        }
        return;
      }
      setSave({ kind: "saving" });
      const r = await saveDraftAction(questionId, a);
      if (r.ok) {
        dirty.current = false;
        setSave({ kind: "saved", at: new Date(r.savedAt), where: "account" });
      } else setSave({ kind: "error", message: r.error });
    },
    [questionId, saveToAccount, storageKey],
  );

  const setAnswer = (a: Answer) => {
    setAnswerState(a);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(a), 1200);
  };

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current && saveToAccount && !outcome) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [saveToAccount, outcome]);

  const submit = () => {
    setSubmitError(null);
    if (timer.current) clearTimeout(timer.current);
    startSubmit(async () => {
      const r = await submitAnswerAction(questionId, answer);
      if (!r.ok) {
        setSubmitError(r.error);
        return;
      }
      dirty.current = false;
      setOutcome(r);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    });
  };

  const reveal = () => {
    setConfirmReveal(false);
    setSolutionError(null);
    if (solution) {
      setSolutionOpen(true);
      return;
    }
    startReveal(async () => {
      const r = await revealSolutionAction(questionId);
      if (!r.ok) {
        setSolutionError(r.error);
        return;
      }
      setSolution({ whiteboard: r.whiteboard, rubric: r.rubric });
      setSolutionOpen(true);
      requestAnimationFrame(() => solutionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    });
  };

  const tryAgain = () => {
    setOutcome(null);
    setAnswerState({});
    setSave({ kind: "idle" });
  };

  const det = outcome?.deterministic ?? null;
  const mcqResult = det
    ? Object.fromEntries(det.parts.filter((p) => p.correctOption).map((p) => [p.partKey ?? "_", { correctKey: p.correctOption, chosen: p.chosenOption }]))
    : null;
  const empty = isEmpty(answer);

  return (
    <div className="space-y-6">
      <section aria-labelledby="answer-heading" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="answer-heading" className="text-lg font-semibold">
            Your answer
          </h2>
          <SaveIndicator state={save} onRetry={() => void persist(answer)} />
        </div>

        <AnswerInputs ui={ui} answer={answer} setAnswer={setAnswer} disabled={Boolean(outcome) || submitting} mcqResult={mcqResult} />

        {submitError && <Notice tone="danger" className="mt-4">{submitError}</Notice>}

        {!outcome ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={submit} disabled={submitting || empty} size="lg">
              {submitting ? <Spinner label="Submitting" /> : <PenLine className="size-4" aria-hidden />}
              {signedIn && canSave && published ? "Submit answer" : "Check answer"}
            </Button>
            {props.hasSolution && (
              <Button variant="secondary" size="lg" onClick={() => (empty ? setConfirmReveal(true) : reveal())} disabled={revealing}>
                {revealing ? <Spinner label="Loading solution" /> : <Eye className="size-4" aria-hidden />}
                Reveal solution
              </Button>
            )}
          </div>
        ) : (
          <Result
            outcome={outcome}
            signedIn={signedIn}
            canSave={canSave}
            hasSolution={props.hasSolution}
            hasRubric={props.hasRubric}
            aiAvailable={props.aiAvailable}
            questionId={questionId}
            onReveal={reveal}
            revealing={revealing}
            onTryAgain={tryAgain}
          />
        )}
        {!signedIn && (
          <p className="mt-4 text-sm text-ink-3">
            <Link href={`/login?next=/questions/${questionId}`} className="font-medium text-accent-text underline underline-offset-2">Sign in</Link>{" "}
            to save your answers and track progress. Drafts are kept on this device until then.
          </p>
        )}
      </section>

      {props.hintsHtml.length > 0 && !outcome && (
        <section aria-labelledby="hints-heading" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="hints-heading" className="flex items-center gap-2 font-semibold">
              <Lightbulb className="size-5 text-warning" aria-hidden /> Hints
            </h2>
            {hintsShown < props.hintsHtml.length && (
              <Button variant="secondary" size="sm" onClick={() => setHintsShown((n) => n + 1)}>
                {hintsShown === 0 ? "Show a hint" : "Show another hint"}
              </Button>
            )}
          </div>
          {hintsShown > 0 && (
            <ol className="mt-3 space-y-2" aria-live="polite">
              {props.hintsHtml.slice(0, hintsShown).map((h, i) => (
                <li key={i} className="flex gap-2 rounded-md bg-warning-soft px-3 py-2">
                  <span className="font-semibold text-ink-2">{i + 1}.</span>
                  <RichHtml html={h} className="text-ink" />
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {solutionError && <Notice tone="danger">{solutionError}</Notice>}
      <div ref={solutionRef} className="scroll-mt-20">
        {solution && solutionOpen && (
          <div className="space-y-6">
            <Whiteboard payload={solution.whiteboard} onHide={() => setSolutionOpen(false)} />
            {outcome?.saved && outcome.needsRubricMarking && outcome.responseId && solution.rubric && (
              <SelfAssessment responseId={outcome.responseId} rubric={solution.rubric} />
            )}
          </div>
        )}
        {solution && !solutionOpen && (
          <Button variant="secondary" onClick={() => setSolutionOpen(true)}>
            <Eye className="size-4" aria-hidden /> Show solution again
          </Button>
        )}
      </div>

      <Dialog
        open={confirmReveal}
        onClose={() => setConfirmReveal(false)}
        title="Reveal the solution now?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmReveal(false)}>
              Keep trying
            </Button>
            <Button onClick={reveal}>Reveal solution</Button>
          </div>
        }
      >
        <p className="text-ink-2">You learn more by attempting the question first, even if you only get part of the way. You can always reveal the solution after you submit.</p>
      </Dialog>
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.kind === "idle") return null;
  if (state.kind === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-3" role="status">
        <Spinner className="[&_svg]:size-4" label="Saving" /> Saving…
      </span>
    );
  if (state.kind === "error")
    return (
      <span className="inline-flex items-center gap-2 text-sm text-danger" role="alert">
        <CloudOff className="size-4" aria-hidden /> Not saved
        <button type="button" onClick={onRetry} className="inline-flex min-h-9 items-center gap-1 rounded px-2 font-medium underline underline-offset-2">
          <RefreshCw className="size-3.5" aria-hidden /> Retry
        </button>
      </span>
    );
  return (
    <span className="text-sm text-ink-3" role="status">
      {state.where === "account" ? "Draft saved" : "Draft kept on this device"} · {state.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

function Result(props: {
  outcome: SubmitOutcome;
  signedIn: boolean;
  canSave: boolean;
  hasSolution: boolean;
  hasRubric: boolean;
  aiAvailable: boolean;
  questionId: string;
  onReveal: () => void;
  revealing: boolean;
  onTryAgain: () => void;
}) {
  const { outcome } = props;
  const det = outcome.deterministic;
  const full = det?.complete && det.awarded === det.maximum;

  return (
    <div className="mt-5 space-y-4" aria-live="polite">
      {det && (
        <div className={`rounded-md border p-4 ${full ? "border-success/30 bg-success-soft" : "border-danger/25 bg-danger-soft"}`}>
          <p className="flex items-center gap-2 text-lg font-semibold">
            {full ? <CheckCircle2 className="size-6 text-success" aria-hidden /> : <XCircle className="size-6 text-danger" aria-hidden />}
            {full ? "Correct" : det.awarded > 0 ? "Partly correct" : "Not quite"}
            <span className="ml-auto text-base font-medium tabular-nums">
              {det.awarded} / {det.maximum}
            </span>
          </p>
          <ul className="mt-2 space-y-1 text-[0.95rem] text-ink-2">
            {det.parts.map((p, i) => (
              <li key={i}>
                {p.partKey ? <span className="font-medium">({p.partKey}) </span> : null}
                {p.detail}
              </li>
            ))}
          </ul>
          {!det.complete && (
            <p className="mt-2 text-sm text-ink-2">
              Checked against the answer key for parts {det.parts.map((p) => `(${p.partKey})`).join(", ")}. Parts {det.pendingParts.map((k) => `(${k})`).join(", ")} are marked on your working.
            </p>
          )}
          <p className="mt-2 text-xs text-ink-3">Checked against the verified answer key.</p>
        </div>
      )}
      {outcome.finalValueCheck && (
        <Notice tone={outcome.finalValueCheck.correct ? "success" : "warning"} title={outcome.finalValueCheck.correct ? "Your final value matches the verified answer" : "Your final value doesn't match"}>
          {outcome.finalValueCheck.correct ? "Marks also depend on your working; mark it against the rubric below." : outcome.finalValueCheck.detail}
        </Notice>
      )}
      {outcome.needsRubricMarking && (
        <Notice tone="info" title={outcome.saved ? "Your answer is saved" : "This answer is marked on working"}>
          {outcome.saved
            ? "Compare it with the worked solution and mark yourself against the rubric, or ask the AI Examiner for criterion-by-criterion feedback."
            : props.signedIn && !props.canSave
              ? "Your answer wasn't saved because guardian consent is still pending. You can still compare it with the worked solution."
              : "Sign in to save it and use the rubric or the AI Examiner. You can still compare with the worked solution."}
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        {props.hasSolution && (
          <Button onClick={props.onReveal} disabled={props.revealing}>
            {props.revealing ? <Spinner label="Loading solution" /> : <Eye className="size-4" aria-hidden />}
            {outcome.needsRubricMarking && outcome.saved && props.hasRubric ? "See solution and mark yourself" : "See worked solution"}
          </Button>
        )}
        {outcome.needsRubricMarking && props.hasRubric && props.aiAvailable && outcome.saved && outcome.responseId && (
          <ButtonLink href={`/examiner/${props.questionId}?response=${outcome.responseId}`} variant="secondary">
            Check with AI Examiner
          </ButtonLink>
        )}
        <Button variant="ghost" onClick={props.onTryAgain}>
          <RefreshCw className="size-4" aria-hidden /> Try again
        </Button>
      </div>
    </div>
  );
}
