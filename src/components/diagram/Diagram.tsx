import type { Diagram as DiagramSpec, DiagramElement, PointRef } from "@/lib/content/types";

type Props = {
  diagram: DiagramSpec;
  /** Only elements with no step, or step ≤ visibleStep, are drawn. Undefined = draw everything. */
  visibleStep?: number;
  /** Elements introduced at this step are animated (stroke drawing). */
  animateStep?: number;
  className?: string;
};

const W = 360; // internal drawing width; the SVG scales to its container
const PAD = 22;
const FONT = 15;

/**
 * Declarative diagram → SVG. Coordinates are mathematical (y up). The `alt` text is always
 * provided to assistive technology and in the caption toggle, so the drawing is never the only
 * way to get the information.
 */
export function Diagram({ diagram, visibleStep, animateStep, className }: Props) {
  const { xMin, xMax, yMin, yMax } = diagram.viewBox;
  const s = (W - 2 * PAD) / (xMax - xMin);
  const H = Math.round((yMax - yMin) * s + 2 * PAD);
  const X = (x: number) => PAD + (x - xMin) * s;
  const Y = (y: number) => PAD + (yMax - y) * s;

  const points = new Map<string, [number, number]>();
  for (const el of diagram.elements) if (el.kind === "point") points.set(el.id, [el.x, el.y]);
  const P = (ref: PointRef): [number, number] => {
    if (typeof ref === "string") {
      const p = points.get(ref);
      if (!p) throw new Error(`Diagram ${diagram.id}: unknown point "${ref}"`);
      return p;
    }
    return ref;
  };
  const SP = (ref: PointRef): [number, number] => {
    const [x, y] = P(ref);
    return [X(x), Y(y)];
  };

  const shown = (el: DiagramElement) => visibleStep === undefined || el.step === undefined || el.step <= visibleStep;
  const animClass = (el: DiagramElement) => (animateStep !== undefined && el.step === animateStep ? "wb-draw" : undefined);
  const fadeClass = (el: DiagramElement) => (animateStep !== undefined && el.step === animateStep ? "wb-fade" : undefined);
  const stroke = (el: DiagramElement) => (el.emphasis ? "var(--chalk-accent)" : "var(--chalk)");

  const drawn: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];

  diagram.elements.forEach((el, i) => {
    if (!shown(el)) return;
    const key = `${el.kind}-${i}`;
    const dash = "dashed" in el && el.dashed ? "6 5" : undefined;
    switch (el.kind) {
      case "point": {
        if (!el.hidden) drawn.push(<circle key={key} cx={X(el.x)} cy={Y(el.y)} r={3} fill={stroke(el)} className={fadeClass(el)} />);
        if (el.label) labels.push(<Label key={`${key}-l`} x={X(el.x)} y={Y(el.y)} pos={el.labelPos ?? "ne"} text={el.label} className={fadeClass(el)} />);
        break;
      }
      case "segment": {
        const [x1, y1] = SP(el.from);
        const [x2, y2] = SP(el.to);
        const len = Math.hypot(x2 - x1, y2 - y1);
        drawn.push(
          <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke(el)} strokeWidth={1.75} strokeDasharray={dash} strokeLinecap="round"
            markerEnd={el.arrow ? "url(#arrow)" : undefined} className={dash ? fadeClass(el) : animClass(el)} style={{ ["--len" as string]: len }} />,
        );
        if (el.ticks) drawn.push(<Ticks key={`${key}-t`} x1={x1} y1={y1} x2={x2} y2={y2} n={el.ticks} color={stroke(el)} />);
        if (el.label) {
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const nx = -(y2 - y1) / (len || 1);
          const ny = (x2 - x1) / (len || 1);
          labels.push(<Halo key={`${key}-l`} x={mx + nx * 12} y={my + ny * 12 + 4} text={el.label} anchor="middle" className={fadeClass(el)} />);
        }
        break;
      }
      case "line": {
        const [a, b] = el.through.map(P) as [[number, number], [number, number]];
        const clipped = clipLine(a, b, diagram.viewBox);
        if (!clipped) break;
        const [[x1, y1], [x2, y2]] = clipped;
        drawn.push(
          <line key={key} x1={X(x1)} y1={Y(y1)} x2={X(x2)} y2={Y(y2)} stroke={stroke(el)} strokeWidth={1.5} strokeDasharray={dash}
            className={dash ? fadeClass(el) : animClass(el)} style={{ ["--len" as string]: Math.hypot(X(x2) - X(x1), Y(y2) - Y(y1)) }} />,
        );
        if (el.label) labels.push(<Halo key={`${key}-l`} x={X(x2) - 4} y={Y(y2) + 14} text={el.label} anchor="end" className={fadeClass(el)} />);
        break;
      }
      case "circle": {
        const [cx, cy] = SP(el.center);
        const r = el.r * s;
        drawn.push(<circle key={key} cx={cx} cy={cy} r={r} fill="none" stroke={stroke(el)} strokeWidth={1.75} strokeDasharray={dash}
          className={dash ? fadeClass(el) : animClass(el)} style={{ ["--len" as string]: 2 * Math.PI * r }} />);
        break;
      }
      case "arc": {
        const [cx, cy] = SP(el.center);
        const r = el.r * s;
        drawn.push(<path key={key} d={arcPath(cx, cy, r, el.startDeg, el.endDeg)} fill="none" stroke={stroke(el)} strokeWidth={1.75}
          strokeDasharray={dash} className={dash ? fadeClass(el) : animClass(el)}
          style={{ ["--len" as string]: (Math.abs(el.endDeg - el.startDeg) * Math.PI * r) / 180 }} />);
        break;
      }
      case "angle": {
        const [vx, vy] = SP(el.vertex);
        const [fx, fy] = SP(el.from);
        const [tx, ty] = SP(el.to);
        const a1 = Math.atan2(-(fy - vy), fx - vx);
        const a2 = Math.atan2(-(ty - vy), tx - vx);
        let sweep = a2 - a1;
        while (sweep <= -Math.PI) sweep += 2 * Math.PI;
        while (sweep > Math.PI) sweep -= 2 * Math.PI;
        const r = 18;
        if (el.right) {
          const u = [Math.cos(a1), -Math.sin(a1)];
          const v = [Math.cos(a2), -Math.sin(a2)];
          const k = 11;
          const d = `M ${vx + u[0] * k} ${vy + u[1] * k} L ${vx + (u[0] + v[0]) * k} ${vy + (u[1] + v[1]) * k} L ${vx + v[0] * k} ${vy + v[1] * k}`;
          drawn.push(<path key={key} d={d} fill="none" stroke={stroke(el)} strokeWidth={1.25} className={fadeClass(el)} />);
        } else {
          const start = (a1 * 180) / Math.PI;
          const end = ((a1 + sweep) * 180) / Math.PI;
          drawn.push(<path key={key} d={arcPath(vx, vy, r, Math.min(start, end), Math.max(start, end))} fill="none" stroke={stroke(el)} strokeWidth={1.25} className={fadeClass(el)} />);
        }
        if (el.label) {
          const mid = a1 + sweep / 2;
          labels.push(<Halo key={`${key}-l`} x={vx + Math.cos(mid) * (r + 14)} y={vy - Math.sin(mid) * (r + 14) + 5} text={el.label} anchor="middle" className={fadeClass(el)} />);
        }
        break;
      }
      case "polygon":
      case "polyline": {
        const pts = el.points.map(SP);
        const d =
          el.kind === "polyline" && el.smooth
            ? smoothPath(pts)
            : pts.map(([x, y], j) => `${j ? "L" : "M"} ${x} ${y}`).join(" ") + (el.kind === "polygon" ? " Z" : "");
        const len = pts.reduce((acc, p, j) => (j ? acc + Math.hypot(p[0] - pts[j - 1][0], p[1] - pts[j - 1][1]) : 0), 0) +
          (el.kind === "polygon" ? Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) : 0);
        const shaded = el.kind === "polygon" && el.shaded;
        drawn.push(<path key={key} d={d} fill={shaded ? "var(--accent-soft)" : "none"} stroke={stroke(el)} strokeWidth={1.75}
          strokeLinejoin="round" strokeDasharray={dash} className={dash || shaded ? fadeClass(el) : animClass(el)} style={{ ["--len" as string]: len }} />);
        break;
      }
      case "rect": {
        const x = X(el.x);
        const y = Y(el.y + el.height);
        drawn.push(<rect key={key} x={x} y={y} width={el.width * s} height={el.height * s} fill={el.shaded ? "var(--accent-soft)" : "none"}
          stroke={stroke(el)} strokeWidth={1.5} className={fadeClass(el)} />);
        if (el.label) labels.push(<Halo key={`${key}-l`} x={x + (el.width * s) / 2} y={y - 6} text={el.label} anchor="middle" className={fadeClass(el)} />);
        break;
      }
      case "text": {
        const [x, y] = SP(el.at);
        labels.push(<Halo key={key} x={x} y={y} text={el.text} anchor={el.anchor ?? "middle"} className={fadeClass(el)} />);
        break;
      }
    }
  });

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={diagram.alt} className="block h-auto w-full max-w-[480px]" style={{ background: "var(--board)" }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--chalk)" />
          </marker>
        </defs>
        {diagram.grid && <Grid {...{ X, Y, xMin, xMax, yMin, yMax, xStep: diagram.axes?.xStep ?? 1, yStep: diagram.axes?.yStep ?? 1 }} />}
        {diagram.axes && <Axes {...{ X, Y, xMin, xMax, yMin, yMax, axes: diagram.axes }} />}
        {drawn}
        {labels}
      </svg>
      {(diagram.caption || diagram.notToScale) && (
        <figcaption className="mt-1.5 text-sm text-ink-3">
          {diagram.caption}
          {diagram.caption && diagram.notToScale ? " · " : ""}
          {diagram.notToScale ? "Figure not drawn to scale" : ""}
        </figcaption>
      )}
    </figure>
  );
}

function Label({ x, y, pos, text, className }: { x: number; y: number; pos: string; text: string; className?: string }) {
  const off = 10;
  const d: Record<string, [number, number, "start" | "middle" | "end"]> = {
    n: [0, -off, "middle"], ne: [off * 0.7, -off * 0.7, "start"], e: [off, 4, "start"], se: [off * 0.7, off + 4, "start"],
    s: [0, off + 8, "middle"], sw: [-off * 0.7, off + 4, "end"], w: [-off, 4, "end"], nw: [-off * 0.7, -off * 0.7, "end"],
  };
  const [dx, dy, anchor] = d[pos] ?? d.ne;
  return <Halo x={x + dx} y={y + dy} text={text} anchor={anchor} className={className} />;
}

/** Text with a background-coloured halo so it stays legible over lines. */
function Halo({ x, y, text, anchor, className }: { x: number; y: number; text: string; anchor: "start" | "middle" | "end"; className?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={FONT} fontFamily="var(--font-serif)" fill="var(--chalk)" stroke="var(--board)"
      strokeWidth={4} paintOrder="stroke" strokeLinejoin="round" className={className}>
      {text}
    </text>
  );
}

function Ticks({ x1, y1, x2, y2, n, color }: { x1: number; y1: number; x2: number; y2: number; n: number; color: string }) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 4;
    const cx = mx + ux * o;
    const cy = my + uy * o;
    out.push(<line key={i} x1={cx - uy * 6} y1={cy + ux * 6} x2={cx + uy * 6} y2={cy - ux * 6} stroke={color} strokeWidth={1.25} />);
  }
  return <g>{out}</g>;
}

type Scale = { X: (x: number) => number; Y: (y: number) => number; xMin: number; xMax: number; yMin: number; yMax: number };

function Grid({ X, Y, xMin, xMax, yMin, yMax, xStep, yStep }: Scale & { xStep: number; yStep: number }) {
  const lines = [];
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax + 1e-9; x += xStep)
    lines.push(<line key={`gx${x}`} x1={X(x)} y1={Y(yMin)} x2={X(x)} y2={Y(yMax)} stroke="var(--board-grid)" strokeWidth={1} />);
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax + 1e-9; y += yStep)
    lines.push(<line key={`gy${y}`} x1={X(xMin)} y1={Y(y)} x2={X(xMax)} y2={Y(y)} stroke="var(--board-grid)" strokeWidth={1} />);
  return <g aria-hidden>{lines}</g>;
}

function Axes({ X, Y, xMin, xMax, yMin, yMax, axes }: Scale & { axes: NonNullable<DiagramSpec["axes"]> }) {
  const out = [];
  const x0 = Math.min(Math.max(0, xMin), xMax);
  const y0 = Math.min(Math.max(0, yMin), yMax);
  out.push(<line key="ax" x1={X(xMin)} y1={Y(y0)} x2={X(xMax)} y2={Y(y0)} stroke="var(--ink-3)" strokeWidth={1.25} markerEnd="url(#arrow)" />);
  out.push(<line key="ay" x1={X(x0)} y1={Y(yMin)} x2={X(x0)} y2={Y(yMax)} stroke="var(--ink-3)" strokeWidth={1.25} markerEnd="url(#arrow)" />);
  const xs = axes.xStep;
  const ys = axes.yStep;
  if (xs)
    for (let x = Math.ceil(xMin / xs) * xs; x < xMax - 1e-9; x += xs) {
      if (Math.abs(x - x0) < 1e-9) continue;
      out.push(<line key={`tx${x}`} x1={X(x)} y1={Y(y0) - 3} x2={X(x)} y2={Y(y0) + 3} stroke="var(--ink-3)" />);
      out.push(<text key={`lx${x}`} x={X(x)} y={Y(y0) + 15} fontSize={10.5} textAnchor="middle" fill="var(--ink-3)">{fmt(x)}</text>);
    }
  if (ys)
    for (let y = Math.ceil(yMin / ys) * ys; y < yMax - 1e-9; y += ys) {
      if (Math.abs(y - y0) < 1e-9) continue;
      out.push(<line key={`ty${y}`} x1={X(x0) - 3} y1={Y(y)} x2={X(x0) + 3} y2={Y(y)} stroke="var(--ink-3)" />);
      out.push(<text key={`ly${y}`} x={X(x0) - 6} y={Y(y) + 4} fontSize={10.5} textAnchor="end" fill="var(--ink-3)">{fmt(y)}</text>);
    }
  if (axes.x) out.push(<text key="xl" x={X(xMax) - 2} y={Y(y0) - 8} fontSize={12} textAnchor="end" fill="var(--ink-2)">{axes.x}</text>);
  if (axes.y) out.push(<text key="yl" x={X(x0) + 8} y={Y(yMax) + 12} fontSize={12} fill="var(--ink-2)">{axes.y}</text>);
  return <g aria-hidden>{out}</g>;
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const a = (startDeg * Math.PI) / 180;
  const b = (endDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(a);
  const y1 = cy - r * Math.sin(a);
  const x2 = cx + r * Math.cos(b);
  const y2 = cy - r * Math.sin(b);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2}`;
}

function smoothPath(pts: [number, number][]) {
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/** Clip the infinite line through a and b to the view box (Liang–Barsky on a long segment). */
export function clipLine(
  a: [number, number],
  b: [number, number],
  box: { xMin: number; xMax: number; yMin: number; yMax: number },
): [[number, number], [number, number]] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return null;
  let t0 = -1e6;
  let t1 = 1e6;
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - box.xMin, box.xMax - a[0], a[1] - box.yMin, box.yMax - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  if (t0 > t1) return null;
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/** Structural checks used by the content checker: every point reference resolves. */
export function validateDiagram(diagram: DiagramSpec): string[] {
  const ids = new Set(diagram.elements.filter((e) => e.kind === "point").map((e) => (e as { id: string }).id));
  const errors: string[] = [];
  const check = (ref: PointRef) => {
    if (typeof ref === "string" && !ids.has(ref)) errors.push(`Unknown point "${ref}" in diagram ${diagram.id}`);
  };
  for (const el of diagram.elements) {
    switch (el.kind) {
      case "segment": check(el.from); check(el.to); break;
      case "line": el.through.forEach(check); break;
      case "circle": case "arc": check(el.center); break;
      case "angle": check(el.vertex); check(el.from); check(el.to); break;
      case "polygon": case "polyline": el.points.forEach(check); break;
      case "text": check(el.at); break;
    }
  }
  return errors;
}
