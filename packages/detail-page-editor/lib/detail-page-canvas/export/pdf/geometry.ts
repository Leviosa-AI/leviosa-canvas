import { fmt } from "./writer";

/**
 * Geometry for the PDF (.ai) exporter: SVG path data and the primitive shapes
 * our documents use, lowered onto the four path operators PDF actually has
 * (``m``, ``l``, ``c``, ``h``).
 *
 * Everything else — quadratics, arcs, smooth-curve shorthands, circles,
 * rounded rects — is converted to cubic Béziers here, because PDF has no
 * ellipse or arc operator at all.
 */

/** Max error of a circular arc approximated by one cubic Bézier (< 0.02%). */
const KAPPA = 0.5522847498307936;

/** Emit ``m``/``l``/``c``/``h`` operators for a rectangle, optionally rounded. */
export function rectPath(x: number, y: number, w: number, h: number, r = 0): string[] {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!radius) return [`${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re`];
  const k = radius * KAPPA;
  const [x1, y1, x2, y2] = [x + radius, y + radius, x + w - radius, y + h - radius];
  return [
    `${fmt(x1)} ${fmt(y)} m`,
    `${fmt(x2)} ${fmt(y)} l`,
    `${fmt(x2 + k)} ${fmt(y)} ${fmt(x + w)} ${fmt(y1 - k)} ${fmt(x + w)} ${fmt(y1)} c`,
    `${fmt(x + w)} ${fmt(y2)} l`,
    `${fmt(x + w)} ${fmt(y2 + k)} ${fmt(x2 + k)} ${fmt(y + h)} ${fmt(x2)} ${fmt(y + h)} c`,
    `${fmt(x1)} ${fmt(y + h)} l`,
    `${fmt(x1 - k)} ${fmt(y + h)} ${fmt(x)} ${fmt(y2 + k)} ${fmt(x)} ${fmt(y2)} c`,
    `${fmt(x)} ${fmt(y1)} l`,
    `${fmt(x)} ${fmt(y1 - k)} ${fmt(x1 - k)} ${fmt(y)} ${fmt(x1)} ${fmt(y)} c`,
    "h",
  ];
}

/** Ellipse inscribed in the box, as four cubic Béziers. */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    `${fmt(cx + rx)} ${fmt(cy)} m`,
    `${fmt(cx + rx)} ${fmt(cy + ky)} ${fmt(cx + kx)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)} c`,
    `${fmt(cx - kx)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + ky)} ${fmt(cx - rx)} ${fmt(cy)} c`,
    `${fmt(cx - rx)} ${fmt(cy - ky)} ${fmt(cx - kx)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)} c`,
    `${fmt(cx + kx)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - ky)} ${fmt(cx + rx)} ${fmt(cy)} c`,
    "h",
  ];
}

export function polygonPath(points: number[], close: boolean): string[] {
  const ops: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    ops.push(`${fmt(points[i])} ${fmt(points[i + 1])} ${i === 0 ? "m" : "l"}`);
  }
  if (close && ops.length) ops.push("h");
  return ops;
}

/** Parse an SVG ``points`` list ("1,2 3,4" / "1 2 3 4"). */
export function parsePoints(value: string): number[] {
  return (value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
}

type Cursor = { x: number; y: number; startX: number; startY: number };

/**
 * Elliptical arc → cubic Béziers (SVG implementation notes, F.6.5): the arc is
 * un-rotated into a unit circle to recover the center and sweep, then split
 * into ≤90° segments that a single cubic can hold.
 */
function arcToCurves(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  angleDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): number[][] {
  if (rx === 0 || ry === 0) return [[x2, y2, x2, y2, x2, y2]];
  const phi = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  let arx = Math.abs(rx);
  let ary = Math.abs(ry);
  // Radii too small to reach the endpoint are scaled up (SVG F.6.6).
  const lambda = (x1p * x1p) / (arx * arx) + (y1p * y1p) / (ary * ary);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    arx *= s;
    ary *= s;
  }
  const sign = largeArc === sweep ? -1 : 1;
  const num =
    arx * arx * ary * ary - arx * arx * y1p * y1p - ary * ary * x1p * x1p;
  const den = arx * arx * y1p * y1p + ary * ary * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * (arx * y1p)) / ary;
  const cyp = (co * -(ary * x1p)) / arx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    const a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  const theta = angle(1, 0, (x1p - cxp) / arx, (y1p - cyp) / ary);
  let delta = angle(
    (x1p - cxp) / arx,
    (y1p - cyp) / ary,
    (-x1p - cxp) / arx,
    (-y1p - cyp) / ary,
  );
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(delta / (Math.PI / 2))));
  const step = delta / segments;
  // Bézier handle length for a `step`-radian circular arc.
  const t = ((4 / 3) * Math.tan(step / 4));
  const curves: number[][] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = theta + i * step;
    const a1 = a0 + step;
    const cosA0 = Math.cos(a0);
    const sinA0 = Math.sin(a0);
    const cosA1 = Math.cos(a1);
    const sinA1 = Math.sin(a1);
    const map = (px: number, py: number): [number, number] => [
      cos * arx * px - sin * ary * py + cx,
      sin * arx * px + cos * ary * py + cy,
    ];
    const [c1x, c1y] = map(cosA0 - t * sinA0, sinA0 + t * cosA0);
    const [c2x, c2y] = map(cosA1 + t * sinA1, sinA1 - t * cosA1);
    const [ex, ey] = map(cosA1, sinA1);
    curves.push([c1x, c1y, c2x, c2y, ex, ey]);
  }
  return curves;
}

/**
 * SVG path data → PDF path operators.
 *
 * Supports the full command set our decomposer emits (M m L l H h V v C c
 * S s Q q A a Z z) — arcs alone account for the rounded corners of every
 * speech bubble, so "just handle lines and curves" is not an option.
 */
export function svgPathToPdf(d: string): string[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const ops: string[] = [];
  const cur: Cursor = { x: 0, y: 0, startX: 0, startY: 0 };
  let lastControl: [number, number] | null = null;
  let command = "";
  let i = 0;

  const next = () => Number(tokens[i++]);
  const moveTo = (x: number, y: number) => {
    ops.push(`${fmt(x)} ${fmt(y)} m`);
    cur.x = cur.startX = x;
    cur.y = cur.startY = y;
  };
  const lineTo = (x: number, y: number) => {
    ops.push(`${fmt(x)} ${fmt(y)} l`);
    cur.x = x;
    cur.y = y;
  };
  const curveTo = (
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x: number,
    y: number,
  ) => {
    ops.push(
      `${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(x)} ${fmt(y)} c`,
    );
    cur.x = x;
    cur.y = y;
  };

  while (i < tokens.length) {
    const token = tokens[i];
    if (/[a-zA-Z]/.test(token)) {
      command = token;
      i++;
      // A bare Z carries no arguments.
      if (command === "Z" || command === "z") {
        ops.push("h");
        cur.x = cur.startX;
        cur.y = cur.startY;
        lastControl = null;
        continue;
      }
    } else if (!command) {
      break; // numbers before any command: malformed
    } else if (command === "M") {
      command = "L"; // repeated pairs after M are implicit lineTos
    } else if (command === "m") {
      command = "l";
    }

    const rel = command === command.toLowerCase();
    const ox = rel ? cur.x : 0;
    const oy = rel ? cur.y : 0;

    switch (command.toUpperCase()) {
      case "M":
        moveTo(next() + ox, next() + oy);
        lastControl = null;
        break;
      case "L":
        lineTo(next() + ox, next() + oy);
        lastControl = null;
        break;
      case "H":
        lineTo(next() + ox, cur.y);
        lastControl = null;
        break;
      case "V":
        lineTo(cur.x, next() + oy);
        lastControl = null;
        break;
      case "C": {
        const c1x = next() + ox;
        const c1y = next() + oy;
        const c2x = next() + ox;
        const c2y = next() + oy;
        curveTo(c1x, c1y, c2x, c2y, next() + ox, next() + oy);
        lastControl = [c2x, c2y];
        break;
      }
      case "S": {
        // Smooth cubic: first control point mirrors the previous one.
        const [rx, ry] = lastControl
          ? [2 * cur.x - lastControl[0], 2 * cur.y - lastControl[1]]
          : [cur.x, cur.y];
        const c2x = next() + ox;
        const c2y = next() + oy;
        curveTo(rx, ry, c2x, c2y, next() + ox, next() + oy);
        lastControl = [c2x, c2y];
        break;
      }
      case "Q": {
        // PDF has no quadratic operator — raise it to a cubic.
        const qx = next() + ox;
        const qy = next() + oy;
        const x = next() + ox;
        const y = next() + oy;
        curveTo(
          cur.x + (2 / 3) * (qx - cur.x),
          cur.y + (2 / 3) * (qy - cur.y),
          x + (2 / 3) * (qx - x),
          y + (2 / 3) * (qy - y),
          x,
          y,
        );
        lastControl = [qx, qy];
        break;
      }
      case "T": {
        // Annotated because `lastControl` is re-assigned from these below —
        // inferring both at once would be circular.
        const qx: number = lastControl ? 2 * cur.x - lastControl[0] : cur.x;
        const qy: number = lastControl ? 2 * cur.y - lastControl[1] : cur.y;
        const x = next() + ox;
        const y = next() + oy;
        const sx = cur.x;
        const sy = cur.y;
        curveTo(
          sx + (2 / 3) * (qx - sx),
          sy + (2 / 3) * (qy - sy),
          x + (2 / 3) * (qx - x),
          y + (2 / 3) * (qy - y),
          x,
          y,
        );
        lastControl = [qx, qy];
        break;
      }
      case "A": {
        const rx = next();
        const ry = next();
        const rot = next();
        const largeArc = next() !== 0;
        const sweep = next() !== 0;
        const x = next() + ox;
        const y = next() + oy;
        for (const c of arcToCurves(cur.x, cur.y, rx, ry, rot, largeArc, sweep, x, y)) {
          curveTo(c[0], c[1], c[2], c[3], c[4], c[5]);
        }
        lastControl = null;
        break;
      }
      default:
        i++; // unknown command: skip a token rather than spin
        break;
    }
  }
  return ops;
}
