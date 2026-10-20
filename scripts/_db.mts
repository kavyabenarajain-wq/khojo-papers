import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./_tasks.ts";
import type { Db } from "../src/lib/db/types";

config({ path: ".env.local" });

export function scriptDb(preferDirect = false): { db: Db; close: () => Promise<void> } {
  const url = (preferDirect && process.env.DIRECT_DATABASE_URL) || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and add your Supabase connection strings.");
    process.exit(1);
  }
  const client = postgres(url, { prepare: false, max: 1 });
  return { db: drizzle(client, { schema }) as unknown as Db, close: () => client.end() };
}
