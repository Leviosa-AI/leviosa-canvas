// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { lineHeightRatio } from "@leviosa-ai/canvas/render/attrs";
import {
  computeHighlightBands,
  type HighlightBand,
} from "@leviosa-ai/canvas/paint/text-highlight-bands";

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
 * 화면(`@leviosa-ai/canvas/render/element-view`의 TextBody)과 같은 규칙이다. 한 줄
 * 높이 상자(높이 ≤ 줄 높이 × 1.6)는 접지 않고 넘치게 두고, 나머지는 상자 폭에서 접는다.
 * 줄 수를 상자 높이로 자르거나 글자를 옆으로 눌러 담지 않는다 — 한때 60%까지 눌렀는데
 * 화면에는 그런 규칙이 없어서, 내보낸 파일만 글자가 좁아졌다.
 */
export function layoutText(el: ExportElement, measure: MeasureText): TextLayout {
  const width = Number(el.width) || 0;
  const height = Number(el.height) || 0;
  const text = transformText(el);
  const leading = resolveLeading(el);
  const singleLine = height <= leading * 1.6;
  const lines = singleLine ? text.split("\n") : wrapText(text, width, measure);
  const blockHeight = lines.length * leading;
  let offsetY = 0;
  if (el.verticalAlign === "middle") offsetY = (height - blockHeight) / 2;
  else if (el.verticalAlign === "bottom") offsetY = height - blockHeight;
  return { lines, leading, blockHeight, offsetY: Math.max(0, offsetY) };
}

/**
 * 형광펜 띠(`custom.highlightColor`) — 글자 **뒤에** 줄마다 하나씩, 상자 로컬 좌표.
 *
 * 화면(TextBody)이 부르는 `computeHighlightBands`를 같은 입력으로 부른다 — 줄 나눔과
 * 띠 모양을 여기서 다시 셈하면 화면과 갈라진다. 띠가 없으면 빈 배열.
 */
export function highlightBands(el: ExportElement): Array<HighlightBand & { color: string }> {
  const color = el.custom?.highlightColor;
  if (typeof color !== "string" || !color) return [];
  const fontSize = Number(el.fontSize) || 14;
  return computeHighlightBands({
    text: transformText(el),
    fontSize,
    fontFamily: el.fontFamily || "sans-serif",
    fontWeight: el.fontWeight ?? "normal",
    boxWidth: Number(el.width) || 0,
    lineHeightRatio: lineHeightRatio(el.lineHeight, fontSize),
    align: el.align || "left",
    color,
  }).map((band) => ({ ...band, color }));
}
