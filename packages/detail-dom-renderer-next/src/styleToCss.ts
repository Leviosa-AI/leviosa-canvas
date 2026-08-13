import type { CSSProperties } from "react";

import type { DpnextScalar } from "../../detail-document-next/src";

const STYLE_KEYS = new Set([
  "background", "color", "fontFamily", "fontSize", "fontWeight", "lineHeight",
  "letterSpacing", "textAlign", "border", "borderRadius", "boxShadow", "opacity",
  "objectFit", "objectPosition", "overflow", "transform", "fill", "stroke", "strokeWidth",
]);

function size(value: DpnextScalar | undefined): string | number | undefined {
  return typeof value === "number" ? value : typeof value === "string" ? value : undefined;
}

export function styleToCss(
  layout: Record<string, DpnextScalar> = {},
  style: Record<string, DpnextScalar> = {},
): CSSProperties {
  const css: Record<string, string | number | undefined> = {};
  const mode = layout.mode;
  if (mode === "stack" || mode === "row") {
    css.display = "flex";
    css.flexDirection = mode === "stack" ? "column" : "row";
  } else if (mode === "grid") {
    css.display = "grid";
    if (typeof layout.columns === "number") {
      css.gridTemplateColumns = `repeat(${layout.columns}, minmax(0, 1fr))`;
    }
  } else if (mode === "overlay") {
    css.display = "grid";
  } else if (mode === "absolute") {
    css.position = "absolute";
  }
  css.width = size(layout.width);
  css.height = size(layout.height);
  css.minWidth = size(layout.minWidth);
  css.maxWidth = size(layout.maxWidth);
  css.minHeight = size(layout.minHeight);
  css.maxHeight = size(layout.maxHeight);
  css.gap = size(layout.gap);
  css.margin = Array.isArray(layout.margin) ? layout.margin.map(size).join("px ") + "px" : size(layout.margin);
  css.padding = Array.isArray(layout.padding) ? layout.padding.map(size).join("px ") + "px" : size(layout.padding);
  css.alignItems = typeof layout.align === "string" ? layout.align : undefined;
  css.justifyContent = typeof layout.justify === "string" ? layout.justify : undefined;
  css.aspectRatio = size(layout.aspectRatio);
  css.left = size(layout.x);
  css.top = size(layout.y);
  css.zIndex = typeof layout.zIndex === "number" ? layout.zIndex : undefined;
  if (mode === "overlay") {
    css.position = "relative";
  }
  for (const [key, value] of Object.entries(style)) {
    if (STYLE_KEYS.has(key) && (typeof value === "string" || typeof value === "number")) {
      css[key] = value;
    }
  }
  return css as CSSProperties;
}
