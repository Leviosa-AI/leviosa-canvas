import type { ExportElement } from "./document-model";

/**
 * Text layout shared by the PSD rasterizer and the Figma-compatible SVG
 * builder. Measurement is injected (canvas ``measureText`` in the browser, a
 * deterministic stub in tests) so the layout itself stays pure.
 */

export type MeasureText = (text: string) => number;

export type TextLayout = {
  lines: string[];
  /** Line pitch in px. */
  leading: number;
  blockHeight: number;
  /** Horizontal condensation applied when wrapping would overflow the box. */
  scaleX: number;
  /** Vertical offset of the first line produced by verticalAlign. */
  offsetY: number;
};

/** Normalize Canvas/decomposer font weights ('bold', '700', 700) to a number. */
export function normalizeFontWeight(el: ExportElement): number {
  const raw = el.fontWeight ?? el.fontStyle;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
    if (/bold/i.test(raw)) return 700;
  }
  return 400;
}

export function isItalic(el: ExportElement): boolean {
  const style = `${el.fontStyle ?? ""} ${String(el.custom?.fontStyle ?? "")}`;
  return /italic/i.test(style);
}

/** CSS font shorthand for canvas rendering of a text element. */
export function cssFont(el: ExportElement): string {
  const italic = isItalic(el) ? "italic " : "";
  const size = Number(el.fontSize) || 16;
  return `${italic}${normalizeFontWeight(el)} ${size}px ${el.fontFamily || "Pretendard"}`;
}

/** Apply custom.textTransform to the exported string. */
export function transformText(el: ExportElement): string {
  let text = String(el.text ?? "");
  const tt = el.custom?.textTransform;
  if (tt === "uppercase") text = text.toUpperCase();
  else if (tt === "lowercase") text = text.toLowerCase();
  return text;
}

/**
 * Resolve lineHeight to a pixel leading. Canvas uses a multiplier, but
 * decomposer artifacts may carry CSS values: 'normal', '32px', '1.4'.
 * Never returns NaN — a NaN here once leaked into PSD engineData.
 */
export function resolveLeading(el: ExportElement): number {
  const lh = el.lineHeight;
  const fontSize = Number(el.fontSize) || 16;
  if (typeof lh === "number" && Number.isFinite(lh)) return lh * fontSize;
  if (typeof lh === "string") {
    const v = lh.trim();
    if (v.endsWith("px")) {
      const px = parseFloat(v);
      if (Number.isFinite(px)) return px;
    } else if (v !== "normal") {
      const mult = parseFloat(v);
      if (Number.isFinite(mult)) return mult * fontSize;
    }
  }
  return 1.2 * fontSize; // CSS 'normal'
}

/**
 * Word-wrap text to fit ``maxWidth``, breaking long words (incl. CJK) by
 * character like Konva does.
 */
export function wrapText(text: string, maxWidth: number, measure: MeasureText): string[] {
  const lines: string[] = [];
  const breakByChar = (word: string): string => {
    let chunk = "";
    for (const ch of word) {
      if (measure(chunk + ch) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    return chunk;
  };
  for (const paragraph of String(text).split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (!word) continue;
      if (measure(line + word) <= maxWidth || line === "") {
        if (line === "" && measure(word) > maxWidth) line = breakByChar(word);
        else line += word;
      } else {
        lines.push(line.trimEnd());
        line = word.trimStart();
        if (line && measure(line) > maxWidth) line = breakByChar(line);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/**
 * Lay out a text element: wrapped lines, per-line leading, and the vertical
 * offset produced by verticalAlign within the element box.
 *
 * The decomposer sizes text boxes from DOM measurements, which can be a few
 * percent narrower than canvas metrics. The element height caps the line
 * count (round(h / leading)); when wrapping would exceed it, the text is
 * horizontally condensed (scaleX) until it fits, instead of overflowing onto
 * extra lines that overlap following elements.
 */
export function layoutText(el: ExportElement, measure: MeasureText): TextLayout {
  const width = Number(el.width) || 0;
  const height = Number(el.height) || 0;
  const text = transformText(el);
  const leading = resolveLeading(el);
  const maxLines = Math.max(1, Math.round(height / leading) || 1);
  let scaleX = 1;
  let lines = wrapText(text, width, measure);
  while (lines.length > maxLines && scaleX > 0.6) {
    scaleX = Math.round((scaleX - 0.02) * 100) / 100;
    lines = wrapText(text, width / scaleX, measure);
  }
  const blockHeight = lines.length * leading;
  let offsetY = 0;
  if (el.verticalAlign === "middle") offsetY = (height - blockHeight) / 2;
  else if (el.verticalAlign === "bottom") offsetY = height - blockHeight;
  return { lines, leading, blockHeight, scaleX, offsetY: Math.max(0, offsetY) };
}
