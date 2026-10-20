/* Applies SQL migrations in supabase/migrations to the database (use the direct connection). */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local" });
const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DIRECT_DATABASE_URL (or DATABASE_URL) in .env.local first.");
  process.exit(1);
}
const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "./supabase/migrations" });
console.log("Migrations applied.");
await client.end();
