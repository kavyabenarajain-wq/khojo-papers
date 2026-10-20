import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth/crypto";
import { integrations } from "@/lib/env";
import { runPurge } from "@/lib/purge";

/** Daily retention job. Call with `Authorization: Bearer $CRON_SECRET` (e.g. from Vercel Cron). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("Unauthorized", { status: 401 });
  if (!integrations.supabase || !integrations.database) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  return NextResponse.json(await runPurge());
}
