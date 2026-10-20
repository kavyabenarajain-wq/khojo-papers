import { readFileSync } from "node:fs";
import type { AiProvider, ProviderResponse } from "@/lib/ai/provider";

export const fixture = (name: string): unknown => JSON.parse(readFileSync(`tests/fixtures/ai/${name}.json`, "utf8"));

type Step = { json?: unknown; refusal?: string; throws?: string };

/** Replays scripted responses in order and records what it was asked. */
export class FakeProvider implements AiProvider {
  readonly name = "fake";
  readonly calls: { system: string; text: string; images: number }[] = [];
  constructor(private steps: Step[]) {}
  async structured(input: Parameters<AiProvider["structured"]>[0]): Promise<ProviderResponse> {
    this.calls.push({
      system: input.system,
      text: input.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n"),
      images: input.content.filter((c) => c.type === "image").length,
    });
    const step = this.steps.shift();
    if (!step) throw new Error("FakeProvider: no scripted response left");
    if (step.throws) throw new Error(step.throws);
    return { content: step.refusal ? null : JSON.stringify(step.json), refusal: step.refusal ?? null, model: "fake-model", inputTokens: 10, outputTokens: 20 };
  }
}
