import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, integrations } from "../env";

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Supabase is not configured. Add the Supabase URL and keys to .env.local.");
  }
}

/** Per-request Supabase client bound to the user's auth cookies. */
export async function createSupabaseServerClient() {
  if (!integrations.supabase) throw new SupabaseNotConfiguredError();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes them.
        }
      },
    },
  });
}
