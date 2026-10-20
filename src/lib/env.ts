import "server-only";
import { z } from "zod";

/**
 * Server environment. Every integration is optional at boot so the app can show an honest
 * "not configured" state instead of crashing; callers check `integrations` before use.
 */
const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: optional,

  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional,
  SUPABASE_SECRET_KEY: optional,
  DATABASE_URL: optional,

  AZURE_OPENAI_ENDPOINT: optional,
  AZURE_OPENAI_API_KEY: optional,
  AZURE_OPENAI_API_VERSION: optional,
  AZURE_OPENAI_DEPLOYMENT: optional,
  AZURE_OPENAI_VISION_DEPLOYMENT: optional,
  AZURE_OPENAI_REASONING_MODEL: optional,

  RESEND_API_KEY: optional,
  MAIL_FROM: optional,

  AI_DAILY_LIMIT_PER_USER: z.coerce.number().int().positive().default(30),
  CONSENT_PENDING_TTL_DAYS: z.coerce.number().int().positive().default(7),
  AI_RUN_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);

export const integrations = {
  supabase: Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_SECRET_KEY,
  ),
  database: Boolean(env.DATABASE_URL),
  ai: Boolean(env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_DEPLOYMENT),
  mail: Boolean(env.RESEND_API_KEY && env.MAIL_FROM),
} as const;

export function appUrl(): string {
  return (env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
