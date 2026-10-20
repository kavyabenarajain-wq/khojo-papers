import { describe, expect, it } from "vitest";
import { gradeDeterministic, normaliseUnit, parseNumber, checkFinalValue } from "@/lib/grading/deterministic";
import type { QuestionContent } from "@/lib/content/types";

describe("parseNumber", () => {
  it.each([
    ["12.5", 12.5],
    [" 1,25,000 ", 125000],
    ["1,250,000.50", 1250000.5],
    ["−3", -3],
    ["3/4", 0.75],
    ["2 1/2", 2.5],
    ["-2 1/2", -2.5],
    ["₹ 450", 450],
    ["Rs. 450", 450],
    ["45%", 45],
    ["1.2e3", 1200],
    [".5", 0.5],
  ])("parses %s", (raw, expected) => {
    expect(parseNumber(raw)).toBeCloseTo(expected as number);
  });
  it.each(["", "abc", "3/0", "1,2,3", "12..5", "x=5"])("rejects %s", (raw) => {
    expect(parseNumber(raw)).toBeNull();
  });
});

describe("normaliseUnit", () => {
  it("treats common spellings as equal", () => {
    for (const u of ["cm²", "cm^2", "sq cm", "sq. cm", "square cm", "sq. centimetres", "CM2"]) expect(normaliseUnit(u)).toBe("cm2");
    for (const u of ["cm³", "cu cm", "cubic cm", "cm^3"]) expect(normaliseUnit(u)).toBe("cm3");
    expect(normaliseUnit("Rs.")).toBe("₹");
    expect(normaliseUnit("rupees")).toBe("₹");
    expect(normaliseUnit("m/s")).toBe("m/s");
    expect(normaliseUnit("years")).toBe("yr");
  });
});

const mcq: QuestionContent = { stem: "Pick one", options: [{ key: "a", text: "1" }, { key: "b", text: "2" }] };

describe("gradeDeterministic", () => {
  it("marks MCQ", () => {
    const right = gradeDeterministic({ format: "mcq", marks: 1, content: mcq, answerKey: { type: "mcq", correct: "b" }, answer: { choice: "b" } });
    expect(right).toMatchObject({ complete: true, awarded: 1, maximum: 1 });
    const wrong = gradeDeterministic({ format: "mcq", marks: 1, content: mcq, answerKey: { type: "mcq", correct: "b" }, answer: { choice: "a" } });
    expect(wrong?.awarded).toBe(0);
    expect(wrong?.parts[0].detail).toMatch(/correct option is \(b\)/);
  });

  it("marks numeric answers within tolerance and checks units", () => {
    const key = { type: "numeric" as const, value: 154, tolerance: 0.5, unit: "cm²" };
    const base = { format: "numerical" as const, marks: 2, content: { stem: "Area?" }, answerKey: key };
    expect(gradeDeterministic({ ...base, answer: { value: "154", unit: "sq cm" } })?.awarded).toBe(2);
    expect(gradeDeterministic({ ...base, answer: { value: "154.4", unit: "cm^2" } })?.awarded).toBe(2);
    const noUnit = gradeDeterministic({ ...base, answer: { value: "154" } });
    expect(noUnit?.awarded).toBe(0);
    expect(noUnit?.parts[0].unitIssue).toBe(true);
    expect(gradeDeterministic({ ...base, answer: { value: "155", unit: "cm²" } })?.awarded).toBe(0);
  });

  it("does not mark working-based formats", () => {
    expect(
      gradeDeterministic({ format: "math_working", marks: 3, content: { stem: "Solve" }, answerKey: { type: "numeric", value: 2, tolerance: 0 }, answer: { value: "2" } }),
    ).toBeNull();
  });

  it("marks objective parts of structured questions and leaves the rest pending", () => {
    const content: QuestionContent = {
      stem: "Structured",
      parts: [
        { key: "a", marks: 1, format: "mcq", prompt: "pick", options: [{ key: "a", text: "x" }, { key: "b", text: "y" }] },
        { key: "b", marks: 2, format: "numerical", prompt: "value" },
        { key: "c", marks: 3, format: "math_working", prompt: "prove" },
      ],
    };
    const r = gradeDeterministic({
      format: "structured",
      marks: 6,
      content,
      answerKey: { type: "parts", parts: { a: { type: "mcq", correct: "a" }, b: { type: "numeric", value: 10, tolerance: 0 } } },
      answer: { parts: { a: { choice: "a" }, b: { value: "11" } } },
    });
    expect(r).toMatchObject({ complete: false, awarded: 1, maximum: 3, pendingParts: ["c"] });
  });

  it("reports final-value matches without awarding marks", () => {
    const r = checkFinalValue({ type: "numeric", value: 5, tolerance: 0 }, { value: "5" });
    expect(r).toMatchObject({ correct: true, marksAwarded: 0 });
  });
});
