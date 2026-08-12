/**
 * 꺾은선 — 시간에 따른 변화(사용 주차별 개선, 월별 판매).
 *
 * 선만 ``svg`` 하나로 그리고 점은 네이티브 원(figure), 글자는 네이티브 텍스트다.
 * 시리즈가 여럿이면 위에 범례가 붙고, 값 라벨은 한 시리즈일 때만 붙인다 — 여러 줄의
 * 값이 점 위에 겹치면 아무것도 안 읽힌다.
 */

import { formatChartValue } from "../format";
import { itemColor, ratioOf, type ResolvedChart } from "../normalize";
import type { ChartNode, ChartRender, ChartSpec } from "../types";
import {
  circleNode,
  polylinePath,
  seriesLegend,
  svgNode,
  textHeight,
  textNode,
} from "./shared";

export function renderLine(spec: ChartSpec, resolved: ResolvedChart): ChartRender {
  const { style, options } = spec;
  const width = spec.frame.width;
  const nodes: ChartNode[] = [];
  const count = resolved.labels.length;
  const single = resolved.series.length <= 1;

  const seriesColors = resolved.series.map((_, i) =>
    single
      ? (style.palette[0] ?? style.mutedColor)
      : (style.palette[i % Math.max(1, style.palette.length)] ?? style.mutedColor),
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
  const showValues = single && options.showValue;
  const headH =
    (legend.height > 0 ? legend.height + style.labelGap : 0) +
    (showValues ? valueH + style.labelGap : 0);
  const plotTop = headH;
  const plotBottom = plotTop + style.plotSize;

  // 점이 프레임 모서리에서 반쪽으로 잘리지 않게 양쪽을 조금 비운다.
  const dot = Math.max(3, Math.round(style.barSize / 3));
  const pad = dot + 4;
  const span = Math.max(1, width - pad * 2);
  const xAt = (i: number) =>
    count <= 1 ? width / 2 : pad + (span * i) / (count - 1);
  const yAt = (value: number | null) =>
    plotBottom - style.plotSize * ratioOf(value, resolved.max);

  const paths = resolved.series
    .map((series, s) => {
      const points = series.values
        .map((value, i) => ({ value, point: { x: xAt(i), y: yAt(value) } }))
        .filter((entry) => entry.value !== null)
        .map((entry) => entry.point);
      if (points.length < 2) return "";
      return `<path d="${polylinePath(points)}" fill="none" stroke="${
        seriesColors[s]
      }" stroke-width="${Math.max(2, Math.round(style.barSize / 4))}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  nodes.push(
    svgNode(
      "line",
      { x: 0, y: plotTop, width, height: style.plotSize },
      // path 좌표는 플롯 상단 기준이라 svg 안에서 다시 0으로 내린다.
      `<g transform="translate(0 ${-plotTop})">${paths}</g>`,
    ),
  );

  resolved.series.forEach((series, s) => {
    series.values.forEach((value, i) => {
      if (value === null) return;
      nodes.push(
        circleNode(`dot:${s}:${i}`, { x: xAt(i), y: yAt(value) }, dot, seriesColors[s]),
      );
    });
  });

  if (showValues) {
    const values = resolved.series[0]?.values ?? [];
    values.forEach((value, i) => {
      const slot = count <= 1 ? width : span / Math.max(1, count - 1);
      nodes.push(
        textNode(
          `value:${i}`,
          {
            x: xAt(i) - slot / 2,
            y: yAt(value) - style.labelGap - valueH,
            width: slot,
          },
          formatChartValue(value, {
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
    });
  }

  resolved.labels.forEach((label, i) => {
    const slot = count <= 1 ? width : span / Math.max(1, count - 1);
    nodes.push(
      textNode(
        `label:${i}`,
        {
          x: xAt(i) - slot / 2,
          y: plotBottom + style.labelGap,
          width: slot,
        },
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
