/* Validates every seed question file. Usage: npm run check-content [-- path/to/file.json] */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SeedFileSchema, type SeedQuestion } from "../src/lib/content/seed-schema";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { checkQuestion, similarity, DUPLICATE_THRESHOLD, questionSearchText } from "../src/lib/content/checks";
import { Diagram } from "../src/components/diagram/Diagram";

const dir = path.resolve("content/seed/maths");
const syllabus = JSON.parse(readFileSync("content/seed/syllabus.json", "utf8"));
const chapters = new Map<string, Set<string>>();
for (const u of syllabus.units) for (const ch of u.chapters) chapters.set(ch.slug, new Set(ch.topics.map((t: { slug: string }) => t.slug)));

const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
let errors = 0;
let warnings = 0;
const all: Array<SeedQuestion & { file: string }> = [];
const codes = new Map<string, string>();

for (const file of files) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const parsed = SeedFileSchema.safeParse(raw);
  const name = path.basename(file);
  if (!parsed.success) {
    errors++;
    console.log(`\n✗ ${name}: schema errors`);
    for (const i of parsed.error.issues.slice(0, 30)) console.log(`   ${i.path.join(".")}: ${i.message}`);
    continue;
  }
  const topics = chapters.get(parsed.data.chapter);
  if (!topics) {
    errors++;
    console.log(`\n✗ ${name}: unknown chapter "${parsed.data.chapter}"`);
  }
  for (const q of parsed.data.questions) {
    const issues = checkQuestion({ ...q, rubric: q.rubric });
    // Render every diagram at every whiteboard step, as students will see it.
    for (const d of q.content.diagrams ?? []) {
      for (const step of [0, ...q.solution.steps.map((st) => st.n)]) {
        try {
          renderToStaticMarkup(createElement(Diagram, { diagram: d, visibleStep: step, animateStep: step }));
        } catch (e) {
          issues.push({ level: "error", field: `diagram ${d.id}`, message: `Does not render at step ${step}: ${(e as Error).message}` });
        }
      }
    }
    for (const t of q.topics) if (topics && !topics.has(t)) issues.push({ level: "error", field: "topics", message: `Unknown topic ${t}` });
    if (codes.has(q.code)) issues.push({ level: "error", field: "code", message: `Duplicate code (also in ${codes.get(q.code)})` });
    codes.set(q.code, name);
    if (issues.length) {
      console.log(`\n${issues.some((i) => i.level === "error") ? "✗" : "!"} ${name} ${q.code}`);
      for (const i of issues) {
        console.log(`   [${i.level}] ${i.field}: ${i.message}`);
        if (i.level === "error") errors++;
        else warnings++;
      }
    }
    all.push({ ...q, file: name });
  }
}

for (let i = 0; i < all.length; i++)
  for (let j = i + 1; j < all.length; j++) {
    const sim = similarity(questionSearchText(all[i].content), questionSearchText(all[j].content));
    if (sim >= DUPLICATE_THRESHOLD) {
      warnings++;
      console.log(`\n! Possible duplicate: ${all[i].code} ~ ${all[j].code} (similarity ${sim.toFixed(2)})`);
    }
  }

const byFormat = all.reduce<Record<string, number>>((a, q) => ((a[q.answerFormat] = (a[q.answerFormat] ?? 0) + 1), a), {});
console.log(`\n${all.length} questions checked · ${errors} errors · ${warnings} warnings`);
console.log(`Formats: ${Object.entries(byFormat).map(([k, v]) => `${k} ${v}`).join(", ")}`);
process.exit(errors ? 1 : 0);
