/**
 * 가로 막대 — 상세페이지에서 가장 많이 쓰는 형태.
 *
 * 한 행 = 라벨(왼쪽) · 값(오른쪽) 한 줄 + 그 아래 꽉 찬 막대. 템플릿의 벤치마크 섹션
 * (``F-digital-compat/.../benchmark``)이 손으로 그리던 구조 그대로이고, 다른 점은
 * **막대 길이가 값에서 나온다**는 것 하나다.
 */

import { formatChartValue } from "../format";
import { itemColor, ratioOf, type ResolvedChart } from "../normalize";
import type { ChartNode, ChartRender, ChartSpec } from "../types";
import { barRadius, rectNode, textHeight, textNode, visibleLength } from "./shared";

/** 라벨이 차지하는 가로 비율. 나머지가 값 칸이다. */
const LABEL_RATIO = 0.62;

export function renderBarH(spec: ChartSpec, resolved: ResolvedChart): ChartRender {
  const { style, options } = spec;
  const width = spec.frame.width;
  const values = resolved.series[0]?.values ?? [];
  const nodes: ChartNode[] = [];

  const labelH = textHeight(style.labelSize);
  const valueH = textHeight(style.valueSize);
  const headH = Math.max(labelH, valueH);
  const rowH = headH + style.labelGap + style.barSize;
  const radius = barRadius(style, style.barSize);
  const labelWidth = options.showValue ? width * LABEL_RATIO : width;

  resolved.labels.forEach((label, i) => {
    const top = i * (rowH + style.gap);
    const value = values[i] ?? null;
    const ratio = ratioOf(value, resolved.max);
    const barTop = top + headH + style.labelGap;
    const color = itemColor(spec, i, resolved.highlightIndex);

    if (style.showTrack) {
      nodes.push(
        rectNode(
          `track:${i}`,
          { x: 0, y: barTop, width, height: style.barSize },
          style.trackColor,
          radius,
        ),
      );
    }
    nodes.push(
      rectNode(
        `bar:${i}`,
        {
          x: 0,
          y: barTop,
          width: visibleLength(width * ratio, ratio),
          height: style.barSize,
        },
        color,
        radius,
      ),
    );
    nodes.push(
      textNode(
        `label:${i}`,
        { x: 0, y: top + (headH - labelH) / 2, width: labelWidth },
        label,
        {
          style,
          fontSize: style.labelSize,
          fill: style.labelColor,
          align: "left",
          fontWeight: "500",
        },
      ),
    );
    if (options.showValue) {
      nodes.push(
        textNode(
          `value:${i}`,
          {
            x: labelWidth,
            y: top + (headH - valueH) / 2,
            width: width - labelWidth,
          },
          formatChartValue(value, {
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
  const height =
    rows > 0 ? rows * rowH + (rows - 1) * style.gap : Math.round(rowH);
  return { nodes, size: { width, height: Math.round(height) } };
}
