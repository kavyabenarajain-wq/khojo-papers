"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, ImageUp, Keyboard, RotateCcw, ScanText, TriangleAlert } from "lucide-react";
import { confirmAndEvaluateAction, evaluateTypedAction, recognizeAction, type RecognizeResult } from "@/app/examiner/actions";
import { Button } from "@/components/ui/Button";
import { Label, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

type Quality = { warnings: string[]; width: number; height: number };
type Step =
  | { kind: "choose" }
  | { kind: "photo"; file?: File; preview?: string; quality?: Quality; prepared?: Blob }
  | { kind: "uploading"; progress: number; preview: string }
  | { kind: "reading"; preview: string }
  | { kind: "review"; preview: string; responseId: string; result: Extract<RecognizeResult, { ok: true }> }
  | { kind: "typed" };

/** Analyse a downscaled greyscale copy: brightness, contrast and a Laplacian-variance blur score. */
async function analyse(bitmap: ImageBitmap): Promise<Quality> {
  const w = 480;
  const h = Math.max(1, Math.round((bitmap.height / bitmap.width) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    sum += g[i];
  }
  const mean = sum / (w * h);
  let varSum = 0;
  for (let i = 0; i < w * h; i++) varSum += (g[i] - mean) ** 2;
  const std = Math.sqrt(varSum / (w * h));
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      lapSum += l;
      lapSq += l * l;
      n++;
    }
  const lapVar = lapSq / n - (lapSum / n) ** 2;
  const warnings: string[] = [];
  if (mean < 80) warnings.push("The photo looks dark. Try brighter light, without shadows over the page.");
  if (mean > 235) warnings.push("The photo looks washed out. Avoid direct glare on the page.");
  if (std < 25) warnings.push("The writing has low contrast. Write in dark ink, or move closer.");
  if (lapVar < 60) warnings.push("The photo may be blurry. Hold the phone steady and tap to focus on the writing.");
  if (bitmap.width > bitmap.height * 1.4) warnings.push("This is a landscape photo. If the page is sideways, rotate it before uploading.");
  if (Math.min(bitmap.width, bitmap.height) < 700) warnings.push("The photo is small; handwriting may be hard to read. Use the camera's full resolution.");
  return { warnings, width: bitmap.width, height: bitmap.height };
}

/** Downscale and re-encode on the device so uploads are fast on mobile data. */
async function prepare(bitmap: ImageBitmap): Promise<Blob> {
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.88));
}

function upload(blob: Blob, questionId: string, responseId: string | null, onProgress: (p: number) => void): Promise<{ responseId: string; uploadId: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", blob, "answer.jpg");
    form.append("questionId", questionId);
    if (responseId) form.append("responseId", responseId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/examiner/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { error?: string; responseId?: string; uploadId?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.responseId && body.uploadId) resolve({ responseId: body.responseId, uploadId: body.uploadId });
      else reject(new Error(body.error ?? `Upload failed (${xhr.status}). Please try again.`));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("The upload timed out. Try again on a stronger connection."));
    xhr.timeout = 120_000;
    xhr.send(form);
  });
}

export function ExaminerFlow({ questionId, responseId, submittedText }: { questionId: string; responseId: string | null; submittedText: string | null }) {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if ("preview" in step && step.preview) URL.revokeObjectURL(step.preview);
  }, [step]);

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      setError("HEIC photos aren't supported. On iPhone, choose “Most Compatible” in Camera → Formats, or take the photo from this page.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose a photo.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const [quality, prepared] = await Promise.all([analyse(bitmap), prepare(bitmap)]);
      setStep({ kind: "photo", file, preview: URL.createObjectURL(prepared), quality, prepared });
    } catch {
      setError("We couldn't open that photo on this device. Try taking it again.");
    }
  };

  const send = async () => {
    if (step.kind !== "photo" || !step.prepared || !step.preview) return;
    const preview = step.preview;
    setError(null);
    setStep({ kind: "uploading", progress: 0, preview });
    try {
      const up = await upload(step.prepared, questionId, responseId, (p) => setStep({ kind: "uploading", progress: p, preview }));
      setStep({ kind: "reading", preview });
      const r = await recognizeAction(up.responseId, up.uploadId);
      if (!r.ok) {
        setError(r.error);
        setStep({ kind: "photo", preview, prepared: step.prepared, quality: step.quality });
        return;
      }
      setText(r.text);
      setStep({ kind: "review", preview, responseId: up.responseId, result: r });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setStep({ kind: "photo", preview, prepared: step.prepared, quality: step.quality });
    }
  };

  const retake = () => {
    setError(null);
    setStep({ kind: "photo" });
  };

  return (
    <div className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}

      {step.kind === "choose" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setStep({ kind: "photo" })} className="rounded-lg border border-line bg-surface p-4 text-left hover:border-accent">
            <Camera className="mb-2 size-6 text-accent-text" aria-hidden />
            <span className="block font-semibold">Photo of my handwritten answer</span>
            <span className="mt-1 block text-sm text-ink-2">Best for working, diagrams and calculations written on paper.</span>
          </button>
          {submittedText ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => { const r = await evaluateTypedAction(questionId, responseId, null); if (r && !r.ok) setError(r.error); })}
              className="rounded-lg border border-line bg-surface p-4 text-left hover:border-accent disabled:opacity-60"
            >
              <Keyboard className="mb-2 size-6 text-accent-text" aria-hidden />
              <span className="block font-semibold">{pending ? "Marking…" : "Mark the answer I typed"}</span>
              <span className="mt-1 line-clamp-2 block text-sm text-ink-2">{submittedText}</span>
            </button>
          ) : (
            <button type="button" onClick={() => setStep({ kind: "typed" })} className="rounded-lg border border-line bg-surface p-4 text-left hover:border-accent">
              <Keyboard className="mb-2 size-6 text-accent-text" aria-hidden />
              <span className="block font-semibold">Type my answer</span>
              <span className="mt-1 block text-sm text-ink-2">For short answers and reasoning you can type.</span>
            </button>
          )}
        </div>
      )}

      {step.kind === "photo" && (
        <section aria-labelledby="photo-h" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
          <h2 id="photo-h" className="font-semibold">Photograph your answer</h2>
          {!step.preview ? (
            <>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.95rem] text-ink-2">
                <li>Lay the page flat in good light, and fill the frame with your answer.</li>
                <li>Use dark ink. Cross out mistakes with a single clear line.</li>
                <li>Don&apos;t include your name, roll number or school in the photo.</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => cameraRef.current?.click()}>
                  <Camera className="size-4" aria-hidden /> Take photo
                </Button>
                <Button variant="secondary" onClick={() => libraryRef.current?.click()}>
                  <ImageUp className="size-4" aria-hidden /> Choose from photos
                </Button>
                <Button variant="ghost" onClick={() => setStep({ kind: "choose" })}>Back</Button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
              <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </>
          ) : (
            <div className="mt-3 space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.preview} alt="Preview of your answer photo" className="max-h-[50dvh] w-auto max-w-full rounded-md border border-line object-contain" />
              {step.quality?.warnings.length ? (
                <Notice tone="warning" title="Check the photo before sending">
                  <ul className="list-disc space-y-1 pl-5">
                    {step.quality.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                  <p className="mt-2 text-sm">These are automatic checks and can be wrong. If the writing looks clear to you, you can still use it.</p>
                </Notice>
              ) : (
                <Notice tone="success">The photo looks clear enough to read.</Notice>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={send}>
                  <ScanText className="size-4" aria-hidden /> Use this photo
                </Button>
                <Button variant="secondary" onClick={retake}>
                  <RotateCcw className="size-4" aria-hidden /> Retake
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {(step.kind === "uploading" || step.kind === "reading") && (
        <section className="rounded-lg border border-line bg-surface p-5" aria-live="polite">
          {step.kind === "uploading" ? (
            <>
              <p className="font-medium">Uploading photo… {step.progress}%</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={step.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${step.progress}%` }} />
              </div>
            </>
          ) : (
            <p className="flex items-center gap-2 font-medium">
              <Spinner label="Reading" /> Reading your handwriting. This can take up to a minute.
            </p>
          )}
        </section>
      )}

      {step.kind === "review" && (
        <section aria-labelledby="review-h" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
          <h2 id="review-h" className="font-semibold">Check what we read</h2>
          {step.result.status !== "ready" ? (
            <div className="mt-3 space-y-3">
              <Notice tone="warning" title={step.result.status === "unreadable" ? "We couldn't read this photo reliably" : "Reading the photo failed"}>
                {step.result.status === "unreadable"
                  ? "Rather than guess, we won't mark it. Please retake the photo closer, in better light, or type your answer."
                  : "Nothing was marked. Please try again, or type your answer."}
                {step.result.notes && <p className="mt-1">{step.result.notes}</p>}
              </Notice>
              <div className="flex gap-2">
                <Button onClick={retake}><RotateCcw className="size-4" aria-hidden /> Retake photo</Button>
                <Button variant="secondary" onClick={() => setStep({ kind: "typed" })}>Type instead</Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.preview} alt="Your answer photo" className="max-h-[60dvh] w-auto max-w-full rounded-md border border-line object-contain" />
              <div className="space-y-3">
                <p className="text-sm text-ink-2">
                  Fix anything we misread so it matches what you wrote. <strong>Don&apos;t improve your answer</strong>: the marking is of what&apos;s on the page.
                  Parts we weren&apos;t sure about show as <code className="rounded bg-warning-soft px-1">[?]</code>.
                </p>
                {step.result.segments.some((s) => s.uncertain) && (
                  <Notice tone="warning" title="Please check these parts">
                    <ul className="list-disc space-y-1 pl-5">
                      {step.result.segments.filter((s) => s.uncertain).map((s, i) => (
                        <li key={i}><span className="font-mono text-sm">{s.content}</span>{s.note ? ` (${s.note})` : ""}</li>
                      ))}
                    </ul>
                  </Notice>
                )}
                {step.result.notes && <p className="text-sm text-ink-3">{step.result.notes}</p>}
                <div>
                  <Label htmlFor="transcript">Your answer as we read it</Label>
                  <Textarea id="transcript" rows={10} value={text} onChange={(e) => setText(e.target.value)} className={cn("font-mono text-[0.95rem]")} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={pending || !text.trim()}
                    onClick={() => start(async () => { const r = await confirmAndEvaluateAction(step.responseId, step.result.transcriptId, text); if (r && !r.ok) setError(r.error); })}
                  >
                    {pending ? <><Spinner label="Marking" /> Marking against the rubric…</> : "This is right. Mark my answer"}
                  </Button>
                  <Button variant="ghost" onClick={retake} disabled={pending}>Retake photo</Button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {step.kind === "typed" && (
        <section aria-labelledby="typed-h" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
          <h2 id="typed-h" className="font-semibold">Type your answer</h2>
          <p className="mt-1 text-sm text-ink-2">Include your working and reasons, one step per line.</p>
          <Label htmlFor="typed" className="sr-only">Your answer</Label>
          <Textarea id="typed" rows={10} value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-3" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={pending || typed.trim().length < 2} onClick={() => start(async () => { const r = await evaluateTypedAction(questionId, null, typed); if (r && !r.ok) setError(r.error); })}>
              {pending ? <><Spinner label="Marking" /> Marking against the rubric…</> : "Mark my answer"}
            </Button>
            <Button variant="ghost" onClick={() => setStep({ kind: "choose" })} disabled={pending}>Back</Button>
          </div>
        </section>
      )}

      <p className="flex items-start gap-2 text-sm text-ink-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        AI marks are estimates against our approved rubric, not official CISCE marks. Your answer is sent to Microsoft Azure OpenAI for processing.
      </p>
    </div>
  );
}
