import type { AnswerFormat } from "./content/types";

export const SOURCE_LABELS = {
  official_pyq: { short: "Board paper", long: "Official previous-year question (CISCE board examination)" },
  official_specimen: { short: "Specimen paper", long: "Official CISCE specimen paper question" },
  original_practice: { short: "KHOJO original", long: "Original practice question written for KHOJO PAPERS. Not from a CISCE paper." },
} as const;

export const FORMAT_LABELS: Record<AnswerFormat, string> = {
  mcq: "Multiple choice",
  short_answer: "Short answer",
  long_answer: "Long answer",
  numerical: "Numerical",
  math_working: "Show working",
  structured: "Structured",
  diagram: "Diagram",
  map: "Map",
  passage: "Passage-based",
};

export const DIFFICULTY_LABELS = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

export const METHOD_LABELS = {
  deterministic: "Checked against the answer key",
  ai: "AI-estimated",
  teacher: "Teacher-marked",
  self: "Self-assessed",
} as const;

export function marksLabel(m: number | null | undefined) {
  if (m == null) return "";
  return `${m} mark${m === 1 ? "" : "s"}`;
}

export function formatMarks(n: number | null | undefined) {
  if (n == null) return "–";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
