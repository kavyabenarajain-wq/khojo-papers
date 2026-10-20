import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { integrations } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/request";

const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

/**
 * Landing point for Supabase email links. Supports the token-hash links recommended for SSR
 * (works on any device) and PKCE `code` links (same browser only).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"), "/");
  const fail = NextResponse.redirect(new URL(`/login?error=link`, url.origin));
  if (!integrations.supabase) return fail;
  const supabase = await createSupabaseServerClient();

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  if (tokenHash && type && TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail;
    return NextResponse.redirect(new URL(type === "recovery" ? "/account/update-password" : next, url.origin));
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail;
    return NextResponse.redirect(new URL(next, url.origin));
  }
  return fail;
}
