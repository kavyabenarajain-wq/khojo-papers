import "server-only";
import { headers } from "next/headers";
import { sha256 } from "./crypto";
import { env } from "../env";

/** Client IP, hashed with a server secret so raw addresses are never stored. */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return sha256(`${ip}|${env.SUPABASE_SECRET_KEY ?? "dev-salt"}`).slice(0, 32);
}

/**
 * CSRF defence for route handlers (server actions already check Origin). Requires the request
 * to come from this site: Sec-Fetch-Site same-origin, or an Origin header matching the host.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Only allow redirects to paths on this site. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
