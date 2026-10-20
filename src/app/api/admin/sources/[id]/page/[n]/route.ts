import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runAs } from "@/lib/db/rls";
import * as s from "@/lib/db/schema";
import { getViewer } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";
import { BUCKETS, supabaseAdmin } from "@/lib/supabase/admin";
import { renderPdfPage } from "@/lib/ingest/pdf";

/** Render one page of a stored source PDF for side-by-side review. Staff only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/sources/[id]/page/[n]">) {
  const { id, n } = await ctx.params;
  const page = Number(n);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(page) || page < 1 || page > 200) return new NextResponse("Not found", { status: 404 });
  const v = await getViewer();
  if (!v || !isStaff(v)) return new NextResponse("Forbidden", { status: 403 });
  const [doc] = await runAs(getDb(), v.id, (tx) => tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.id, id)));
  if (!doc?.storagePath) return new NextResponse("No stored file", { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from(BUCKETS.sources).download(doc.storagePath);
  if (error || !data) return new NextResponse("File unavailable", { status: 404 });
  const dataUrl = await renderPdfPage(Buffer.from(await data.arrayBuffer()), page, 1100);
  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  return new NextResponse(png, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
}
