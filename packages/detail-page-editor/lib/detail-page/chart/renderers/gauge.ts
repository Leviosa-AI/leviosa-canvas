/**
 * 게이지 — 값 하나를 최댓값 대비로 보여준다(만족도, 달성률, 개선율).
 *
 * 항목이 여러 개면 강조 항목(없으면 첫 항목) 하나만 그린다. 나머지 데이터는 스펙에
 * 그대로 남아 있어서 종류를 되돌리면 살아난다.
 */

import { formatChartValue } from "../format";
import { itemColor, ratioOf, type ResolvedChart } from "../normalize";
import type { ChartNode, ChartRender, ChartSpec } from "../types";
import { ringSlicePath, svgNode, textHeight, textNode } from "./shared";

export function renderGauge(spec: ChartSpec, resolved: ResolvedChart): ChartRender {
  const { style, options } = spec;
  const width = spec.frame.width;
  const values = resolved.series[0]?.values ?? [];
  const index = resolved.highlightIndex ?? 0;
  const value = values[index] ?? null;
  const ratio = ratioOf(value, resolved.max);
  const nodes: ChartNode[] = [];

  // 반원이라 지름은 프레임 폭에, 높이는 그 절반에 맞춘다.
  const diameter = Math.max(80, Math.min(width, style.plotSize * 1.6));
  const thickness = Math.max(style.barSize, Math.round(diameter * 0.09));
  const cx = diameter / 2;
  const cy = diameter / 2;
  const outer = diameter / 2;
  const inner = Math.max(4, outer - thickness);
  const left = (width - diameter) / 2;

  const pieces: string[] = [];
  if (style.showTrack) {
    pieces.push(
      `<path d="${ringSlicePath(cx, cy, outer, inner, 180, 360)}" fill="${style.trackColor}"/>`,
    );
  }
  if (ratio > 0) {
    pieces.push(
      `<path d="${ringSlicePath(cx, cy, outer, inner, 180, 180 + ratio * 180)}" fill="${itemColor(
        spec,
        index,
        resolved.highlightIndex,
      )}"/>`,
    );
  }
  // 반원만 쓰므로 SVG 상자도 위 절반만 잡는다(아래 빈 공간이 레이아웃을 밀지 않게).
  nodes.push(
    svgNode(
      "arc",
      { x: left, y: 0, width: diameter, height: Math.ceil(diameter / 2) },
      pieces.join(""),
    ),
  );

  const valueSize = Math.round(style.valueSize * 1.6);
  const valueH = textHeight(valueSize);
  const labelH = textHeight(style.labelSize);
  const arcHeight = Math.ceil(diameter / 2);

  nodes.push(
    textNode(
      "center:value",
      { x: left, y: arcHeight - valueH, width: diameter },
      formatChartValue(value, {
        decimals: options.decimals,
        unit: options.unit,
      }),
      {
        style,
        fontSize: valueSize,
        fill: style.valueColor,
        align: "center",
        fontWeight: "700",
      },
    ),
  );
  nodes.push(
    textNode(
      "center:label",
      { x: left, y: arcHeight + style.labelGap, width: diameter },
      resolved.labels[index] ?? "",
      {
        style,
        fontSize: style.labelSize,
        fill: style.labelColor,
        align: "center",
        fontWeight: "400",
      },
    ),
  );

  return {
    nodes,
    size: { width, height: Math.round(arcHeight + style.labelGap + labelH) },
  };
}
