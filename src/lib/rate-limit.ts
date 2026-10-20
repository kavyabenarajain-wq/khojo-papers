import "server-only";
import { and, lt, sql } from "drizzle-orm";
import { rateLimits } from "./db/schema";
import type { Executor } from "./db/types";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Fixed-window counter in Postgres. Works across server instances without extra infrastructure.
 * The insert-or-increment is a single atomic statement.
 */
export async function rateLimit(db: Executor, key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const start = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: start, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  if (Math.random() < 0.02) {
    await db.delete(rateLimits).where(and(lt(rateLimits.windowStart, new Date(Date.now() - 2 * 86400_000))));
  }
  const count = row?.count ?? limit + 1;
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.ceil((start.getTime() + windowMs - Date.now()) / 1000),
  };
}
