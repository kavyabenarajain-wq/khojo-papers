import { describe, expect, it } from "vitest";
import { computeAgreement, type BenchmarkOutcome } from "@/lib/grading/agreement";

const o = (p: Partial<BenchmarkOutcome>): BenchmarkOutcome => ({
  itemId: "x", category: "correct", answerFormat: "math_working", teacherTotal: 3, teacherCriteria: { a: 1, b: 1, c: 1 }, expectNeedsReview: false,
  aiTotal: 3, aiCriteria: { a: 1, b: 1, c: 1 }, aiStatus: "completed", ...p,
});

describe("computeAgreement", () => {
  it("separates total agreement from criterion agreement", () => {
    // Same total, different reasons: total agrees, criteria don't.
    const m = computeAgreement([o({ aiCriteria: { a: 0, b: 1, c: 2 }, aiTotal: 3 }), o({ aiTotal: 2, aiCriteria: { a: 1, b: 1, c: 0 }, category: "partially_correct" })]);
    expect(m.totals.exact).toBe(1);
    expect(m.criteria).toEqual({ compared: 6, exact: 3, aiHigher: 1, aiLower: 2 });
    expect(m.totals.meanAbsError).toBeCloseTo(0.5);
    expect(m.byCategory.partially_correct).toEqual({ items: 1, exact: 0, meanAbsError: 1 });
  });
  it("counts failures separately and scores review-flag agreement", () => {
    const m = computeAgreement([
      o({ category: "illegible", expectNeedsReview: true, aiTotal: null, aiCriteria: null, aiStatus: "failed" }),
      o({ category: "incomplete_rubric", expectNeedsReview: true, aiStatus: "completed" }),
      o({ aiStatus: "needs_review" }),
    ]);
    expect(m).toMatchObject({ items: 3, marked: 2, failed: 1 });
    expect(m.reviewFlag).toEqual({ truePositive: 1, falsePositive: 1, falseNegative: 1, trueNegative: 0 });
  });
});
