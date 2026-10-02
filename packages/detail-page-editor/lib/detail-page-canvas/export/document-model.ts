// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * Loose structural types for walking a Canvas ``store.toJSON()`` document at
 * export time. Every field is optional because documents arrive from several
 * producers (decomposer bridge, live editor, older templates); exporters read
 * defensively and fall back element-by-element instead of failing the file.
 *
 * 그룹 자식은 페이지 좌표를 든 채 태어나고(그룹 x/y = 0), 그룹의 `x/y/rotation`은
 * **그 뒤로 옮기고 돌린 양**이다. 화면(Konva)은 그 양을 자식 전부에 먹이므로 내보내기도
 * 그룹 변환을 자식에 합성한다(`frame.ts`의 `elementMatrix`).
 */

export type ExportElement = {
  id?: string;
  name?: string;
  type?: string;
  subType?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  /** 상자 가운데를 축으로 좌우·상하 뒤집기(`@leviosa-ai/canvas/edit/rect`의 `flipArea`). */
  flipX?: boolean;
  flipY?: boolean;
  opacity?: number;
  visible?: boolean;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | string;
  fontStyle?: string;
  lineHeight?: number | string;
  letterSpacing?: number;
  align?: string;
  verticalAlign?: string;
  textDecoration?: string;
  src?: string;
  /** 사진 자르기 — 원본 크기에 대한 비율(`lib/detail-page/image-crop.ts`). */
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  stretchEnabled?: boolean;
  children?: ExportElement[];
  custom?: Record<string, unknown> | null;
};

export type ExportPage = {
  id?: string;
  name?: string;
  background?: string;
  width?: number | string;
  height?: number | string;
  children?: ExportElement[];
};

export type ExportDocument = {
  width?: number;
  height?: number;
  pages?: ExportPage[];
};

/** Numeric page height; Canvas may store "auto" strings on legacy docs. */
export function pageHeight(page: ExportPage, doc: ExportDocument): number {
  const h = Number(page.height);
  if (Number.isFinite(h) && h > 0) return Math.round(h);
  return Math.round(Number(doc.height) || 0);
}

export function documentWidth(doc: ExportDocument): number {
  const w = Number(doc.width);
  if (Number.isFinite(w) && w > 0) return Math.round(w);
  const first = Number(doc.pages?.[0]?.width);
  return Number.isFinite(first) && first > 0 ? Math.round(first) : 0;
}

/** Pages to export, preserving document order; no ids = all pages. */
export function selectPages(doc: ExportDocument, pageIds?: string[]): ExportPage[] {
  const pages = doc.pages ?? [];
  if (!pageIds?.length) return pages;
  const wanted = new Set(pageIds);
  return pages.filter((p) => p.id && wanted.has(p.id));
}
