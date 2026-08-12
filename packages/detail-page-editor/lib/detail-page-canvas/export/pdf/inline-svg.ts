import type { ExportElement } from "../document-model";
import {
  ellipsePath,
  parsePoints,
  polygonPath,
  rectPath,
  svgPathToPdf,
} from "./geometry";
import {
  parsePaint,
  rgbOps,
  type ResourcePool,
  type RgbColor,
  type ShadingStop,
} from "./resources";
import { showTextOps } from "./text-ops";
import { fmt } from "./writer";

/**
 * Inline SVG (``svg``-type elements: decomposer icons, speech bubbles, charts,
 * badges) → PDF vector operators.
 *
 * These carry a real share of every detail page, so rasterizing them would
 * hand Illustrator a flat picture instead of editable artwork. The vocabulary
 * the decomposer emits is small and closed — path, circle, rect, line,
 * polyline, polygon, ellipse, g, text, and linear/radial gradients — which is
 * exactly what this covers. Anything else (patterns, <use>) is skipped rather
 * than drawn wrong.
 */

export type InlineSvgEnv = {
  pool: ResourcePool;
  /** Same measurement hook the text exporters use, for ``<text>`` inside icons. */
  measure: (el: ExportElement, text: string) => number;
};

type Style = Record<string, string>;

const INHERITED = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "fill-rule",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
];

function readStyle(el: Element, parent: Style): Style {
  const style: Style = { ...parent };
  for (const key of INHERITED) {
    const value = el.getAttribute(key);
    if (value) style[key] = value;
  }
  // A `style` attribute wins over presentation attributes.
  for (const rule of (el.getAttribute("style") ?? "").split(";")) {
    const [key, value] = rule.split(":");
    if (key && value) style[key.trim()] = value.trim();
  }
  return style;
}

const num = (value: string | null, fallback = 0): number => {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : fallback;
};

const rgb = (value: string): RgbColor | null => parsePaint(value)?.color ?? null;

/** Bounding box of emitted path ops. Curve control points inflate it slightly —
 * good enough for mapping an objectBoundingBox gradient, its only use. */
function opsBounds(ops: string[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const op of ops) {
    const numbers = (op.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    // `re` carries (x, y, w, h); every other op carries coordinate pairs.
    if (op.endsWith("re") && numbers.length === 4) {
      minX = Math.min(minX, numbers[0]);
      minY = Math.min(minY, numbers[1]);
      maxX = Math.max(maxX, numbers[0] + numbers[2]);
      maxY = Math.max(maxY, numbers[1] + numbers[3]);
      continue;
    }
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      minX = Math.min(minX, numbers[i]);
      maxX = Math.max(maxX, numbers[i]);
      minY = Math.min(minY, numbers[i + 1]);
      maxY = Math.max(maxY, numbers[i + 1]);
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function gradientStops(node: Element): ShadingStop[] {
  const stops: ShadingStop[] = [];
  for (const stop of Array.from(node.querySelectorAll("stop"))) {
    const color = rgb(stop.getAttribute("stop-color") ?? "#000");
    if (!color) continue;
    const offsetAttr = stop.getAttribute("offset") ?? "0";
    const offset = offsetAttr.endsWith("%")
      ? parseFloat(offsetAttr) / 100
      : parseFloat(offsetAttr);
    stops.push({ offset: Number.isFinite(offset) ? offset : 0, color });
  }
  return stops;
}

/**
 * Resolve a ``url(#id)`` paint to a shading resource, mapping an
 * objectBoundingBox gradient onto the shape's own box.
 */
function shadingFor(
  paint: string,
  root: Element,
  bounds: { x: number; y: number; w: number; h: number },
  env: InlineSvgEnv,
): string | null {
  const id = paint.match(/^url\(#([^)]+)\)$/)?.[1];
  if (!id) return null;
  const node = root.querySelector(`#${CSS.escape(id)}`);
  if (!node) return null;
  const stops = gradientStops(node);
  if (!stops.length) return null;
  const userSpace = node.getAttribute("gradientUnits") === "userSpaceOnUse";
  const mapX = (v: number) => (userSpace ? v : bounds.x + v * bounds.w);
  const mapY = (v: number) => (userSpace ? v : bounds.y + v * bounds.h);

  if (node.tagName.toLowerCase() === "radialgradient") {
    const cx = mapX(num(node.getAttribute("cx"), userSpace ? 0 : 0.5));
    const cy = mapY(num(node.getAttribute("cy"), userSpace ? 0 : 0.5));
    const r = num(node.getAttribute("r"), userSpace ? 0 : 0.5);
    const radius = userSpace ? r : r * Math.max(bounds.w, bounds.h);
    return env.pool.shading({ kind: "radial", cx, cy, r: radius, stops });
  }
  return env.pool.shading({
    kind: "axial",
    x0: mapX(num(node.getAttribute("x1"), 0)),
    y0: mapY(num(node.getAttribute("y1"), 0)),
    x1: mapX(num(node.getAttribute("x2"), userSpace ? 0 : 1)),
    y1: mapY(num(node.getAttribute("y2"), 0)),
    stops,
  });
}

/** Paint a built path with the resolved fill/stroke of the current style. */
function paintOps(
  path: string[],
  style: Style,
  root: Element,
  env: InlineSvgEnv,
): string[] {
  if (!path.length) return [];
  const fill = style.fill ?? "#000"; // SVG's initial fill really is black
  const stroke = style.stroke ?? "none";
  const strokeWidth = num(style["stroke-width"], 1);
  const strokePaint = stroke !== "none" && strokeWidth > 0 ? parsePaint(stroke) : null;
  const hasStroke = strokePaint !== null;
  const fillPaint = fill !== "none" && !fill.startsWith("url(") ? parsePaint(fill) : null;
  const hasFill = fill !== "none" && (fillPaint !== null || fill.startsWith("url("));
  if (!hasFill && !hasStroke) return [];

  const evenOdd = style["fill-rule"] === "evenodd";
  const ops: string[] = ["q"];

  const opacity = num(style.opacity, 1);
  const fillAlpha = opacity * num(style["fill-opacity"], 1) * (fillPaint?.alpha ?? 1);
  const strokeAlpha = opacity * num(style["stroke-opacity"], 1) * (strokePaint?.alpha ?? 1);
  if (fillAlpha < 1 || strokeAlpha < 1) {
    ops.push(`/${env.pool.alpha(fillAlpha, strokeAlpha)} gs`);
  }

  if (strokePaint) {
    ops.push(`${rgbOps(strokePaint.color)} RG`, `${fmt(strokeWidth)} w`);
    const cap = { butt: 0, round: 1, square: 2 }[style["stroke-linecap"] ?? "butt"] ?? 0;
    const join = { miter: 0, round: 1, bevel: 2 }[style["stroke-linejoin"] ?? "miter"] ?? 0;
    ops.push(`${cap} J`, `${join} j`);
    const dash = style["stroke-dasharray"];
    if (dash && dash !== "none") {
      ops.push(`[${parsePoints(dash).map(fmt).join(" ")}] 0 d`);
    }
  }

  // A gradient fill has no colour operator: clip to the path and run the shading.
  const gradient = fill.startsWith("url(")
    ? shadingFor(fill, root, opsBounds(path), env)
    : null;
  if (gradient) {
    ops.push("q", ...path, evenOdd ? "W* n" : "W n", `/${gradient} sh`, "Q");
    if (strokePaint) ops.push(...path, "S");
    ops.push("Q");
    return ops;
  }

  if (fillPaint) ops.push(`${rgbOps(fillPaint.color)} rg`);
  ops.push(...path);
  ops.push(
    fillPaint && strokePaint
      ? evenOdd
        ? "B*"
        : "B"
      : fillPaint
        ? evenOdd
          ? "f*"
          : "f"
        : "S",
    "Q",
  );
  return ops;
}

function textOps(node: Element, style: Style, env: InlineSvgEnv): string[] {
  const text = (node.textContent ?? "").trim();
  if (!text) return [];
  const fontSize = num(style["font-size"], 16);
  const weight = /bold/i.test(style["font-weight"] ?? "")
    ? 700
    : num(style["font-weight"], 400);
  const letterSpacing = num(style["letter-spacing"], 0);
  const synthetic: ExportElement = {
    fontFamily: (style["font-family"] ?? "Pretendard").split(",")[0].replace(/['"]/g, "").trim(),
    fontSize,
    fontWeight: weight,
    fontStyle: style["font-style"],
    // The measurement hook takes letterSpacing in em, like Canvas does.
    letterSpacing: fontSize ? letterSpacing / fontSize : 0,
  };
  const width = env.measure(synthetic, text);
  const anchor = style["text-anchor"];
  let x = num(node.getAttribute("x"), 0);
  if (anchor === "middle") x -= width / 2;
  else if (anchor === "end") x -= width;

  const color = rgb(style.fill ?? "#000") ?? [0, 0, 0];
  return [
    "q",
    `${rgbOps(color)} rg`,
    ...showTextOps({
      fontRes: env.pool.font({
        family: synthetic.fontFamily ?? "Pretendard",
        weight,
        italic: /italic/i.test(style["font-style"] ?? ""),
      }),
      fontSize,
      x,
      baseline: num(node.getAttribute("y"), 0),
      text,
      measure: (t) => env.measure(synthetic, t),
    }),
    "Q",
  ];
}

function nodeOps(node: Element, parent: Style, root: Element, env: InlineSvgEnv): string[] {
  const style = readStyle(node, parent);
  const tag = node.tagName.toLowerCase();

  switch (tag) {
    case "g": {
      const ops: string[] = ["q"];
      const opacity = num(node.getAttribute("opacity"), 1);
      if (opacity < 1) ops.push(`/${env.pool.alpha(opacity)} gs`);
      for (const child of Array.from(node.children)) {
        ops.push(...nodeOps(child, style, root, env));
      }
      ops.push("Q");
      return ops;
    }
    case "path":
      return paintOps(svgPathToPdf(node.getAttribute("d") ?? ""), style, root, env);
    case "rect":
      return paintOps(
        rectPath(
          num(node.getAttribute("x")),
          num(node.getAttribute("y")),
          num(node.getAttribute("width")),
          num(node.getAttribute("height")),
          num(node.getAttribute("rx")) || num(node.getAttribute("ry")),
        ),
        style,
        root,
        env,
      );
    case "circle": {
      const r = num(node.getAttribute("r"));
      return paintOps(
        ellipsePath(num(node.getAttribute("cx")), num(node.getAttribute("cy")), r, r),
        style,
        root,
        env,
      );
    }
    case "ellipse":
      return paintOps(
        ellipsePath(
          num(node.getAttribute("cx")),
          num(node.getAttribute("cy")),
          num(node.getAttribute("rx")),
          num(node.getAttribute("ry")),
        ),
        style,
        root,
        env,
      );
    case "line":
      return paintOps(
        polygonPath(
          [
            num(node.getAttribute("x1")),
            num(node.getAttribute("y1")),
            num(node.getAttribute("x2")),
            num(node.getAttribute("y2")),
          ],
          false,
        ),
        // A line has no interior; a stray inherited fill would paint a triangle.
        { ...style, fill: "none" },
        root,
        env,
      );
    case "polyline":
    case "polygon":
      return paintOps(
        polygonPath(parsePoints(node.getAttribute("points") ?? ""), tag === "polygon"),
        tag === "polyline" ? { ...style, fill: style.fill ?? "none" } : style,
        root,
        env,
      );
    case "text":
      return textOps(node, style, env);
    case "defs":
    case "lineargradient":
    case "radialgradient":
      return []; // referenced on demand, never drawn in place
    default:
      return [];
  }
}

/**
 * Place an inline SVG inside its element box: viewBox → box mapping (the
 * ``preserveAspectRatio`` our exporters use), then the drawing operators.
 * Returns null when the markup is not usable, so the caller can fall back to
 * embedding the icon as a bitmap.
 */
export function inlineSvgOps(
  markup: string,
  box: { x: number; y: number; width: number; height: number },
  fit: string,
  env: InlineSvgEnv,
): string[] | null {
  if (typeof DOMParser === "undefined") return null;
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = parsed.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") return null;

  const viewBox = parsePoints(root.getAttribute("viewBox") ?? "");
  const [vx, vy, vw, vh] =
    viewBox.length === 4
      ? viewBox
      : [0, 0, num(root.getAttribute("width")), num(root.getAttribute("height"))];
  if (!(vw > 0) || !(vh > 0)) return null;

  const sx = box.width / vw;
  const sy = box.height / vh;
  const scale =
    fit === "fill" ? null : fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
  const [scaleX, scaleY] = scale === null ? [sx, sy] : [scale, scale];
  // Centered, like the SVG exporter's xMidYMid.
  const tx = box.x + (box.width - vw * scaleX) / 2 - vx * scaleX;
  const ty = box.y + (box.height - vh * scaleY) / 2 - vy * scaleY;

  const ops: string[] = [
    "q",
    // `cover` can overflow the box, exactly as it does on the canvas.
    ...(fit === "cover"
      ? [`${fmt(box.x)} ${fmt(box.y)} ${fmt(box.width)} ${fmt(box.height)} re`, "W n"]
      : []),
    `${fmt(scaleX)} 0 0 ${fmt(scaleY)} ${fmt(tx)} ${fmt(ty)} cm`,
  ];
  const baseStyle = readStyle(root, {});
  for (const child of Array.from(root.children)) {
    ops.push(...nodeOps(child, baseStyle, root, env));
  }
  ops.push("Q");
  return ops;
}
