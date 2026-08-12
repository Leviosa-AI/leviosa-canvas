/**
 * 누적 막대 — 항목별 구성(성분 비중, 비용 구성)을 나란히 견준다.
 *
 * 축은 항목별 **합**으로 잡히므로(``resolveChart``) 가장 큰 기둥이 플롯을 꽉 채운다.
 * 값 라벨은 조각마다 붙이지 않고 기둥 위에 합계 하나만 얹는다 — 조각 안에 숫자를 넣으면
 * 얇은 조각에서 글자가 삐져나온다.
 */

import { formatChartValue } from "../format";
import { ratioOf, type ResolvedChart } from "../normalize";
import type { ChartNode, ChartRender, ChartSpec } from "../types";
import { barRadius, rectNode, seriesLegend, textHeight, textNode } from "./shared";

/** 칸 폭 대비 기둥이 차지하는 비율(명시적으로 더 두꺼운 값을 주면 그쪽을 따른다). */
const COLUMN_FILL = 0.6;

export function renderStack(spec: ChartSpec, resolved: ResolvedChart): ChartRender {
  const { style, options } = spec;
  const width = spec.frame.width;
  const count = Math.max(1, resolved.labels.length);
  const nodes: ChartNode[] = [];

  const seriesColors = resolved.series.map(
    (_, i) =>
      style.palette[i % Math.max(1, style.palette.length)] ?? style.mutedColor,
  );
  const legend = seriesLegend({
    names: resolved.series.map((s) => s.name),
    colors: seriesColors,
    style,
    top: 0,
  });
  nodes.push(...legend.nodes);

  const valueH = textHeight(style.valueSize);
  const labelH = textHeight(style.labelSize);
  const headH =
    (legend.height > 0 ? legend.height + style.labelGap : 0) +
    (options.showValue ? valueH + style.labelGap : 0);
  const plotTop = headH;
  const plotBottom = plotTop + style.plotSize;

  const colWidth = (width - style.gap * (count - 1)) / count;
  const barWidth = Math.min(colWidth, Math.max(style.barSize, colWidth * COLUMN_FILL));
  const radius = barRadius(style, barWidth);

  resolved.labels.forEach((label, i) => {
    const colX = i * (colWidth + style.gap);
    const barX = colX + (colWidth - barWidth) / 2;
    let total = 0;
    let bottom = plotBottom;

    if (style.showTrack) {
      nodes.push(
        rectNode(
          `track:${i}`,
          { x: barX, y: plotTop, width: barWidth, height: style.plotSize },
          style.trackColor,
          radius,
        ),
      );
    }

    resolved.series.forEach((series, s) => {
      const value = series.values[i];
      if (value === null || value <= 0) return;
      total += value;
      const height = style.plotSize * ratioOf(value, resolved.max);
      bottom -= height;
      nodes.push(
        rectNode(
          `bar:${s}:${i}`,
          { x: barX, y: bottom, width: barWidth, height },
          seriesColors[s],
          // 조각마다 모서리를 둥글리면 기둥이 끊겨 보인다. 맨 위 조각만 둥글린다.
          s === resolved.series.length - 1 ? radius : 0,
        ),
      );
    });

    if (options.showValue) {
      nodes.push(
        textNode(
          `value:${i}`,
          { x: colX, y: bottom - style.labelGap - valueH, width: colWidth },
          formatChartValue(total > 0 ? total : null, {
            decimals: options.decimals,
            unit: options.unit,
          }),
          {
            style,
            fontSize: style.valueSize,
            fill: style.valueColor,
            align: "center",
            fontWeight: "700",
          },
        ),
      );
    }

    nodes.push(
      textNode(
        `label:${i}`,
        { x: colX, y: plotBottom + style.labelGap, width: colWidth },
        label,
        {
          style,
          fontSize: style.labelSize,
          fill: style.labelColor,
          align: "center",
          fontWeight: "400",
        },
      ),
    );
  });

  return {
    nodes,
    size: { width, height: Math.round(plotBottom + style.labelGap + labelH) },
  };
}
