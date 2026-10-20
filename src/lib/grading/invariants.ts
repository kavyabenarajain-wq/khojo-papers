import type { Marking } from "../ai/schemas";

export type RubricForCheck = { key: string; marks: number }[];

export type InvariantReport = {
  errors: string[];
  /** Criterion keys whose evidence quote could not be found in the student's answer. */
  unsupportedEvidence: string[];
  total: number;
  maximum: number;
  anyUncertain: boolean;
};

export function normalise(t: string): string {
  return t
    .toLowerCase()
    .replace(/\\[a-z]+/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/[×]/g, "x")
    .replace(/[^a-z0-9.=+\-/°₹%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is a quoted piece of evidence actually in the student's answer? Exact (normalised) substring,
 * or most of its tokens present, which tolerates spacing and notation differences.
 */
export function evidenceFound(evidence: string, transcript: string): boolean {
  const e = normalise(evidence);
  const t = normalise(transcript);
  if (!e) return false;
  if (t.includes(e)) return true;
  if (t.replace(/ /g, "").includes(e.replace(/ /g, ""))) return true;
  const tokens = e.split(" ").filter((x) => x.length > 0);
  if (!tokens.length) return false;
  const tset = new Set(t.split(" "));
  const hit = tokens.filter((x) => tset.has(x)).length;
  return hit / tokens.length >= 0.75;
}

/** Text addressed to the marker rather than mathematics (prompt-injection attempts). */
const INSTRUCTION_LIKE = /\b(ignore|disregard|override|forget)\b.{0,40}\b(rubric|instruction|rules?|scheme|above)\b|\b(give|award|grant)\b.{0,20}\b(full|maximum|all)\s+marks\b|\bfull marks\b|\byou (are|must|should)\b/i;

export function looksLikeInstruction(text: string): boolean {
  return INSTRUCTION_LIKE.test(text);
}

/**
 * Checks AI marking output against the rubric before it is shown to anyone:
 * every criterion scored exactly once, marks within range and in half-mark steps, totals
 * consistent, evidence for awarded marks found in the answer, and no marks when the model says
 * it cannot evaluate.
 */
export function checkMarking(m: Marking, rubric: RubricForCheck, transcript: string): InvariantReport {
  const errors: string[] = [];
  const unsupportedEvidence: string[] = [];
  const maximum = rubric.reduce((a, c) => a + c.marks, 0);
  const seen = new Map<string, number>();
  for (const c of m.criteria) seen.set(c.key, (seen.get(c.key) ?? 0) + 1);
  for (const r of rubric) {
    const n = seen.get(r.key) ?? 0;
    if (n === 0) errors.push(`Criterion "${r.key}" was not scored.`);
    if (n > 1) errors.push(`Criterion "${r.key}" was scored ${n} times.`);
  }
  for (const k of seen.keys()) if (!rubric.some((r) => r.key === k)) errors.push(`Unknown criterion "${k}" (only rubric criteria may be scored).`);

  let total = 0;
  for (const c of m.criteria) {
    const r = rubric.find((x) => x.key === c.key);
    if (!r) continue;
    if (!Number.isFinite(c.marksAwarded) || c.marksAwarded < 0 || c.marksAwarded > r.marks) {
      errors.push(`Criterion "${c.key}": ${c.marksAwarded} is outside 0–${r.marks}.`);
      continue;
    }
    if (Math.round(c.marksAwarded * 2) !== c.marksAwarded * 2) errors.push(`Criterion "${c.key}": marks must be in steps of 0.5.`);
    if (c.marksAwarded > 0) {
      if (!c.evidence?.trim()) errors.push(`Criterion "${c.key}": marks awarded without quoting evidence from the answer.`);
      else if (!evidenceFound(c.evidence, transcript)) unsupportedEvidence.push(c.key);
      else if (looksLikeInstruction(c.evidence)) errors.push(`Criterion "${c.key}": the quoted evidence is an instruction to the marker, not mathematical work, so it cannot earn marks.`);
    }
    total += c.marksAwarded;
  }
  if (unsupportedEvidence.length) errors.push(`Evidence for ${unsupportedEvidence.map((k) => `"${k}"`).join(", ")} does not appear in the student's answer; quote it exactly.`);
  if (m.status === "cannot_evaluate" && total > 0) errors.push("Status is cannot_evaluate but marks were awarded.");
  if (total > maximum) errors.push(`Total ${total} exceeds the maximum ${maximum}.`);
  return { errors, unsupportedEvidence, total, maximum, anyUncertain: m.criteria.some((c) => c.uncertain) };
}
