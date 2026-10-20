import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { randomUUID } from "node:crypto";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { SUPABASE_STUB_SQL } from "@/lib/db/supabase-stub";

export type TestDb = { db: Db; pg: PGlite; close: () => Promise<void> };

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB_SQL);
  const db = drizzle(pg, { schema }) as unknown as Db;
  await migrate(drizzle(pg), { migrationsFolder: "./supabase/migrations" });
  return { db, pg, close: () => pg.close() };
}

export async function createUser(
  t: TestDb,
  opts: { roles?: string[]; ageBracket?: "under_18" | "adult"; consent?: "not_required" | "pending" | "granted" | "withdrawn" } = {},
): Promise<string> {
  const id = randomUUID();
  await t.pg.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `${id.slice(0, 8)}@example.test`]);
  await t.db.insert(schema.profiles).values({
    id,
    roles: opts.roles ?? ["student"],
    ageBracket: opts.ageBracket ?? "adult",
    consentStatus: opts.consent ?? "not_required",
  });
  return id;
}

/** Drizzle wraps driver errors; match against the whole cause chain. */
export async function expectDbError(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await p;
  } catch (e) {
    const messages: string[] = [];
    let cur: unknown = e;
    while (cur instanceof Error) {
      messages.push(cur.message);
      cur = (cur as Error & { cause?: unknown }).cause;
    }
    const joined = messages.join(" | ");
    if (!pattern.test(joined)) throw new Error(`Expected error matching ${pattern}, got: ${joined}`);
    return;
  }
  throw new Error(`Expected error matching ${pattern}, but the operation succeeded`);
}
