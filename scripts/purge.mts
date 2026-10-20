/* Retention jobs: expired consent requests, withdrawn accounts, old AI logs, orphaned uploads. */
import { config } from "dotenv";
config({ path: ".env.local" });
const { runPurge } = await import("../src/lib/purge.ts");
console.log(JSON.stringify(await runPurge(), null, 2));
process.exit(0);
