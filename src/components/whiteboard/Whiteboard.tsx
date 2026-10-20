"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, EyeOff, ListOrdered, Pause, Play, RotateCcw } from "lucide-react";
import type { WhiteboardPayload, WhiteboardStep } from "@/lib/content/payloads";
import { Diagram } from "@/components/diagram/Diagram";
import { RichHtml } from "@/components/ui/RichHtml";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type Mode = "board" | "all";
const AUTOPLAY_MS = 4500;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches || document.documentElement.dataset.reducedMotion === "true");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function StepBody({ step, animate }: { step: WhiteboardStep; animate: boolean }) {
  return (
    <div>
      {step.expressionHtml && (
        <div className={cn("math-display text-[1.05rem] text-ink", animate && "wb-write")} dangerouslySetInnerHTML={{ __html: step.expressionHtml }} />
      )}
      {step.resultHtml && (
        <div className={cn("mt-1 inline-block max-w-full rounded-md border-2 border-accent/60 px-3", animate && "wb-fade")} style={animate ? { animationDelay: "700ms" } : undefined}>
          <div className="math-display" dangerouslySetInnerHTML={{ __html: step.resultHtml }} />
        </div>
      )}
      <RichHtml html={step.explanationHtml} className={cn("mt-2 text-ink", animate && "wb-fade")} />
      {(step.reasonHtml || step.ruleHtml) && (
        <div className={cn("mt-2 space-y-1 text-[0.93rem] text-ink-2", animate && "wb-fade")}>
          {step.ruleHtml && (
            <p>
              <span className="font-semibold text-ink">Rule: </span>
              <span dangerouslySetInnerHTML={{ __html: step.ruleHtml }} />
            </p>
          )}
          {step.reasonHtml && (
            <div className="flex gap-1">
              <span className="shrink-0 font-semibold text-ink">Why: </span>
              <RichHtml html={step.reasonHtml} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Whiteboard({ payload, onHide }: { payload: WhiteboardPayload; onHide?: () => void }) {
  const total = payload.steps.length;
  const [mode, setMode] = useState<Mode>("board");
  const [current, setCurrent] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const reduced = usePrefersReducedMotion();
  const boardRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<HTMLLIElement>(null);

  const go = useCallback(
    (n: number) => {
      setCurrent(Math.min(Math.max(1, n), total));
      setAnimKey((k) => k + 1);
    },
    [total],
  );

  // Autoplay advances one step at a time and stops itself on the last step.
  const isPlaying = playing && current < total;
  useEffect(() => {
    if (!isPlaying) return;
    const t = setTimeout(() => {
      go(current + 1);
      if (current + 1 >= total) setPlaying(false);
    }, AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [isPlaying, current, total, go]);

  useEffect(() => {
    latestRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [current, reduced]);

  const visible = payload.steps.slice(0, current);
  const step = payload.steps[current - 1];

  // The figure for the current point of the solution: the most recent step that names one.
  const diagram = useMemo(() => {
    const ref = [...visible].reverse().find((s) => s.diagramId)?.diagramId;
    return ref ? payload.diagrams.find((d) => d.id === ref) ?? null : null;
  }, [visible, payload.diagrams]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(current + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(current - 1);
    }
  };

  return (
    <section aria-label="Worked solution" className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 sm:px-4">
        <div role="tablist" aria-label="Solution view" className="flex gap-1">
          {(["board", "all"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn("min-h-10 rounded-md px-3 text-sm font-medium", mode === m ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink")}
            >
              {m === "board" ? "Step by step" : "All steps as text"}
            </button>
          ))}
        </div>
        {onHide && (
          <Button variant="ghost" size="sm" onClick={onHide}>
            <EyeOff className="size-4" aria-hidden /> Hide solution
          </Button>
        )}
      </div>

      {mode === "board" ? (
        <div ref={boardRef} tabIndex={0} onKeyDown={onKey} aria-describedby="wb-help" className="focus-visible:outline-offset-[-2px]">
          <p id="wb-help" className="sr-only">
            Use the left and right arrow keys to move between steps.
          </p>
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <ol className="max-h-[55dvh] min-h-48 space-y-5 overflow-y-auto px-4 py-4 sm:px-5" style={{ background: "var(--board)" }}>
              {visible.map((s, i) => {
                const isCurrent = i === current - 1;
                return (
                  <li key={isCurrent ? `${s.n}-${animKey}` : s.n} ref={isCurrent ? latestRef : undefined} className={cn("transition-opacity", !isCurrent && "opacity-70")}>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold", isCurrent ? "bg-accent text-accent-ink" : "bg-surface-3 text-ink-2")}>
                        {s.n}
                      </span>
                      {s.partKey && <span className="font-medium text-ink-3">Part ({s.partKey})</span>}
                      {s.title && <span className="font-semibold text-ink">{s.title}</span>}
                      {s.isFinal && <span className="rounded-sm bg-success-soft px-1.5 text-xs font-medium text-success">Answer</span>}
                    </div>
                    <StepBody step={s} animate={isCurrent && !reduced} />
                  </li>
                );
              })}
            </ol>
            {diagram && (
              <div className="order-first border-b border-line p-4 lg:order-none lg:border-b-0 lg:border-l">
                <Diagram key={`${diagram.id}-${current}-${animKey}`} diagram={diagram} visibleStep={current} animateStep={reduced ? undefined : current} />
                <p className="sr-only">
                  {diagram.alt} {diagram.solutionAlt}
                </p>
              </div>
            )}
          </div>
          <p aria-live="polite" className="sr-only">
            Step {current} of {total}
            {step?.title ? `: ${step.title}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-3 sm:px-4">
            <Button variant="secondary" onClick={() => go(current - 1)} disabled={current <= 1} aria-label="Previous step">
              <ChevronLeft className="size-4" aria-hidden />
              <span className="hidden xs:inline">Previous</span>
            </Button>
            <Button onClick={() => go(current + 1)} disabled={current >= total} aria-label="Next step">
              <span className="hidden xs:inline">Next step</span>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <span className="mx-1 text-sm tabular-nums text-ink-3">
              {current} / {total}
            </span>
            <div className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                onClick={() => {
                  if (current >= total) go(1);
                  setPlaying(!isPlaying);
                }}
                aria-label={isPlaying ? "Pause" : current >= total ? "Replay explanation" : "Play explanation"}
              >
                {isPlaying ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                <span className="hidden sm:inline">{isPlaying ? "Pause" : current >= total ? "Replay" : "Play"}</span>
              </Button>
              <Button variant="ghost" onClick={() => { setPlaying(false); go(1); }} aria-label="Restart explanation">
                <RotateCcw className="size-4" aria-hidden />
                <span className="hidden sm:inline">Restart</span>
              </Button>
              <Button variant="ghost" onClick={() => { setPlaying(false); go(total); }} aria-label="Show all steps">
                <ListOrdered className="size-4" aria-hidden />
                <span className="hidden sm:inline">Show all</span>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5 px-4 py-4 sm:px-5">
          <ol className="space-y-5">
            {payload.steps.map((s) => (
              <li key={s.n}>
                <p className="mb-1 text-sm font-semibold text-ink">
                  Step {s.n}
                  {s.partKey ? ` · Part (${s.partKey})` : ""}
                  {s.title ? ` · ${s.title}` : ""}
                </p>
                <StepBody step={s} animate={false} />
              </li>
            ))}
          </ol>
          {payload.diagrams.map((d) => (
            <div key={d.id}>
              <Diagram diagram={d} />
              <p className="mt-1 text-sm text-ink-3">{[d.alt, d.solutionAlt].filter(Boolean).join(" ")}</p>
            </div>
          ))}
        </div>
      )}

      {mode === "board" && current < total ? (
        <p className="border-t border-line px-4 py-3 text-sm text-ink-3 sm:px-5">The final answer, common mistakes and other methods appear after the last step.</p>
      ) : (
      <div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-3">Final answer</h3>
          <RichHtml html={payload.finalAnswerHtml} className="mt-1 rounded-md bg-success-soft px-3 py-2 text-ink" />
        </div>
        <details className="group">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">Model answer</summary>
          <RichHtml html={payload.modelAnswerHtml} variant="question" className="mt-1 text-ink" />
        </details>
        {payload.commonMistakesHtml.length > 0 && (
          <div>
            <h3 className="font-semibold text-ink">Common mistakes</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-2">
              {payload.commonMistakesHtml.map((m, i) => (
                <li key={i}>
                  <RichHtml html={m} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {payload.alternativeMethods.length > 0 && (
          <div>
            <h3 className="font-semibold text-ink">Other valid methods</h3>
            {payload.alternativeMethods.map((m, i) => (
              <div key={i} className="mt-2">
                <p className="font-medium text-ink">{m.title}</p>
                <RichHtml html={m.html} className="text-ink-2" />
              </div>
            ))}
          </div>
        )}
        {!payload.reviewed && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-ink">
            This solution has not been reviewed by a teacher yet (staff preview).
          </p>
        )}
      </div>
      )}
    </section>
  );
}
