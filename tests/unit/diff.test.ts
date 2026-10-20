import { describe, expect, it } from "vitest";
import { compactDiff, diffLines } from "@/lib/diff";

describe("diffLines", () => {
  it("finds added and removed lines", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc\nd");
    expect(d).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });
  it("compacts unchanged runs", () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const b = a.replace("l10", "L10");
    const c = compactDiff(diffLines(a, b), 1);
    expect(c.filter((x) => x.kind === "gap")).toHaveLength(2);
  });
});
