import { describe, expect, it } from "vitest";
import { aggregatePaper } from "@/lib/grading/aggregate";

const item = (itemId: string, marks: number, awarded: number | null, answered = true) => ({ itemId, marks, awarded, answered });

describe("aggregatePaper", () => {
  it("sums compulsory sections and counts unanswered as zero", () => {
    const r = aggregatePaper([{ id: "a", label: "A", choiceRule: "all", chooseN: null, items: [item("1", 1, 1), item("2", 1, 0), item("3", 2, null, false)] }]);
    expect(r).toMatchObject({ maximum: 4, awarded: 1, pending: 0, provisional: false });
  });

  it("counts the best N answers in an any-N section and flags over-attempts", () => {
    const r = aggregatePaper([{ id: "b", label: "B", choiceRule: "any_n", chooseN: 2, items: [item("1", 4, 1), item("2", 4, 4), item("3", 4, 3), item("4", 4, null, false)] }]);
    expect(r.sections[0]).toMatchObject({ maximum: 8, awarded: 7, overAttempted: true, countedItemIds: ["2", "3"], provisional: false });
  });

  it("keeps marks pending for unmarked answers and marks the result provisional when ranking depends on them", () => {
    const r = aggregatePaper([{ id: "b", label: "B", choiceRule: "any_n", chooseN: 2, items: [item("1", 4, 2), item("2", 4, null), item("3", 4, 1)] }]);
    expect(r.sections[0]).toMatchObject({ awarded: 2, pending: 4, provisional: true, countedItemIds: ["2", "1"] });
  });

  it("does not exceed the section maximum when fewer than N are answered", () => {
    const r = aggregatePaper([{ id: "b", label: "B", choiceRule: "any_n", chooseN: 3, items: [item("1", 4, 4), item("2", 4, null, false), item("3", 4, null, false), item("4", 4, null, false)] }]);
    expect(r.sections[0]).toMatchObject({ maximum: 12, awarded: 4, pending: 0, overAttempted: false });
  });
});
