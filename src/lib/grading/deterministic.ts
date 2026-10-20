import type { Answer, AnswerFormat, AnswerKey, QuestionContent, SingleAnswer, SingleKey } from "../content/types";

/**
 * Objective marking without AI. Used only where the verified answer key fully determines the
 * mark: multiple choice, and numerical questions that ask only for a value. Questions whose
 * marks depend on working (math_working, long answers, …) are marked against the rubric.
 */

export type PartResult = {
  partKey: string | null;
  correct: boolean;
  marksAwarded: number;
  marksAvailable: number;
  /** Plain-language reason, shown to the student. */
  detail: string;
  /** e.g. the value was right but the unit was missing. */
  unitIssue?: boolean;
  /** For multiple choice, revealed only after the student has submitted. */
  correctOption?: string;
  chosenOption?: string;
};

export type DeterministicResult = {
  /** All marks for the question were decided objectively. */
  complete: boolean;
  awarded: number;
  maximum: number;
  parts: PartResult[];
  /** Parts that need rubric marking (AI or self-assessment). */
  pendingParts: string[];
};

const MINUS = /[−‒–—]/g;

/** Parse a student's numeric answer: 1,25,000 · 12.5 · −3 · 3/4 · 2 1/2 · 1.2e3 · 45%. */
export function parseNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = raw.trim().replace(MINUS, "-").replace(/\s+/g, " ");
  if (!s) return null;
  s = s.replace(/^₹\s*/, "").replace(/^rs\.?\s*/i, "");
  // Indian and international digit grouping.
  if (/^-?\d{1,3}(,\d{2,3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  const percent = s.endsWith("%");
  if (percent) s = s.slice(0, -1).trim();

  let value: number | null = null;
  const mixed = s.match(/^(-?)(\d+) (\d+)\/(\d+)$/);
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (mixed) {
    const [, sign, whole, n, d] = mixed;
    if (Number(d) !== 0) value = (sign ? -1 : 1) * (Number(whole) + Number(n) / Number(d));
  } else if (frac) {
    if (Number(frac[2]) !== 0) value = Number(frac[1]) / Number(frac[2]);
  } else if (/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s)) {
    value = Number(s);
  }
  if (value === null || !Number.isFinite(value)) return null;
  return value;
}

const UNIT_SYNONYMS: Record<string, string> = {
  metre: "m", metres: "m", meter: "m", meters: "m",
  centimetre: "cm", centimetres: "cm", centimeter: "cm", centimeters: "cm", cms: "cm",
  millimetre: "mm", millimetres: "mm", mms: "mm",
  kilometre: "km", kilometres: "km", kms: "km",
  litre: "l", litres: "l", liter: "l", liters: "l", ltr: "l",
  year: "yr", years: "yr", yrs: "yr",
  month: "month", months: "month",
  rs: "₹", "rs.": "₹", inr: "₹", rupee: "₹", rupees: "₹",
  degree: "°", degrees: "°", deg: "°",
  percent: "%", "per cent": "%",
  unit: "unit", units: "unit",
};

/** Normalise unit spellings so "cm^2", "cm²", "sq cm" and "sq. cm" compare equal. */
export function normaliseUnit(u: string | undefined | null): string {
  if (!u) return "";
  let s = u.trim().toLowerCase();
  if (UNIT_SYNONYMS[s]) return UNIT_SYNONYMS[s];
  s = s.replace(/\s+/g, " ");
  let power = "";
  const sq = s.match(/^(?:square|sq\.?)\s*(.+)$/);
  const cu = s.match(/^(?:cubic|cu\.?)\s*(.+)$/);
  if (sq) [s, power] = [sq[1], "2"];
  else if (cu) [s, power] = [cu[1], "3"];
  s = s.replace(/\s+/g, "").replace(/\^2|²/g, "2").replace(/\^3|³/g, "3");
  const m = s.match(/^([a-z₹°%]+)([23]?)$/);
  if (m) {
    const baseUnit = UNIT_SYNONYMS[m[1]] ?? m[1];
    return baseUnit + (m[2] || power);
  }
  return s + power;
}

function gradeSingle(key: SingleKey, answer: SingleAnswer | undefined, marks: number, partKey: string | null): PartResult {
  if (key.type === "mcq") {
    const choice = answer?.choice?.trim().toLowerCase();
    if (!choice) return { partKey, correct: false, marksAwarded: 0, marksAvailable: marks, detail: "No option selected.", correctOption: key.correct };
    const correct = choice === key.correct;
    return {
      partKey,
      correct,
      marksAwarded: correct ? marks : 0,
      marksAvailable: marks,
      detail: correct ? "Correct option." : `You chose (${choice}). The correct option is (${key.correct}).`,
      correctOption: key.correct,
      chosenOption: choice,
    };
  }

  const value = parseNumber(answer?.value);
  if (value === null) {
    return {
      partKey,
      correct: false,
      marksAwarded: 0,
      marksAvailable: marks,
      detail: answer?.value?.trim() ? "That isn't a number we can read. Use digits, a decimal point or a fraction like 3/4." : "No answer entered.",
    };
  }
  const tolerance = Math.max(key.tolerance, Math.abs(key.value) * 1e-9);
  const valueOk = Math.abs(value - key.value) <= tolerance;
  if (!valueOk) {
    return { partKey, correct: false, marksAwarded: 0, marksAvailable: marks, detail: "The value does not match the verified answer." };
  }
  if (key.unit) {
    const accepted = [key.unit, ...(key.acceptedUnits ?? [])].map(normaliseUnit);
    const given = normaliseUnit(answer?.unit);
    if (!accepted.includes(given)) {
      // Value is right; the unit is missing or wrong. The answer key decides marks, so no
      // invented penalty: the answer is not counted as fully correct and the reason is shown.
      return {
        partKey,
        correct: false,
        marksAwarded: 0,
        marksAvailable: marks,
        unitIssue: true,
        detail: given ? `The value is right, but the unit should be ${key.unit}.` : `The value is right, but the unit (${key.unit}) is missing.`,
      };
    }
  }
  return { partKey, correct: true, marksAwarded: marks, marksAvailable: marks, detail: "Correct." };
}

/** Formats where the answer key alone decides the marks. */
export function isObjectiveFormat(format: AnswerFormat | string): boolean {
  return format === "mcq" || format === "numerical";
}

export function gradeDeterministic(input: {
  format: AnswerFormat;
  marks: number;
  content: QuestionContent;
  answerKey: AnswerKey | null;
  answer: Answer;
}): DeterministicResult | null {
  const { format, marks, content, answerKey, answer } = input;
  if (!answerKey) return null;

  if (format === "structured" && content.parts) {
    const keys = answerKey.type === "parts" ? answerKey.parts : {};
    const parts: PartResult[] = [];
    const pendingParts: string[] = [];
    for (const part of content.parts) {
      const key = keys[part.key];
      if (key && isObjectiveFormat(part.format)) parts.push(gradeSingle(key, answer.parts?.[part.key], part.marks, part.key));
      else pendingParts.push(part.key);
    }
    if (!parts.length) return null;
    const objectiveMax = parts.reduce((a, p) => a + p.marksAvailable, 0);
    return {
      complete: pendingParts.length === 0,
      awarded: parts.reduce((a, p) => a + p.marksAwarded, 0),
      maximum: pendingParts.length === 0 ? marks : objectiveMax,
      parts,
      pendingParts,
    };
  }

  if (!isObjectiveFormat(format) || answerKey.type === "parts") return null;
  const r = gradeSingle(answerKey, answer, marks, null);
  return { complete: true, awarded: r.marksAwarded, maximum: marks, parts: [r], pendingParts: [] };
}

/**
 * For questions marked on working (math_working etc.), report whether the final value matches
 * the key. This is feedback only; it never awards marks on its own.
 */
export function checkFinalValue(answerKey: AnswerKey | null, answer: Answer): PartResult | null {
  if (!answerKey || answerKey.type !== "numeric" || !answer.value) return null;
  return gradeSingle(answerKey, answer, 0, null);
}
