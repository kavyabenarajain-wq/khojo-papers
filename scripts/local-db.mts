/*
 * THROWAWAY LOCAL DATABASE for development and automated browser tests when no Supabase project
 * is configured. Runs real Postgres (PGlite) on 127.0.0.1:54329 with the production migrations.
 *
 *   npm run local-db                      # migrations + seed (questions stay unpublished)
 *   npm run local-db -- --fake-review     # ALSO approves and publishes everything as a fake
 *                                         # local reviewer, purely so the student UI can be tested.
 *
 * Point the app at it with DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres.
 * Sign-in still needs Supabase. Never use --fake-review against real data: it records reviews
 * that no teacher performed.
 */
import { existsSync, mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fakeReviewEverything, schema } from "./_tasks.ts";
import type { Db } from "../src/lib/db/types.ts";
import { SUPABASE_STUB_SQL } from "../src/lib/db/supabase-stub.ts";
import { loadSeedContent } from "../src/lib/content/seed-loader.ts";

const dir = ".data/local-pg";
const fresh = !existsSync(dir);
mkdirSync(".data", { recursive: true });
const pg = new PGlite(dir);
if (fresh) await pg.exec(SUPABASE_STUB_SQL);
const db = drizzle(pg, { schema }) as unknown as Db;
await migrate(drizzle(pg), { migrationsFolder: "./supabase/migrations" });
const report = await loadSeedContent(db);
console.log(`Seed: ${report.questionsAdded} questions added, ${report.questionsSkipped} already present, ${report.papersAdded} practice sets.`);

if (process.argv.includes("--fake-review")) {
  console.warn("\n⚠  --fake-review: approving and publishing all content as a FAKE local reviewer. Local testing only.\n");
  await fakeReviewEverything(db, async (id) => {
    await pg.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id.slice(0, 8)}@localhost`]);
  });
  console.log("Published everything in the LOCAL database.");
}

const server = new PGLiteSocketServer({ db: pg, port: 54329, host: "127.0.0.1", maxConnections: 20 } as ConstructorParameters<typeof PGLiteSocketServer>[0]);
await server.start();
console.log("Local Postgres ready on postgresql://postgres@127.0.0.1:54329/postgres (Ctrl+C to stop)");
process.on("SIGINT", async () => {
  await server.stop();
  await pg.close();
  process.exit(0);
});
