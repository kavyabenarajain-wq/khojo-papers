import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against a throwaway local Postgres (PGlite) whose seeded content is
 * fake-reviewed purely so the student UI can be exercised. Sign-in flows need a real Supabase
 * project and are covered by integration tests instead.
 */
const PORT = 3100;
const DB = "postgresql://postgres@127.0.0.1:54329/postgres";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: [
    { command: "npm run local-db -- --fake-review", port: 54329, reuseExistingServer: true, timeout: 120_000 },
    { command: `DATABASE_URL=${DB} npx next dev -p ${PORT}`, url: `http://localhost:${PORT}/privacy`, reuseExistingServer: true, timeout: 180_000 },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
