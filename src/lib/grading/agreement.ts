/**
 * AI-versus-teacher agreement on a benchmark set. Measures criterion-level agreement too, because a
 * system can reach the right total for the wrong reasons.
 */
export type BenchmarkOutcome = {
  itemId: string;
  category: string;
  answerFormat: string;
  teacherTotal: number;
  teacherCriteria: Record<string, number>;
  expectNeedsReview: boolean;
  /** null when the AI produced no usable marks (failed, or declined to evaluate). */
  aiTotal: number | null;
  aiCriteria: Record<string, number> | null;
  aiStatus: "completed" | "needs_review" | "not_evaluable" | "failed";
};

export type AgreementMetrics = {
  items: number;
  marked: number;
  failed: number;
  totals: { exact: number; within0_5: number; within1: number; meanAbsError: number | null; meanSignedError: number | null };
  criteria: { compared: number; exact: number; aiHigher: number; aiLower: number };
  /** AI flagged uncertainty / refused where the teacher expected that, and vice versa. */
  reviewFlag: { truePositive: number; falsePositive: number; falseNegative: number; trueNegative: number };
  byCategory: Record<string, { items: number; exact: number; meanAbsError: number | null }>;
  byFormat: Record<string, { items: number; exact: number; meanAbsError: number | null }>;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function computeAgreement(outcomes: BenchmarkOutcome[]): AgreementMetrics {
  const marked = outcomes.filter((o) => o.aiTotal !== null);
  const diffs = marked.map((o) => o.aiTotal! - o.teacherTotal);
  let compared = 0;
  let exact = 0;
  let higher = 0;
  let lower = 0;
  for (const o of marked) {
    for (const [k, t] of Object.entries(o.teacherCriteria)) {
      const a = o.aiCriteria?.[k];
      if (a === undefined) continue;
      compared++;
      if (a === t) exact++;
      else if (a > t) higher++;
      else lower++;
    }
  }
  const flag = { truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0 };
  for (const o of outcomes) {
    const aiFlag = o.aiStatus !== "completed";
    if (aiFlag && o.expectNeedsReview) flag.truePositive++;
    else if (aiFlag && !o.expectNeedsReview) flag.falsePositive++;
    else if (!aiFlag && o.expectNeedsReview) flag.falseNegative++;
    else flag.trueNegative++;
  }
  const group = (key: (o: BenchmarkOutcome) => string) => {
    const out: AgreementMetrics["byCategory"] = {};
    for (const o of outcomes) {
      const k = key(o);
      out[k] ??= { items: 0, exact: 0, meanAbsError: null };
      out[k].items++;
    }
    for (const k of Object.keys(out)) {
      const g = marked.filter((o) => key(o) === k);
      out[k].exact = g.filter((o) => o.aiTotal === o.teacherTotal).length;
      out[k].meanAbsError = mean(g.map((o) => Math.abs(o.aiTotal! - o.teacherTotal)));
    }
    return out;
  };
  return {
    items: outcomes.length,
    marked: marked.length,
    failed: outcomes.length - marked.length,
    totals: {
      exact: diffs.filter((d) => d === 0).length,
      within0_5: diffs.filter((d) => Math.abs(d) <= 0.5).length,
      within1: diffs.filter((d) => Math.abs(d) <= 1).length,
      meanAbsError: mean(diffs.map(Math.abs)),
      meanSignedError: mean(diffs),
    },
    criteria: { compared, exact, aiHigher: higher, aiLower: lower },
    reviewFlag: flag,
    byCategory: group((o) => o.category),
    byFormat: group((o) => o.answerFormat),
  };
}
