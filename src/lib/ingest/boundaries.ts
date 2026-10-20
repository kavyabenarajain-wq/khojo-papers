/**
 * Heuristic question-boundary detection on extracted page text. Produces candidates for human
 * review, never questions: every candidate is checked against the original page by an editor.
 */
export type Candidate = {
  pageNumber: number;
  questionNumber: string | null;
  rawText: string;
  detectedMarks: number | null;
  confidence: number;
  flags: string[];
};

// "Question 3", "Q.3", "Q 3", or a bare "3." / "3)" at the start of a line (only 1–2 digits).
const START = /^\s*(?:question\s*(\d{1,2})\b[.:)]?|q\.?\s*(\d{1,2})\b[.:)]?|(\d{1,2})[.)]\s+(?=\S))/i;
const MARKS = /\[\s*(\d{1,2})\s*(?:marks?)?\s*\]|\(\s*(\d{1,2})\s*marks?\s*\)/gi;
const SECTION = /^\s*section\s+[a-z]\b/i;

export function detectCandidates(pages: { pageNumber: number; text: string }[]): Candidate[] {
  const out: Candidate[] = [];
  let current: { page: number; number: string | null; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const raw = current.lines.join("\n").trim();
    if (raw.length >= 15) out.push(analyse(current.page, current.number, raw));
    current = null;
  };

  for (const p of pages) {
    for (const line of p.text.split(/\r?\n/)) {
      if (SECTION.test(line)) {
        flush();
        continue;
      }
      const m = line.match(START);
      if (m) {
        flush();
        current = { page: p.pageNumber, number: m[1] ?? m[2] ?? m[3] ?? null, lines: [line.replace(START, "").trim()] };
      } else if (current) {
        current.lines.push(line);
      }
    }
  }
  flush();
  return out;
}

function analyse(page: number, number: string | null, raw: string): Candidate {
  const marks = [...raw.matchAll(MARKS)].map((m) => Number(m[1] ?? m[2]));
  const total = marks.length ? marks.reduce((a, b) => a + b, 0) : null;
  const flags: string[] = [];
  if (/\b(figure|diagram|graph|shown|adjoining|given below)\b/i.test(raw)) flags.push("refers_to_figure");
  if (/\btable\b|\|\s*\w+\s*\|/i.test(raw)) flags.push("has_table");
  if (/[√∠πθ≤≥≠±×÷∑∫]|\^|\bsin\b|\bcos\b|\btan\b/.test(raw)) flags.push("has_maths_symbols");
  if (/\(\s*(?:a|b|c|i|ii|iii)\s*\)/i.test(raw)) flags.push("has_subparts");
  if (/�|□/.test(raw)) flags.push("garbled_characters");
  if (marks.length > 1) flags.push("multiple_mark_allocations");
  let confidence = 0.4;
  if (number) confidence += 0.2;
  if (total !== null) confidence += 0.25;
  if (raw.length > 60) confidence += 0.1;
  if (flags.includes("garbled_characters")) confidence -= 0.3;
  if (flags.includes("refers_to_figure")) confidence -= 0.1;
  return { pageNumber: page, questionNumber: number, rawText: raw.slice(0, 6000), detectedMarks: total, confidence: Math.max(0.05, Math.min(0.95, Number(confidence.toFixed(2)))), flags };
}
