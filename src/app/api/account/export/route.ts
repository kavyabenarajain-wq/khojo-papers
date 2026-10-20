import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { runAs } from "@/lib/db/rls";
import { getViewer } from "@/lib/auth/session";
import { exportUserData } from "@/lib/dal/account";
import { rateLimit } from "@/lib/rate-limit";

/** Download everything we hold about the signed-in user, as JSON. */
export async function GET() {
  const v = await getViewer();
  if (!v || v.needsProfile) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const limit = await rateLimit(getDb(), `export:${v.id}`, 10, 3600);
  if (!limit.ok) return NextResponse.json({ error: "Too many downloads; try again later." }, { status: 429 });
  const data = await runAs(getDb(), v.id, (tx) => exportUserData(tx, v.id));
  return new NextResponse(JSON.stringify({ email: v.email, ...data }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="khojo-papers-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
