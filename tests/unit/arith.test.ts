import { describe, expect, it } from "vitest";
import { checkArithmetic, evaluateArithmetic } from "@/lib/content/arith";

describe("evaluateArithmetic", () => {
  it.each([
    ["2+3*4", 14],
    ["(2+3)*4", 20],
    ["2^3^2", 512],
    ["-3^2", -9],
    ["(5+sqrt(73))/6", (5 + Math.sqrt(73)) / 6],
    ["22/7*7^2", 154],
    ["1.5+30*tan(60)", 1.5 + 30 * Math.sqrt(3)],
    ["4/3*pi*1.5^3", (4 / 3) * Math.PI * 3.375],
  ])("%s", (e, v) => expect(evaluateArithmetic(e)).toBeCloseTo(v as number, 9));
  it.each(["process.exit()", "constructor", "2+", "1/0", "a=1", "this"])("rejects %s", (e) => expect(() => evaluateArithmetic(e)).toThrow());
  it("reports mismatches", () => {
    expect(checkArithmetic([{ expression: "2*3", expected: 6 }])).toEqual([]);
    expect(checkArithmetic([{ expression: "2*3", expected: 7 }])[0]).toMatch(/failed/);
  });
});
