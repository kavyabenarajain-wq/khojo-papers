/**
 * A tiny, safe arithmetic evaluator for checking generated answers (no eval, no identifiers
 * beyond a fixed whitelist). Supports + - * / ^, parentheses, unary minus, pi, e and
 * sqrt/abs/sin/cos/tan (degrees)/log10/ln/round.
 */
const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: (x) => Math.sin((x * Math.PI) / 180),
  cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180),
  log10: Math.log10,
  ln: Math.log,
  round: Math.round,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function evaluateArithmetic(src: string): number {
  const s = src.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (s.length > 300) throw new Error("Expression too long");
  let i = 0;
  const peek = () => s[i];
  const expect = (c: string) => {
    if (s[i] !== c) throw new Error(`Expected "${c}" at ${i}`);
    i++;
  };
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") v = s[i++] === "+" ? v + term() : v - term();
    return v;
  }
  function term(): number {
    let v = unary();
    while (peek() === "*" || peek() === "/") v = s[i++] === "*" ? v * unary() : v / unary();
    return v;
  }
  // Unary minus binds looser than ^, so -3^2 = -9 as in ordinary notation.
  function unary(): number {
    if (peek() === "-") {
      i++;
      return -unary();
    }
    if (peek() === "+") {
      i++;
      return unary();
    }
    return power();
  }
  function power(): number {
    const base = atom();
    if (peek() === "^") {
      i++;
      return Math.pow(base, unary());
    }
    return base;
  }
  function atom(): number {
    if (peek() === "(") {
      i++;
      const v = expr();
      expect(")");
      return v;
    }
    const num = s.slice(i).match(/^\d+(\.\d+)?(e[+-]?\d+)?/i);
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    const id = s.slice(i).match(/^[a-z][a-z0-9]*/i);
    if (id) {
      const name = id[0].toLowerCase();
      i += id[0].length;
      if (name in CONSTS) return CONSTS[name];
      if (name in FUNCS) {
        expect("(");
        const v = expr();
        expect(")");
        return FUNCS[name](v);
      }
      throw new Error(`Unknown name "${id[0]}"`);
    }
    throw new Error(`Unexpected "${peek() ?? "end"}" at ${i}`);
  }
  const v = expr();
  if (i !== s.length) throw new Error(`Unexpected "${s[i]}" at ${i}`);
  if (!Number.isFinite(v)) throw new Error("Result is not finite");
  return v;
}

export function checkArithmetic(checks: { expression: string; expected: number }[]): string[] {
  const problems: string[] = [];
  for (const c of checks) {
    try {
      const v = evaluateArithmetic(c.expression);
      const tol = Math.max(1e-6, Math.abs(c.expected) * 5e-4) + 0.005;
      if (Math.abs(v - c.expected) > tol) problems.push(`Calculation check failed: ${c.expression} = ${Number(v.toPrecision(10))}, not ${c.expected}.`);
    } catch (e) {
      problems.push(`Calculation check "${c.expression}" could not be evaluated: ${(e as Error).message}`);
    }
  }
  return problems;
}
