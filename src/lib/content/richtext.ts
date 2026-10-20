import katex from "katex";

/**
 * Rich text: prose with inline maths \( … \), display maths \[ … \], **bold**, blank-line
 * paragraphs and single-newline line breaks. Rendered to HTML on the server with KaTeX.
 */

export type Segment =
  | { t: "text"; v: string }
  | { t: "bold"; v: string }
  | { t: "math"; v: string }
  | { t: "br" };

export type Block = { t: "p"; segments: Segment[] } | { t: "display"; v: string };

const KATEX_OPTIONS = {
  output: "htmlAndMathml" as const,
  trust: false,
  strict: "ignore" as const,
  maxExpand: 1000,
  maxSize: 20,
};

export function parseRichText(source: string): Block[] {
  const blocks: Block[] = [];
  // Split out display maths first, so \[ … \] can span lines.
  const parts = source.split(/(\\\[[\s\S]*?\\\])/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("\\[") && part.endsWith("\\]")) {
      blocks.push({ t: "display", v: part.slice(2, -2).trim() });
      continue;
    }
    for (const para of part.split(/\n\s*\n/)) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      blocks.push({ t: "p", segments: parseInline(trimmed) });
    }
  }
  return blocks;
}

function parseInline(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /\\\(([\s\S]*?)\\\)|\*\*([^*]+)\*\*|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[0] === "\n") out.push({ t: "br" });
    else if (m[1] !== undefined) out.push({ t: "math", v: m[1].trim() });
    else if (m[2] !== undefined) out.push({ t: "bold", v: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { ...KATEX_OPTIONS, displayMode, throwOnError: true });
  } catch {
    // Never show raw LaTeX as if it were rendered; mark it clearly so reviewers catch it.
    return `<span class="math-error" title="This expression could not be rendered">${escapeHtml(tex)}</span>`;
  }
}

function renderSegments(segments: Segment[]): string {
  return segments
    .map((s) => {
      switch (s.t) {
        case "text":
          return escapeHtml(s.v);
        case "bold":
          return `<strong>${escapeHtml(s.v)}</strong>`;
        case "br":
          return "<br/>";
        case "math":
          return `<span class="math-inline">${renderMath(s.v, false)}</span>`;
      }
    })
    .join("");
}

/** Render rich text to HTML. Output is safe to inject: text is escaped and KaTeX runs untrusted. */
export function renderRichText(source: string | undefined | null): string {
  if (!source) return "";
  return parseRichText(source)
    .map((b) =>
      b.t === "display"
        ? `<div class="math-display">${renderMath(b.v, true)}</div>`
        : `<p>${renderSegments(b.segments)}</p>`,
    )
    .join("");
}

/** Render a rich text fragment without paragraph wrappers (for options, table cells, labels). */
export function renderInline(source: string | undefined | null): string {
  if (!source) return "";
  return parseRichText(source)
    .map((b) => (b.t === "display" ? `<span class="math-display">${renderMath(b.v, true)}</span>` : renderSegments(b.segments)))
    .join(" ");
}

export type RichTextIssue = { message: string; excerpt?: string };

/** Problems that must block approval: unbalanced delimiters, stray `$` maths, or KaTeX errors. */
export function validateRichText(source: string): RichTextIssue[] {
  const issues: RichTextIssue[] = [];
  const opens = (source.match(/\\\(/g) ?? []).length;
  const closes = (source.match(/\\\)/g) ?? []).length;
  if (opens !== closes) issues.push({ message: `Unbalanced inline maths: ${opens} \\( and ${closes} \\)` });
  const dOpens = (source.match(/\\\[/g) ?? []).length;
  const dCloses = (source.match(/\\\]/g) ?? []).length;
  if (dOpens !== dCloses) issues.push({ message: `Unbalanced display maths: ${dOpens} \\[ and ${dCloses} \\]` });
  if (/\$[^$\s][^$]*\$/.test(source)) {
    issues.push({ message: "Looks like $…$ maths. Use \\( … \\) for inline maths and ₹ for rupees." });
  }
  for (const block of parseRichText(source)) {
    const exprs = block.t === "display" ? [block.v] : block.segments.filter((s) => s.t === "math").map((s) => (s as { v: string }).v);
    for (const tex of exprs) {
      const err = latexError(tex, block.t === "display");
      if (err) issues.push({ message: err, excerpt: tex.slice(0, 80) });
    }
  }
  return issues;
}

export function latexError(tex: string, displayMode = false): string | null {
  try {
    katex.renderToString(tex, { ...KATEX_OPTIONS, displayMode, throwOnError: true });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.replace(/^KaTeX parse error: /, "") : "Invalid maths";
  }
}

/** Plain text for search indexing and duplicate detection. */
export function toPlainText(source: string | undefined | null): string {
  if (!source) return "";
  return source
    .replace(/\\\[|\\\]|\\\(|\\\)/g, " ")
    .replace(/\\(?:frac|dfrac|tfrac)\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
    .replace(/\\(text|mathrm|textbf|operatorname)\{([^{}]*)\}/g, "$2")
    .replace(/\\(times|cdot)/g, "×")
    .replace(/\\(le|leq)\b/g, "≤")
    .replace(/\\(ge|geq)\b/g, "≥")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}^_*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
