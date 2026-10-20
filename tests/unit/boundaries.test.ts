import { describe, expect, it } from "vitest";
import { detectCandidates } from "@/lib/ingest/boundaries";

const page1 = `SECTION A
Question 1
(a) Solve the equation 2x² − 7x + 3 = 0.  [3]
(b) Find the value of k for which x − 2 is a factor of x³ + kx − 4.  [3]
Question 2
In the given figure, O is the centre of the circle. Find ∠ACB.  [4]`;
const page2 = `3. The marks obtained by 30 students are given in the table below. Find the mean. (4 marks)
12 | 15 | 18
SECTION B
Q.4 A sum of ₹2400 is shared equally...`;

describe("detectCandidates", () => {
  it("splits questions across pages with numbers, marks and flags", () => {
    const c = detectCandidates([{ pageNumber: 1, text: page1 }, { pageNumber: 2, text: page2 }]);
    expect(c.map((x) => [x.pageNumber, x.questionNumber, x.detectedMarks])).toEqual([
      [1, "1", 6],
      [1, "2", 4],
      [2, "3", 4],
      [2, "4", null],
    ]);
    expect(c[0].flags).toEqual(expect.arrayContaining(["has_subparts", "multiple_mark_allocations"]));
    expect(c[1].flags).toContain("refers_to_figure");
    expect(c[2].flags).toContain("has_table");
    expect(c[3].confidence).toBeLessThan(c[0].confidence);
  });
  it("lowers confidence for garbled OCR", () => {
    const c = detectCandidates([{ pageNumber: 1, text: "Question 5\nFind the value of �� when x = 3 [2]" }]);
    expect(c[0].flags).toContain("garbled_characters");
    expect(c[0].confidence).toBeLessThan(0.7);
  });
});
