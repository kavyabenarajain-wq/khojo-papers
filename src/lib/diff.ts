export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Line diff via longest common subsequence. Fine for revision-sized JSON (hundreds of lines). */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.split("\n");
  const y = b.split("\n");
  if (x.length * y.length > 4_000_000) return [{ kind: "del", text: "(too large to diff)" }];
  const dp: number[][] = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      out.push({ kind: "same", text: x[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: x[i++] });
    else out.push({ kind: "add", text: y[j++] });
  }
  while (i < x.length) out.push({ kind: "del", text: x[i++] });
  while (j < y.length) out.push({ kind: "add", text: y[j++] });
  return out;
}

/** Keep changed lines plus a little context. */
export function compactDiff(lines: DiffLine[], context = 2): (DiffLine | { kind: "gap" })[] {
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l.kind !== "same") for (let k = i - context; k <= i + context; k++) keep.add(k);
  });
  const out: (DiffLine | { kind: "gap" })[] = [];
  let gap = false;
  lines.forEach((l, i) => {
    if (keep.has(i)) {
      out.push(l);
      gap = false;
    } else if (!gap) {
      out.push({ kind: "gap" });
      gap = true;
    }
  });
  return out;
}
