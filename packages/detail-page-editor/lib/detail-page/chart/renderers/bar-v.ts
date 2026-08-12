/**
 * 세로 막대 — 항목 수가 적고 라벨이 짧을 때(연차 비교, 3~5개 스펙 대비).
 *
 * 값은 막대 **바로 위**에 앉힌다. 위쪽에 값 한 줄 높이를 미리 비워 두므로, 막대가
 * 플롯을 꽉 채워도 값이 프레임 밖으로 나가지 않는다.
 *
 * ``style.plot``이 있으면 판 크롬(기둥 밴드·눈금선·축선·눈금 라벨)을 함께 그린다.
 * 브랜드 상세페이지의 막대그래프가 그 모양이고, 지금은 그 좌표를 손으로 계산해 통짜
 * SVG로 굽고 있다. 여기서는 ``resolved.max`` 하나에서 전부 나오므로 **수치를 고치면
 * 막대·눈금선·눈금 라벨이 같이 따라간다** — 축이 거짓말을 할 수가 없다.
 */

import { formatChartValue } from "../format";
import { itemColor, ratioOf, type ResolvedChart } from "../normalize";
import type { ChartNode, ChartRender, ChartSpec } from "../types";
import {
  barRadius,
  estimateTextWidth,
  rectNode,
  textHeight,
  textNode,
  visibleLength,
} from "./shared";

export function renderBarV(spec: ChartSpec, resolved: ResolvedChart): ChartRender {
  const { style, options } = spec;
  const values = resolved.series[0]?.values ?? [];
  const count = Math.max(1, resolved.labels.length);
  const chrome = style.plot;
  const ticks = chrome?.ticks ?? null;

  // 눈금 라벨은 플롯 **왼쪽 바깥**에 앉으므로 그만큼 판을 오른쪽으로 민다.
  const gutter = ticks ? Math.max(0, ticks.gutter) : 0;
  const width = spec.frame.width;
  const plotWidth = Math.max(1, width - gutter);

  const labelH = textHeight(style.labelSize);
  const valueH = textHeight(style.valueSize);
  // 단위 캡("(%)")은 눈금 맨 위보다 더 위에 앉는다.
  const capH = ticks && ticks.unitCap ? textHeight(ticks.size) + 4 : 0;
  const headH = options.showValue ? valueH + style.labelGap : 0;
  const plotTop = Math.max(headH, capH);
  const plotBottom = plotTop + style.plotSize;

  const colWidth = (plotWidth - style.gap * (count - 1)) / count;
  // 가로형의 ``barSize``(막대 두께)를 세로형에 그대로 쓰면 젓가락처럼 얇아진다.
  // 칸 폭의 60%를 바닥으로 깔되, 더 두꺼운 값을 명시하면 그쪽을 따른다.
  const barWidth = Math.min(colWidth, Math.max(style.barSize, colWidth * 0.6));
  const radius = barRadius(style, barWidth);

  const chromeNodes: ChartNode[] = [];
  const nodes: ChartNode[] = [];

  // ── 판 크롬 ───────────────────────────────────────────────────────────────
  if (chrome?.bands) {
    resolved.labels.forEach((_label, i) => {
      const colX = gutter + i * (colWidth + style.gap);
      chromeNodes.push(
        rectNode(
          `band:${i}`,
          { x: colX, y: plotTop, width: colWidth, height: style.plotSize },
          chrome.bands as string,
        ),
      );
    });
  }

  if (chrome?.grid && chrome.grid.count > 0) {
    const steps = chrome.grid.count;
    // 0선은 축선이 대신 그으므로 위쪽 눈금만 긋는다.
    for (let i = 0; i < steps; i += 1) {
      const y = plotTop + (style.plotSize * i) / steps;
      chromeNodes.push(
        rectNode(
          `grid:${i}`,
          { x: gutter, y, width: plotWidth, height: 1 },
          chrome.grid.color,
        ),
      );
    }
  }

  if (chrome?.axis) {
    const thickness = Math.max(1, chrome.axis.width);
    chromeNodes.push(
      rectNode(
        "axis:y",
        { x: gutter, y: plotTop, width: thickness, height: style.plotSize },
        chrome.axis.color,
      ),
      rectNode(
        "axis:x",
        { x: gutter, y: plotBottom, width: plotWidth, height: thickness },
        chrome.axis.color,
      ),
    );
  }

  if (ticks) {
    const steps = chrome?.grid?.count ?? 4;
    const labelWidth = Math.max(16, gutter - 8);
    for (let i = 0; i <= steps; i += 1) {
      const value = (resolved.max * i) / steps;
      const y = plotBottom - (style.plotSize * i) / steps;
      chromeNodes.push(
        textNode(
          `tick:${i}`,
          { x: 0, y: y - textHeight(ticks.size) / 2, width: labelWidth },
          formatChartValue(value, { decimals: options.decimals }),
          {
            style,
            fontSize: ticks.size,
            fill: ticks.color,
            align: "right",
            fontWeight: "400",
          },
        ),
      );
    }
    if (ticks.unitCap) {
      chromeNodes.push(
        textNode(
          "tick:cap",
          {
            x: 0,
            y: plotTop - textHeight(ticks.size) - 4,
            width: Math.max(labelWidth, estimateTextWidth(ticks.unitCap, ticks.size)),
          },
          ticks.unitCap,
          {
            style,
            fontSize: ticks.size,
            fill: ticks.color,
            align: "right",
            fontWeight: "400",
          },
        ),
      );
    }
  }

  // ── 막대 ─────────────────────────────────────────────────────────────────
  resolved.labels.forEach((label, i) => {
    const colX = gutter + i * (colWidth + style.gap);
    const barX = colX + (colWidth - barWidth) / 2;
    const value = values[i] ?? null;
    const ratio = ratioOf(value, resolved.max);
    const barH = visibleLength(style.plotSize * ratio, ratio);
    const barTop = plotBottom - barH;
    const color = itemColor(spec, i, resolved.highlightIndex);

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
    nodes.push(
      rectNode(
        `bar:${i}`,
        { x: barX, y: barTop, width: barWidth, height: barH },
        color,
        radius,
      ),
    );
    if (options.showValue) {
      nodes.push(
        textNode(
          `value:${i}`,
          { x: colX, y: barTop - style.labelGap - valueH, width: colWidth },
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
          fontWeight: "500",
        },
      ),
    );
  });

  return {
    // 크롬이 먼저 = 막대 뒤에 깔린다.
    nodes: [...chromeNodes, ...nodes],
    size: {
      width,
      height: Math.round(plotBottom + style.labelGap + labelH),
    },
  };
}
