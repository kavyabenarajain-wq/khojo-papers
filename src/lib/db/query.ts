import type { SQL } from "drizzle-orm";
import type { Executor } from "./types";

/** Raw SQL returning rows. postgres-js returns an array, PGlite returns { rows }. */
export async function rows<T>(db: Executor, query: SQL): Promise<T[]> {
  const res = (await db.execute(query)) as unknown;
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] }).rows ?? []) as T[];
}
