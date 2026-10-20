/* Loads the syllabus, original practice questions (as in-review drafts) and practice sets. */
import { scriptDb } from "./_db.mts";
import { loadSeedContent } from "../src/lib/content/seed-loader.ts";

const { db, close } = scriptDb();
const report = await loadSeedContent(db);
console.log(
  `Seeded ${report.subject}: ${report.topics} topics, ${report.questionsAdded} questions added (${report.questionsSkipped} already present), ${report.papersAdded} practice sets.`,
);
console.log("All seeded questions are unpublished and waiting in the review queue at /admin/review.");
await close();
