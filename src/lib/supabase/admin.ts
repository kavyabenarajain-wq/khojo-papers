import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, integrations } from "../env";
import { SupabaseNotConfiguredError } from "./server";

let admin: SupabaseClient | undefined;

/** Service-role client for Storage and Auth admin calls. Never import from client code. */
export function supabaseAdmin(): SupabaseClient {
  if (!integrations.supabase) throw new SupabaseNotConfiguredError();
  admin ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export const BUCKETS = {
  answers: "answer-images",
  sources: "source-documents",
} as const;
