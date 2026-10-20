import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runAs } from "@/lib/db/rls";
import * as s from "@/lib/db/schema";
import { getViewer } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

/**
 * Serve a private upload. Row-level security decides visibility (the owner, or a reviewer for a
 * response under human review); the bytes are streamed with no-store headers, never via a
 * shareable URL.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const v = await getViewer();
  if (!v || v.needsProfile) return new NextResponse("Sign in required", { status: 401 });
  const db = getDb();
  const [u] = await runAs(db, v.id, (tx) => tx.select().from(s.uploads).where(eq(s.uploads.id, id)));
  if (!u || u.deletedAt) return new NextResponse("Not found", { status: 404 });
  if (u.userId !== v.id) {
    await audit(db, { actorId: v.id, action: "upload.viewed_by_staff", entityType: "upload", entityId: u.id });
  }
  const { data, error } = await supabaseAdmin().storage.from(u.bucket).download(u.storagePath);
  if (error || !data) return new NextResponse("File unavailable", { status: 404 });
  return new NextResponse(data.stream(), {
    headers: {
      "Content-Type": u.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
