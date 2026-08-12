/**
 * 렌더러들이 공유하는 자잘한 것들.
 *
 * 여기서 만드는 props는 **Canvas 기본 요소**의 것뿐이다(``figure``/``text``/``svg``).
 * 새 타입을 만들지 않는 게 이 설계의 전부다 — 내보내기 4경로가 전부 ``el.type``
 * switch라서, 모르는 타입은 조용히 빠진다.
 *
 * ``figure``의 ``subType``도 내보내기가 아는 것만 쓴다: 기본 ``rect``와
 * ``circle``/``ellipse``(``export/svg.ts:220``, ``export/ai.ts:128``, ``export/raster.ts:65``).
 */

import { encodeSvgDataUri } from "../../../detail-page-canvas/export/svg";
// 글자 치수는 표와 같은 자를 쓴다(``spec-group/text-metrics``).
import {
  LINE_HEIGHT,
  estimateTextWidth,
  textHeight,
} from "../../spec-group/text-metrics";

import type { ChartNode, ChartStyle } from "../types";

export { LINE_HEIGHT, estimateTextWidth, textHeight };

export function rectNode(
  key: string,
  box: { x: number; y: number; width: number; height: number },
  fill: string,
  cornerRadius = 0,
): ChartNode {
  return {
    key,
    props: {
      type: "figure",
      subType: "rect",
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.max(0, Math.round(box.width)),
      height: Math.max(0, Math.round(box.height)),
      fill,
      cornerRadius: Math.round(cornerRadius),
    },
  };
}

export function textNode(
  key: string,
  box: { x: number; y: number; width: number },
  text: string,
  {
    style,
    fontSize,
    fill,
    align,
    fontWeight,
  }: {
    style: ChartStyle;
    fontSize: number;
    fill: string;
    align: "left" | "center" | "right";
    fontWeight: "400" | "500" | "700";
  },
): ChartNode {
  return {
    key,
    props: {
      type: "text",
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.max(1, Math.round(box.width)),
      height: textHeight(fontSize),
      text,
      fontSize,
      fontFamily: style.fontFamily,
      fontWeight,
      fill,
      align,
      lineHeight: LINE_HEIGHT,
      verticalAlign: "top",
    },
  };
}

export function circleNode(
  key: string,
  center: { x: number; y: number },
  radius: number,
  fill: string,
): ChartNode {
  return {
    key,
    props: {
      type: "figure",
      subType: "circle",
      x: Math.round(center.x - radius),
      y: Math.round(center.y - radius),
      width: Math.round(radius * 2),
      height: Math.round(radius * 2),
      fill,
      cornerRadius: 0,
    },
  };
}

/**
 * 곡선 기하(도넛·게이지·꺾은선)를 담는 ``svg`` 요소.
 *
 * **텍스트는 절대 여기에 넣지 않는다.** 스톡 편집기의 svg 요소는 ``<img>``로 래스터화되고,
 * ``<img>``로 로드된 SVG는 문서의 ``@font-face``를 못 받아 시스템 폰트로 떨어진다.
 * 그래서 글자는 언제나 네이티브 ``text`` 요소로 따로 얹는다.
 *
 * ``xmlns``는 반드시 넣는다 — 없으면 편집기의 색 치환이 파싱에서 깨진다.
 */
export function svgNode(
  key: string,
  box: { x: number; y: number; width: number; height: number },
  body: string,
): ChartNode {
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
  return {
    key,
    props: {
      type: "svg",
      src: encodeSvgDataUri(markup),
      x: Math.round(box.x),
      y: Math.round(box.y),
      width,
      height,
    },
  };
}

/** 도(degree) 위의 점. 0도는 3시 방향이라 위쪽에서 시작하려면 -90도로 넘긴다. */
export function polar(
  cx: number,
  cy: number,
  radius: number,
  degrees: number,
): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/**
 * 고리 조각(annulus sector)의 path.
 *
 * 한 바퀴를 다 채우면 SVG 호가 시작점과 끝점이 같아져 아무것도 안 그려진다.
 * 그래서 359.9도에서 자른다 — 눈으로는 완전한 고리와 구분되지 않는다.
 */
export function ringSlicePath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  startDeg: number,
  endDeg: number,
): string {
  const sweep = Math.min(359.9, Math.max(0, endDeg - startDeg));
  if (sweep <= 0) return "";
  const end = startDeg + sweep;
  const large = sweep > 180 ? 1 : 0;
  const o0 = polar(cx, cy, outer, startDeg);
  const o1 = polar(cx, cy, outer, end);
  const i1 = polar(cx, cy, inner, end);
  const i0 = polar(cx, cy, inner, startDeg);
  return [
    `M ${round(o0.x)} ${round(o0.y)}`,
    `A ${round(outer)} ${round(outer)} 0 ${large} 1 ${round(o1.x)} ${round(o1.y)}`,
    `L ${round(i1.x)} ${round(i1.y)}`,
    `A ${round(inner)} ${round(inner)} 0 ${large} 0 ${round(i0.x)} ${round(i0.y)}`,
    "Z",
  ].join(" ");
}

/** 점들을 잇는 폴리라인 ``d``. */
export function polylinePath(points: { x: number; y: number }[]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${round(p.x)} ${round(p.y)}`)
    .join(" ");
}

/** 범례 색 칩의 한 변. */
export const LEGEND_CHIP = 12;

/**
 * 시리즈가 여럿일 때 위에 얹는 가로 범례(칩 + 이름).
 *
 * 한 줄에만 놓는다 — 상세페이지 차트에서 시리즈가 서너 개를 넘어가는 일은 거의 없고,
 * 줄바꿈까지 얹으면 높이 계산이 폰트에 의존하게 된다.
 */
export function seriesLegend({
  names,
  colors,
  style,
  top,
}: {
  names: string[];
  colors: string[];
  style: ChartStyle;
  top: number;
}): { nodes: ChartNode[]; height: number } {
  if (names.length <= 1) return { nodes: [], height: 0 };
  const size = Math.round(style.labelSize * 0.9);
  const rowH = Math.max(textHeight(size), LEGEND_CHIP);
  const nodes: ChartNode[] = [];
  let cursor = 0;
  names.forEach((name, i) => {
    nodes.push(
      rectNode(
        `legend:chip:${i}`,
        {
          x: cursor,
          y: top + (rowH - LEGEND_CHIP) / 2,
          width: LEGEND_CHIP,
          height: LEGEND_CHIP,
        },
        colors[i] ?? style.mutedColor,
        3,
      ),
    );
    const textWidth = Math.max(24, estimateTextWidth(name, size) + 4);
    nodes.push(
      textNode(
        `legend:label:${i}`,
        {
          x: cursor + LEGEND_CHIP + 6,
          y: top + (rowH - textHeight(size)) / 2,
          width: textWidth,
        },
        name,
        {
          style,
          fontSize: size,
          fill: style.labelColor,
          align: "left",
          fontWeight: "400",
        },
      ),
    );
    cursor += LEGEND_CHIP + 6 + textWidth + 16;
  });
  return { nodes, height: rowH };
}

/** 막대 모서리는 두께의 절반을 못 넘는다(넘으면 Konva가 알약을 찌그러뜨린다). */
export function barRadius(style: ChartStyle, thickness: number): number {
  return Math.min(style.cornerRadius, thickness / 2);
}

/**
 * 값이 있는데 비율이 0에 가까워 막대가 사라지는 걸 막는 최소 길이.
 *
 * 0과 "아주 작은 값"이 똑같이 안 보이면 차트가 거짓말을 한다.
 */
export function visibleLength(length: number, ratio: number): number {
  if (ratio <= 0) return 0;
  return Math.max(2, length);
}
