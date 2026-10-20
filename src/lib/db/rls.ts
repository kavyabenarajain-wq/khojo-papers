import { sql } from "drizzle-orm";
import type { Db, Tx } from "./types";

/**
 * Run `fn` in a transaction as the Supabase `authenticated` role for `userId` (or `anon` when
 * null), so Postgres row-level security applies exactly as it would to a direct client.
 * Everything a student or staff member does goes through here; only system jobs use the
 * owner connection directly.
 */
export async function runAs<T>(db: Db, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql.raw(userId ? "set local role authenticated" : "set local role anon"));
    return fn(tx);
  });
}
