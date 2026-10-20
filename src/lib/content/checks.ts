import { latexError, toPlainText, validateRichText } from "./richtext";
import type { AnswerKey, QuestionContent, Rubric, Solution } from "./types";
import { validateDiagram } from "../../components/diagram/Diagram";

export type CheckIssue = { level: "error" | "warning"; field: string; message: string };

type Checkable = {
  answerFormat: string;
  marks: number;
  content: QuestionContent;
  answerKey: AnswerKey | null;
  hints: string[];
  solution: Solution;
  rubric: Rubric | null;
};

/**
 * Automated checks run before a question can be approved: maths renders, diagrams resolve,
 * marks add up, answer keys match the options. These do not check that the maths is correct;
 * that is what academic review is for.
 */
export function checkQuestion(q: Checkable): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const err = (field: string, message: string) => issues.push({ level: "error", field, message });
  const warn = (field: string, message: string) => issues.push({ level: "warning", field, message });
  const rich = (field: string, text: string | undefined) => {
    if (!text) return;
    for (const i of validateRichText(text)) err(field, i.excerpt ? `${i.message} — ${i.excerpt}` : i.message);
  };
  const tex = (field: string, expr: string | undefined) => {
    if (!expr) return;
    const e = latexError(expr, true);
    if (e) err(field, `${e} — ${expr.slice(0, 80)}`);
  };

  const c = q.content;
  rich("stem", c.stem);
  rich("passage", c.passage);
  c.options?.forEach((o, i) => rich(`options[${i}]`, o.text));
  c.table?.rows.forEach((row, r) => row.forEach((cell, k) => rich(`table[${r}][${k}]`, cell)));
  q.hints.forEach((h, i) => rich(`hints[${i}]`, h));

  const diagramIds = new Set<string>();
  for (const d of c.diagrams ?? []) {
    if (diagramIds.has(d.id)) err(`diagram ${d.id}`, "Duplicate diagram id");
    diagramIds.add(d.id);
    for (const m of validateDiagram(d)) err(`diagram ${d.id}`, m);
  }

  // Format-specific structure
  if (q.answerFormat === "mcq") {
    if (!c.options?.length) err("options", "Multiple-choice questions need options");
    if (q.answerKey?.type !== "mcq") err("answerKey", "Multiple-choice questions need an mcq answer key");
    else if (!c.options?.some((o) => o.key === (q.answerKey as { correct: string }).correct)) err("answerKey", "Correct option is not one of the options");
  }
  if (q.answerFormat === "numerical" && q.answerKey?.type !== "numeric") err("answerKey", "Numerical questions need a numeric answer key");
  if (q.answerFormat === "structured") {
    if (!c.parts?.length) err("parts", "Structured questions need parts");
    const sum = (c.parts ?? []).reduce((a, p) => a + p.marks, 0);
    if (sum !== q.marks) err("parts", `Part marks add up to ${sum}, but the question is worth ${q.marks}`);
    const keys = new Set<string>();
    for (const p of c.parts ?? []) {
      if (keys.has(p.key)) err(`part ${p.key}`, "Duplicate part key");
      keys.add(p.key);
      rich(`part ${p.key}`, p.prompt);
      p.options?.forEach((o, i) => rich(`part ${p.key} option ${i}`, o.text));
      for (const id of p.diagramIds ?? []) if (!diagramIds.has(id)) err(`part ${p.key}`, `Unknown diagram ${id}`);
      if (p.format === "mcq" && !p.options?.length) err(`part ${p.key}`, "MCQ part needs options");
    }
    if (q.answerKey) {
      if (q.answerKey.type !== "parts") err("answerKey", "Structured questions use a parts answer key");
      else
        for (const [k, key] of Object.entries(q.answerKey.parts)) {
          const part = c.parts?.find((p) => p.key === k);
          if (!part) err("answerKey", `Key for unknown part ${k}`);
          else if (key.type === "mcq" && !part.options?.some((o) => o.key === key.correct)) err("answerKey", `Part ${k}: correct option not among options`);
        }
    }
  } else if (c.parts?.length) {
    err("parts", "Only structured questions may have parts");
  }

  // Solution
  const s = q.solution;
  rich("solution.modelAnswer", s.modelAnswer);
  rich("solution.finalAnswer", s.finalAnswer);
  s.commonMistakes.forEach((m, i) => rich(`solution.commonMistakes[${i}]`, m));
  s.alternativeMethods.forEach((m, i) => rich(`solution.alternativeMethods[${i}]`, m.description));
  s.steps.forEach((st, i) => {
    const f = `solution.steps[${i}]`;
    if (st.n !== i + 1) err(f, `Step numbers must run 1, 2, 3… (found ${st.n})`);
    rich(`${f}.explanation`, st.explanation);
    rich(`${f}.reason`, st.reason);
    rich(`${f}.rule`, st.rule);
    tex(`${f}.expression`, st.expression);
    tex(`${f}.result`, st.result);
    if (st.diagramId && !diagramIds.has(st.diagramId)) err(f, `Unknown diagram ${st.diagramId}`);
    if (st.partKey && !c.parts?.some((p) => p.key === st.partKey)) err(f, `Unknown part ${st.partKey}`);
  });
  if (!s.steps.some((st) => st.isFinal)) warn("solution.steps", "No step is marked as the final step");

  // Rubric
  if (!q.rubric) {
    warn("rubric", "No rubric: the AI Examiner will not offer this question");
  } else {
    const total = q.rubric.criteria.reduce((a, r) => a + r.marks, 0);
    if (total !== q.marks) err("rubric", `Criteria add up to ${total}, but the question is worth ${q.marks}`);
    const keys = new Set<string>();
    for (const cr of q.rubric.criteria) {
      if (keys.has(cr.key)) err("rubric", `Duplicate criterion key ${cr.key}`);
      keys.add(cr.key);
      if (cr.partKey && !c.parts?.some((p) => p.key === cr.partKey)) err("rubric", `Criterion ${cr.key} refers to unknown part ${cr.partKey}`);
    }
    if (c.parts?.length) {
      for (const p of c.parts) {
        const partTotal = q.rubric.criteria.filter((cr) => cr.partKey === p.key).reduce((a, r) => a + r.marks, 0);
        if (partTotal !== p.marks) err("rubric", `Part ${p.key}: criteria add up to ${partTotal}, part is worth ${p.marks}`);
      }
    }
  }
  return issues;
}

/** Word-shingle Jaccard similarity for near-duplicate detection. */
export function similarity(a: string, b: string): number {
  const sh = (t: string) => {
    const w = toPlainText(t).toLowerCase().replace(/[^a-z0-9₹ ]/g, " ").split(/\s+/).filter(Boolean);
    const set = new Set<string>();
    for (let i = 0; i < w.length - 2; i++) set.add(w.slice(i, i + 3).join(" "));
    if (!set.size && w.length) set.add(w.join(" "));
    return set;
  };
  const A = sh(a);
  const B = sh(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export const DUPLICATE_THRESHOLD = 0.6;

export function questionSearchText(content: QuestionContent): string {
  return [content.stem, content.passage, ...(content.options ?? []).map((o) => o.text), ...(content.parts ?? []).map((p) => p.prompt)]
    .filter(Boolean)
    .map((t) => toPlainText(t))
    .join(" ");
}
