import "server-only";
import { AzureOpenAI } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { env, integrations } from "../env";
import type { AiProvider, ProviderResponse } from "./provider";

let client: AzureOpenAI | undefined;

function azure(): AzureOpenAI {
  client ??= new AzureOpenAI({
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiKey: env.AZURE_OPENAI_API_KEY,
    apiVersion: env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
    timeout: 90_000,
    maxRetries: 2,
  });
  return client;
}

/** Azure OpenAI adapter: Chat Completions with strict JSON-schema structured outputs. */
export const azureProvider: AiProvider = {
  name: "azure-openai",
  async structured({ system, content, schema, schemaName, vision, maxOutputTokens }): Promise<ProviderResponse> {
    if (!integrations.ai) throw new Error("Azure OpenAI is not configured");
    const deployment = (vision ? env.AZURE_OPENAI_VISION_DEPLOYMENT : undefined) ?? env.AZURE_OPENAI_DEPLOYMENT!;
    const reasoning = env.AZURE_OPENAI_REASONING_MODEL === "true";
    const completion = await azure().chat.completions.create({
      model: deployment,
      messages: [
        { role: reasoning ? "developer" : "system", content: system },
        {
          role: "user",
          content: content.map((c) =>
            c.type === "text" ? { type: "text" as const, text: c.text } : { type: "image_url" as const, image_url: { url: c.dataUrl, detail: "high" as const } },
          ),
        },
      ],
      response_format: zodResponseFormat(schema as never, schemaName),
      max_completion_tokens: maxOutputTokens,
      ...(reasoning ? {} : { temperature: 0 }),
    });
    const msg = completion.choices[0]?.message;
    return {
      content: msg?.content ?? null,
      refusal: msg?.refusal ?? (completion.choices[0]?.finish_reason === "content_filter" ? "Blocked by the content filter" : null),
      model: completion.model ?? deployment,
      inputTokens: completion.usage?.prompt_tokens ?? null,
      outputTokens: completion.usage?.completion_tokens ?? null,
    };
  },
};

export function aiStatus(): { available: boolean; reason?: string } {
  return integrations.ai ? { available: true } : { available: false, reason: "The AI Examiner hasn't been connected to an AI service on this server." };
}
