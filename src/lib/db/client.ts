import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "../env";
import type { Db } from "./types";

declare global {
  var __khojoDb: Db | undefined;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Add your Supabase connection string to .env.local.");
  }
}

/** Owner connection (bypasses RLS). Use `runAs()` for anything done on behalf of a user. */
export function getDb(): Db {
  if (globalThis.__khojoDb) return globalThis.__khojoDb;
  if (!env.DATABASE_URL) throw new DatabaseNotConfiguredError();
  // The Supabase transaction pooler does not support prepared statements.
  const client = postgres(env.DATABASE_URL, { prepare: false, max: 10, idle_timeout: 20 });
  const db = drizzle(client, { schema }) as unknown as Db;
  globalThis.__khojoDb = db;
  return db;
}
