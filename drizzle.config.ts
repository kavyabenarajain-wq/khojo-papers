import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./supabase/migrations",
  schemaFilter: ["app"],
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
