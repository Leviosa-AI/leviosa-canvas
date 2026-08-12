/**
 * 좌측 패널 썸네일용 SVG.
 *
 * 별도 이미지 자산을 만들지 않고 **같은 렌더러 출력**을 SVG로 옮긴다. 그래서 프리셋을
 * 고치면 썸네일이 저절로 따라오고, 카탈로그와 실제 결과가 어긋날 일이 없다(차트와 같다).
 */

import { renderTable } from "./render";
import type { TableSpec } from "./types";

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

function nodeMarkup(props: Record<string, unknown>): string {
  const x = num(props.x);
  const y = num(props.y);
  if (props.type === "figure") {
    const radius = num(props.cornerRadius);
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
    const value = str(props.text);
    if (!value) return "";
    const width = num(props.width);
    const size = num(props.fontSize, 12);
    const align = str(props.align, "left");
    const anchor = align === "right" ? "end" : align === "center" ? "middle" : "start";
    const anchorX = align === "right" ? x + width : align === "center" ? x + width / 2 : x;
    // SVG는 baseline 기준이라 한 줄 높이의 약 0.85를 내려 앉힌다(썸네일 근사치).
    // 썸네일은 한 줄만 보여 준다 — 접힌 줄까지 그리면 칸 높이 계산을 두 벌 갖게 된다.
    const firstLine = value.split("\n")[0];
    return `<text x="${anchorX}" y="${y + size * 0.85}" font-size="${size}" text-anchor="${anchor}" font-weight="${escapeXml(
      str(props.fontWeight, "400"),
    )}" fill="${escapeXml(str(props.fill, "#000"))}">${escapeXml(firstLine)}</text>`;
  }
  return "";
}

/** 스펙을 그대로 그린 미리보기 SVG 마크업. */
export function tablePreviewSvg(spec: TableSpec): string {
  const { nodes, size } = renderTable(spec);
  const body = nodes.map((node) => nodeMarkup(node.props)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}" width="${size.width}" height="${size.height}"><g font-family="sans-serif">${body}</g></svg>`;
}
