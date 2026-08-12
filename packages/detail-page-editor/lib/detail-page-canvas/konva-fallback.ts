export type CanvasFallbackElementKind = "text" | "image" | "rect" | "unknown";

export type GradientStop = { offset: number; color: string };

/**
 * A CSS gradient parsed into the values Konva needs. ``linear`` keeps the CSS
 * angle (0deg = upward, clockwise); ``radial`` keeps the focal point as a
 * 0..1 fraction of the element box.
 */
export type ParsedGradient =
  | { type: "linear"; angle: number; stops: GradientStop[] }
  | { type: "radial"; cx: number; cy: number; stops: GradientStop[] };

/** A CSS box-shadow parsed for Konva (spread is dropped — Konva has none). */
export type ParsedShadow = {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
};

/** The rectangle a decorative element is clipped to (overflow:hidden parent). */
export type ClipRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

export type CanvasFallbackElement = {
  id: string;
  kind: CanvasFallbackElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  src: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  rotation: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  lineHeight: number;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  /** Canvas text badge background (decomposer emits these in pixels). */
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundPadding: number;
  backgroundCornerRadius: number;
  /**
   * A CSS gradient highlight behind the text (decomposer's
   * ``custom.backgroundGradient``, e.g. a highlighter band drawn with
   * ``linear-gradient(transparent 60%, <color> 60%)``). the stock editor's solid
   * ``backgroundColor`` cannot express it, so it is carried separately and
   * painted as a gradient-filled rect behind the glyphs.
   */
  backgroundGradient: ParsedGradient | null;
  /**
   * A user "marker" highlight (``custom.highlightColor``): painted as one band per
   * wrapped line hugging that line's glyph width, not a single box. Owns the
   * highlight instead of native ``backgroundEnabled`` so loose line-heights don't
   * merge wrapped lines into a solid block.
   */
  highlightColor: string | null;
  slot: string;
  /** Native-renderable decoration the Canvas SDK ignores (carried in custom). */
  cornerRadius: number;
  gradient: ParsedGradient | null;
  shadow: ParsedShadow | null;
  clipToRect: ClipRect | null;
};

export type CanvasFallbackPage = {
  id: string;
  width: number;
  height: number;
  background: string;
  elements: CanvasFallbackElement[];
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeAlign(value: unknown): CanvasFallbackElement["align"] {
  return value === "center" || value === "right" ? value : "left";
}

function normalizeVerticalAlign(
  value: unknown,
): CanvasFallbackElement["verticalAlign"] {
  // The decomposer emits the stock editor's "center"; Konva's name for it is "middle".
  if (value === "middle" || value === "center") return "middle";
  if (value === "bottom") return "bottom";
  return "top";
}

function normalizeKind(element: UnknownRecord): CanvasFallbackElementKind {
  if (element.type === "text") return "text";
  if (element.type === "image") return "image";
  if (element.type === "figure" && element.subType === "rect") return "rect";
  if (element.type === "svg" && finiteString(element.src)) return "image";
  return "unknown";
}

/** Split on a separator that is not nested inside parentheses (e.g. rgb(…)). */
function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** "rgb(255, 0, 0) 55%" -> { color, offset: 0.55 } (offset null when absent). */
function parseColorStopToken(token: string): {
  color: string;
  offset: number | null;
} {
  const match = token.match(/\s(-?\d+(?:\.\d+)?)%\s*$/);
  if (match && match.index !== undefined) {
    return {
      color: token.slice(0, match.index).trim(),
      offset: parseFloat(match[1]) / 100,
    };
  }
  return { color: token.trim(), offset: null };
}

/** Spread color stops evenly across 0..1 when CSS omits explicit positions. */
function distributeStops(
  raw: Array<{ color: string; offset: number | null }>,
): GradientStop[] {
  const usable = raw.filter((stop) => stop.color);
  const count = usable.length;
  return usable.map((stop, index) => ({
    color: stop.color,
    offset: stop.offset ?? (count <= 1 ? 0 : index / (count - 1)),
  }));
}

/** Map a CSS linear-gradient direction (angle or keywords) to degrees. */
function parseLinearAngle(direction: string): number {
  const degMatch = direction.match(/(-?\d+(?:\.\d+)?)deg/);
  if (degMatch) return parseFloat(degMatch[1]);
  const dir = direction.toLowerCase();
  const has = (keyword: string) => dir.includes(keyword);
  if (has("top") && has("right")) return 45;
  if (has("bottom") && has("right")) return 135;
  if (has("bottom") && has("left")) return 225;
  if (has("top") && has("left")) return 315;
  if (has("right")) return 90;
  if (has("bottom")) return 180;
  if (has("left")) return 270;
  if (has("top")) return 0;
  return 180;
}

/**
 * Split a possibly-layered CSS gradient value into its individual
 * ``linear-gradient(...)``/``radial-gradient(...)`` functions. A compound value
 * like ``radial-gradient(…), linear-gradient(…)`` (a radial glow over a linear
 * base) must NOT be split on its top-level commas — those also separate colour
 * stops — so we walk balanced parentheses and take one whole function per layer.
 * Non-gradient layers (e.g. ``url(...)``) end the scan.
 */
function splitGradientLayers(value: string): string[] {
  const layers: string[] = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && (value[i] === "," || /\s/.test(value[i]))) i += 1;
    const head = value.slice(i).match(/^(?:linear|radial)-gradient\(/i);
    if (!head) break;
    const open = i + head[0].length - 1; // index of the "("
    let depth = 1;
    let j = open + 1;
    for (; j < value.length; j += 1) {
      const char = value[j];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    layers.push(value.slice(i, j + 1));
    i = j + 1;
  }
  return layers;
}

/** Parse a single ``linear-gradient``/``radial-gradient`` function for Konva. */
function parseSingleGradient(trimmed: string): ParsedGradient | null {
  const linear = trimmed.match(/^linear-gradient\((.*)\)$/);
  if (linear) {
    const args = splitTopLevel(linear[1], ",");
    if (!args.length) return null;
    let angle = 180;
    let stopTokens = args;
    if (/deg\s*$/.test(args[0]) || /^to\s/i.test(args[0])) {
      angle = parseLinearAngle(args[0]);
      stopTokens = args.slice(1);
    }
    const stops = distributeStops(stopTokens.map(parseColorStopToken));
    if (!stops.length) return null;
    return { type: "linear", angle, stops };
  }

  const radial = trimmed.match(/^radial-gradient\((.*)\)$/);
  if (radial) {
    const args = splitTopLevel(radial[1], ",");
    if (!args.length) return null;
    let cx = 0.5;
    let cy = 0.5;
    let stopTokens = args;
    const first = args[0];
    const isShape =
      /(circle|ellipse|closest|farthest|\bat\b)/i.test(first) &&
      !/^(rgb|rgba|hsl|hsla|#)/i.test(first);
    if (isShape) {
      const at = first.match(/at\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/i);
      if (at) {
        cx = parseFloat(at[1]) / 100;
        cy = parseFloat(at[2]) / 100;
      }
      stopTokens = args.slice(1);
    }
    const stops = distributeStops(stopTokens.map(parseColorStopToken));
    if (!stops.length) return null;
    return { type: "radial", cx, cy, stops };
  }

  return null;
}

/**
 * Parse every gradient layer of a CSS value, foreground-first (CSS paints the
 * first-listed layer on top). Empty when the value is not a gradient.
 */
export function parseCssGradientLayers(value: unknown): ParsedGradient[] {
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  return splitGradientLayers(trimmed)
    .map(parseSingleGradient)
    .filter((gradient): gradient is ParsedGradient => gradient !== null);
}

/** Parse the first CSS gradient layer for Konva (see ``parseCssGradientLayers``). */
export function parseCssGradient(value: unknown): ParsedGradient | null {
  return parseCssGradientLayers(value)[0] ?? null;
}

/** Konva radial-gradient fill props for a parsed gradient in a w×h box. */
export function radialGradientKonvaProps(
  gradient: Extract<ParsedGradient, { type: "radial" }>,
  width: number,
  height: number,
): {
  fillRadialGradientStartPoint: { x: number; y: number };
  fillRadialGradientStartRadius: number;
  fillRadialGradientEndPoint: { x: number; y: number };
  fillRadialGradientEndRadius: number;
  fillRadialGradientColorStops: Array<number | string>;
} {
  const cx = gradient.cx * width;
  const cy = gradient.cy * height;
  const endRadius = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy),
  );
  return {
    fillRadialGradientStartPoint: { x: cx, y: cy },
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndPoint: { x: cx, y: cy },
    fillRadialGradientEndRadius: endRadius,
    fillRadialGradientColorStops: gradient.stops.flatMap((stop) => [
      stop.offset,
      stop.color,
    ]),
  };
}

/** Konva linear-gradient fill props for a parsed gradient in a w×h box. */
export function linearGradientKonvaProps(
  gradient: Extract<ParsedGradient, { type: "linear" }>,
  width: number,
  height: number,
): {
  fillLinearGradientStartPoint: { x: number; y: number };
  fillLinearGradientEndPoint: { x: number; y: number };
  fillLinearGradientColorStops: Array<number | string>;
} {
  // CSS angle: 0deg points up, increasing clockwise. Project it across the box.
  const radians = (gradient.angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const length = Math.abs(width * dx) + Math.abs(height * dy);
  const cx = width / 2;
  const cy = height / 2;
  return {
    fillLinearGradientStartPoint: {
      x: cx - (dx * length) / 2,
      y: cy - (dy * length) / 2,
    },
    fillLinearGradientEndPoint: {
      x: cx + (dx * length) / 2,
      y: cy + (dy * length) / 2,
    },
    fillLinearGradientColorStops: gradient.stops.flatMap((stop) => [
      stop.offset,
      stop.color,
    ]),
  };
}

/** Parse a CSS ``box-shadow`` (color may lead or trail) for Konva. */
export function parseCssShadow(value: unknown): ParsedShadow | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "none") return null;
  const colorMatch = trimmed.match(
    /(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8})/,
  );
  const color = colorMatch ? colorMatch[0] : "#000000";
  const rest = colorMatch ? trimmed.replace(colorMatch[0], " ") : trimmed;
  const lengths = (rest.match(/-?\d+(?:\.\d+)?px/g) ?? []).map((token) =>
    parseFloat(token),
  );
  if (!lengths.length) return null;
  const [offsetX = 0, offsetY = 0, blur = 0] = lengths;
  return { color, offsetX, offsetY, blur };
}

/** Read the ``custom.clipToRect`` payload into a usable clip rectangle. */
function parseClipRect(value: unknown): ClipRect | null {
  const rect = asRecord(value);
  if (!Object.keys(rect).length) return null;
  const width = finiteNumber(rect.width, 0);
  const height = finiteNumber(rect.height, 0);
  if (width <= 0 || height <= 0) return null;
  return {
    x: finiteNumber(rect.x, 0),
    y: finiteNumber(rect.y, 0),
    width,
    height,
    radius: Math.max(0, finiteNumber(rect.radius, 0)),
  };
}

function flattenElements(elements: unknown[]): UnknownRecord[] {
  const flattened: UnknownRecord[] = [];
  for (const candidate of elements) {
    const element = asRecord(candidate);
    if (!Object.keys(element).length) continue;
    flattened.push(element);
    flattened.push(...flattenElements(asArray(element.children)));
  }
  return flattened;
}

export function normalizeCanvasJsonForKonva(json: unknown): CanvasFallbackPage[] {
  const root = asRecord(json);
  const rootWidth = finiteNumber(root.width, 750);
  const rootHeight = finiteNumber(root.height, 900);
  const rootBackground = finiteString(
    root.background ?? root.backgroundColor,
    "#ffffff",
  );
  const pages = asArray(root.pages).map((candidate, pageIndex) => {
    const page = asRecord(candidate);
    const width = finiteNumber(page.width, rootWidth);
    const height = finiteNumber(page.height, rootHeight);
    const background = finiteString(
      page.background ?? page.backgroundColor,
      rootBackground,
    );
    const elements = flattenElements(asArray(page.children)).map(
      (element, elementIndex): CanvasFallbackElement => {
        const custom = asRecord(element.custom);
        const widthValue = Math.max(1, finiteNumber(element.width, 1));
        const heightValue = Math.max(1, finiteNumber(element.height, 1));
        return {
          id: finiteString(element.id, `page-${pageIndex + 1}-element-${elementIndex + 1}`),
          kind: normalizeKind(element),
          x: finiteNumber(element.x, 0),
          y: finiteNumber(element.y, 0),
          width: widthValue,
          height: heightValue,
          text: finiteString(element.text),
          src: finiteString(element.src),
          fill: finiteString(
            element.fill ?? element.backgroundColor,
            element.type === "text" ? "#111111" : "#f5f5f5",
          ),
          stroke: finiteString(element.stroke, "#d4d4d4"),
          strokeWidth: finiteNumber(element.strokeWidth, 0),
          opacity: Math.max(0, Math.min(1, finiteNumber(element.opacity, 1))),
          rotation: finiteNumber(element.rotation, 0),
          fontSize: Math.max(6, finiteNumber(element.fontSize, 24)),
          fontFamily: finiteString(element.fontFamily, "Pretendard"),
          fontWeight: String(element.fontWeight ?? element.fontStyle ?? "normal"),
          lineHeight: Math.max(0.5, finiteNumber(element.lineHeight, 1.2)),
          align: normalizeAlign(element.align),
          verticalAlign: normalizeVerticalAlign(element.verticalAlign),
          backgroundEnabled: element.backgroundEnabled === true,
          backgroundColor: finiteString(element.backgroundColor, "#000000"),
          backgroundPadding: Math.max(0, finiteNumber(element.backgroundPadding, 0)),
          backgroundCornerRadius: Math.max(
            0,
            finiteNumber(element.backgroundCornerRadius, 0),
          ),
          backgroundGradient: parseCssGradient(custom.backgroundGradient),
          highlightColor:
            typeof custom.highlightColor === "string" && custom.highlightColor
              ? custom.highlightColor
              : null,
          slot: finiteString(custom.leviosaSlot),
          cornerRadius: Math.max(0, finiteNumber(element.cornerRadius, 0)),
          gradient: parseCssGradient(custom.gradient),
          shadow: parseCssShadow(custom.shadow),
          clipToRect: parseClipRect(custom.clipToRect),
        };
      },
    );
    return {
      id: finiteString(page.id, `page-${pageIndex + 1}`),
      width,
      height,
      background,
      elements,
    };
  });

  if (pages.length) return pages;
  return [
    {
      id: "page-1",
      width: rootWidth,
      height: rootHeight,
      background: rootBackground,
      elements: [],
    },
  ];
}
