/**
 * 좌측 패널 썸네일용 SVG.
 *
 * 별도 이미지 자산을 만들지 않고 **같은 렌더러 출력**을 SVG로 옮긴다. 그래서 프리셋을
 * 고치면 썸네일이 저절로 따라오고, 카탈로그와 실제 결과가 어긋날 일이 없다.
 *
 * 여기서 만드는 SVG는 화면 미리보기 전용이라 편집기 캔버스에 들어가지 않는다 —
 * ``<img>``로 로드된 SVG는 페이지 폰트를 못 받지만, 썸네일에서는 문제되지 않는다.
 */

import { decodeSvgDataUri } from "../../detail-page-canvas/export/svg";

import { renderChart } from "./render";
import type { ChartSpec } from "./types";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** 렌더 노드 하나를 SVG 조각으로. */
function nodeMarkup(props: Record<string, unknown>): string {
  const x = num(props.x);
  const y = num(props.y);
  if (props.type === "svg") {
    // 곡선 기하(도넛 고리·게이지 호·꺾은선)는 이미 SVG다. 루트에 x/y만 얹어 그 자리에
    // 중첩한다(중첩 ``<svg>``는 자기 viewBox를 들고 있어 크기가 그대로 유지된다).
    const inner = decodeSvgDataUri(str(props.src));
    if (!inner) return "";
    return inner.replace(/^<svg\s/, `<svg x="${x}" y="${y}" `);
  }
  if (props.type === "figure") {
    const radius = num(props.cornerRadius);
    // 카드 테두리는 stroke로 그린다 — 안 실으면 썸네일에서 프레임이 사라진다.
    const strokeWidth = num(props.strokeWidth);
    const stroke =
      strokeWidth > 0 && typeof props.stroke === "string"
        ? ` stroke="${escapeXml(props.stroke)}" stroke-width="${strokeWidth}"`
        : "";
    return `<rect x="${x}" y="${y}" width="${num(props.width)}" height="${num(
      props.height,
    )}" rx="${radius}" ry="${radius}" fill="${escapeXml(
      str(props.fill, "#000"),
    )}"${stroke}/>`;
  }
  if (props.type === "text") {
    const text = str(props.text);
    if (!text) return "";
    const width = num(props.width);
    const size = num(props.fontSize, 12);
    const align = str(props.align, "left");
    const anchor = align === "right" ? "end" : align === "center" ? "middle" : "start";
    const anchorX = align === "right" ? x + width : align === "center" ? x + width / 2 : x;
    // SVG는 baseline 기준이라 한 줄 높이의 약 0.8을 내려 앉힌다(썸네일 근사치).
    return `<text x="${anchorX}" y="${y + size * 0.85}" font-size="${size}" text-anchor="${anchor}" font-weight="${escapeXml(
      str(props.fontWeight, "400"),
    )}" fill="${escapeXml(str(props.fill, "#000"))}">${escapeXml(text)}</text>`;
  }
  return "";
}

/** 스펙을 그대로 그린 미리보기 SVG 마크업. */
export function chartPreviewSvg(spec: ChartSpec): string {
  const { nodes, size } = renderChart(spec);
  const body = nodes.map((node) => nodeMarkup(node.props)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}" width="${size.width}" height="${size.height}"><g font-family="sans-serif">${body}</g></svg>`;
}
