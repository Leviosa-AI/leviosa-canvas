/**
 * 도넛 — 구성비(성분, 만족도 비중)에 쓴다.
 *
 * 고리만 ``svg`` 하나로 그리고, 가운데 수치와 아래 범례는 전부 네이티브 텍스트다.
 * 글자를 SVG 안에 넣으면 폰트가 시스템 폰트로 떨어진다.
 */

import { formatChartValue } from "../format";
import { itemColor, type ResolvedChart } from "../normalize";
import type { ChartNode, ChartRender, ChartSpec } from "../types";
import {
  rectNode,
  ringSlicePath,
  svgNode,
  textHeight,
  textNode,
} from "./shared";

/** 범례 색 칩의 한 변. */
const CHIP = 12;

export function renderDonut(spec: ChartSpec, resolved: ResolvedChart): ChartRender {
  const { style, options } = spec;
  const width = spec.frame.width;
  const values = resolved.series[0]?.values ?? [];
  const nodes: ChartNode[] = [];

  const diameter = Math.max(60, Math.min(width, style.plotSize));
  const thickness = Math.max(style.barSize, Math.round(diameter * 0.08));
  const cx = diameter / 2;
  const cy = diameter / 2;
  const outer = diameter / 2;
  const inner = Math.max(4, outer - thickness);

  const total = values.reduce<number>(
    (sum, value) => sum + Math.max(0, value ?? 0),
    0,
  );

  // 고리: 값이 하나도 없으면 트랙만 남겨 "빈 차트"로 보이게 한다.
  const pieces: string[] = [];
  if (style.showTrack || total <= 0) {
    pieces.push(
      `<path d="${ringSlicePath(cx, cy, outer, inner, -90, 270)}" fill="${style.trackColor}"/>`,
    );
  }
  if (total > 0) {
    let cursor = -90;
    values.forEach((value, i) => {
      const share = Math.max(0, value ?? 0) / total;
      if (share <= 0) return;
      const end = cursor + share * 360;
      pieces.push(
        `<path d="${ringSlicePath(cx, cy, outer, inner, cursor, end)}" fill="${itemColor(
          spec,
          i,
          resolved.highlightIndex,
        )}"/>`,
      );
      cursor = end;
    });
  }
  nodes.push(
    svgNode(
      "ring",
      { x: (width - diameter) / 2, y: 0, width: diameter, height: diameter },
      pieces.join(""),
    ),
  );

  // 가운데: 주목할 항목 하나의 값과 이름. 강조가 없으면 첫 항목.
  const focus = resolved.highlightIndex ?? 0;
  const centerSize = Math.round(style.valueSize * 1.6);
  const centerH = textHeight(centerSize);
  const labelH = textHeight(style.labelSize);
  if (resolved.labels.length > 0) {
    const block = centerH + labelH;
    nodes.push(
      textNode(
        "center:value",
        {
          x: (width - diameter) / 2,
          y: cy - block / 2,
          width: diameter,
        },
        formatChartValue(values[focus] ?? null, {
          decimals: options.decimals,
          unit: options.unit,
        }),
        {
          style,
          fontSize: centerSize,
          fill: style.valueColor,
          align: "center",
          fontWeight: "700",
        },
      ),
    );
    nodes.push(
      textNode(
        "center:label",
        {
          x: (width - diameter) / 2,
          y: cy - block / 2 + centerH,
          width: diameter,
        },
        resolved.labels[focus] ?? "",
        {
          style,
          fontSize: style.labelSize,
          fill: style.labelColor,
          align: "center",
          fontWeight: "400",
        },
      ),
    );
  }

  // 범례: 칩 · 이름 · 값. 도넛은 조각 위에 글자를 얹으면 금세 읽기 어려워진다.
  const rowH = Math.max(labelH, textHeight(style.valueSize));
  const rowGap = Math.round(style.gap / 2);
  const legendTop = diameter + style.gap;
  resolved.labels.forEach((label, i) => {
    const top = legendTop + i * (rowH + rowGap);
    nodes.push(
      rectNode(
        `chip:${i}`,
        {
          x: 0,
          y: top + (rowH - CHIP) / 2,
          width: CHIP,
          height: CHIP,
        },
        itemColor(spec, i, resolved.highlightIndex),
        3,
      ),
    );
    nodes.push(
      textNode(
        `label:${i}`,
        { x: CHIP + 8, y: top + (rowH - labelH) / 2, width: width * 0.6 },
        label,
        {
          style,
          fontSize: style.labelSize,
          fill: style.labelColor,
          align: "left",
          fontWeight: "400",
        },
      ),
    );
    if (options.showValue) {
      nodes.push(
        textNode(
          `value:${i}`,
          {
            x: width * 0.6 + CHIP + 8,
            y: top + (rowH - textHeight(style.valueSize)) / 2,
            width: width * 0.4 - CHIP - 8,
          },
          formatChartValue(values[i] ?? null, {
            decimals: options.decimals,
            unit: options.unit,
          }),
          {
            style,
            fontSize: style.valueSize,
            fill: style.valueColor,
            align: "right",
            fontWeight: "700",
          },
        ),
      );
    }
  });

  const rows = resolved.labels.length;
  const legendHeight = rows > 0 ? rows * rowH + (rows - 1) * rowGap : 0;
  return {
    nodes,
    size: {
      width,
      height: Math.round(diameter + (rows > 0 ? style.gap + legendHeight : 0)),
    },
  };
}
