/**
 * Loose structural types for walking a Canvas ``store.toJSON()`` document at
 * export time. Every field is optional because documents arrive from several
 * producers (decomposer bridge, live editor, older templates); exporters read
 * defensively and fall back element-by-element instead of failing the file.
 *
 * Group children use ABSOLUTE page coordinates (both the decomposer bridge and
 * Canvas itself serialize them that way), so exporters never accumulate a
 * group offset.
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
