import type { z } from "zod";
import * as s from "../db/schema";
import type { Executor } from "../db/types";

export type AiPurpose = "recognize" | "evaluate" | "generate" | "ocr" | "benchmark";
export type AiContent = { type: "text"; text: string } | { type: "image"; dataUrl: string };

export type ProviderResponse = {
  /** Raw JSON text returned by the model (null on refusal). */
  content: string | null;
  refusal: string | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

/** A model API that can return JSON matching a schema. Implemented by the Azure OpenAI adapter. */
export interface AiProvider {
  readonly name: string;
  structured(input: {
    system: string;
    content: AiContent[];
    schema: z.ZodType;
    schemaName: string;
    vision: boolean;
    maxOutputTokens: number;
  }): Promise<ProviderResponse>;
}

export type StructuredRequest<T> = {
  purpose: AiPurpose;
  promptVersion: string;
  system: string;
  content: AiContent[];
  schema: z.ZodType<T>;
  schemaName: string;
  userId: string | null;
  vision?: boolean;
  maxOutputTokens?: number;
  /** Non-sensitive context saved with the run log (ids, versions). Never images. */
  meta?: Record<string, unknown>;
  /**
   * Extra checks on parsed output. Return problems to trigger one corrective retry; the second
   * failure is returned as invalid_output.
   */
  validate?: (data: T) => string[];
};

export type StructuredResult<T> =
  | { ok: true; data: T; runId: string; model: string; attempts: number }
  | { ok: false; kind: "refused" | "invalid_output" | "error"; error: string; runId: string | null; attempts: number; problems?: string[] };

/**
 * Calls the provider, validates the output against the schema and any extra checks, retries
 * once with the problems explained, and logs every call to ai_runs. Never returns unvalidated data.
 */
export async function callStructured<T>(deps: { provider: AiProvider; db: Executor }, req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  let system = req.system;
  let lastRunId: string | null = null;
  let lastProblems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    let res: ProviderResponse | null = null;
    let status: "ok" | "invalid_output" | "error" | "refused" = "ok";
    let error: string | null = null;
    let parsed: T | null = null;
    let output: unknown = null;
    try {
      res = await deps.provider.structured({
        system,
        content: req.content,
        schema: req.schema,
        schemaName: req.schemaName,
        vision: Boolean(req.vision),
        maxOutputTokens: req.maxOutputTokens ?? 4000,
      });
      if (res.refusal) {
        status = "refused";
        error = res.refusal;
      } else {
        try {
          output = JSON.parse(res.content ?? "");
        } catch {
          output = res.content;
        }
        const check = req.schema.safeParse(output);
        if (!check.success) {
          status = "invalid_output";
          lastProblems = check.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
          error = `Schema validation failed: ${lastProblems.join("; ")}`;
        } else {
          const problems = req.validate?.(check.data) ?? [];
          if (problems.length) {
            status = "invalid_output";
            lastProblems = problems;
            error = `Output failed checks: ${problems.join("; ")}`;
          } else parsed = check.data;
        }
      }
    } catch (e) {
      status = "error";
      error = e instanceof Error ? e.message.slice(0, 500) : "Unknown provider error";
    }
    const [run] = await deps.db
      .insert(s.aiRuns)
      .values({
        purpose: req.purpose,
        provider: deps.provider.name,
        model: res?.model ?? "unknown",
        promptVersion: req.promptVersion,
        status,
        latencyMs: Date.now() - started,
        inputTokens: res?.inputTokens ?? null,
        outputTokens: res?.outputTokens ?? null,
        requestMeta: { ...(req.meta ?? {}), attempt },
        output: output as never,
        error,
        userId: req.userId,
      })
      .returning({ id: s.aiRuns.id });
    lastRunId = run.id;
    if (status === "ok" && parsed !== null) return { ok: true, data: parsed, runId: run.id, model: res!.model, attempts: attempt };
    if (status === "refused") return { ok: false, kind: "refused", error: error ?? "The model declined", runId: run.id, attempts: attempt };
    if (status === "invalid_output") {
      system = `${req.system}\n\nYOUR PREVIOUS RESPONSE WAS REJECTED for these reasons. Fix them and respond again:\n- ${lastProblems.join("\n- ")}`;
    }
    if (attempt === 2) {
      return status === "invalid_output"
        ? { ok: false, kind: "invalid_output", error: error ?? "Invalid output", runId: lastRunId, attempts: attempt, problems: lastProblems }
        : { ok: false, kind: "error", error: error ?? "Provider error", runId: lastRunId, attempts: attempt };
    }
  }
  return { ok: false, kind: "error", error: "unreachable", runId: lastRunId, attempts: 2 };
}
