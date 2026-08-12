import catalogJson from "../../config/detail-page-fonts.json";

import type { FontTag } from "./font-tags";

export type DetailPageFontStyle = {
  weight: number;
  style: "normal" | "italic";
  format: "woff" | "woff2";
  url: string;
};

export type DetailPageFont = {
  id: string;
  family: string;
  label: string;
  labelEn: string;
  /** 피커 칩이 거르는 분류. 한 폰트가 여러 개를 가진다. */
  tags: FontTag[];
  /** 한글 글리프가 없는 라틴 전용 폰트 — 한글에 쓰면 시스템 폰트로 폴백한다. */
  latinOnly?: boolean;
  previewText: string;
  previewWeight: number;
  licenseName: string;
  licenseUrl: string;
  licenseNoteKey?: string;
  styles: DetailPageFontStyle[];
};

type CanvasFontStyle = {
  src: string;
  fontStyle?: string;
  fontWeight?: string;
};

export type FontCatalogStore = {
  fonts?: Array<{
    fontFamily: string;
    styles?: unknown;
  }>;
  addFont?: (font: {
    fontFamily: string;
    styles: CanvasFontStyle[];
  }) => void;
};

export const DETAIL_PAGE_FONTS = catalogJson as DetailPageFont[];

const byFamily = new Map(
  DETAIL_PAGE_FONTS.map((font) => [font.family, font] as const),
);
const loadPromises = new Map<string, Promise<DetailPageFontStyle>>();

export function getDetailPageFont(family: string): DetailPageFont | undefined {
  return byFamily.get(family);
}

export function normalizeFontWeight(weight: unknown): number {
  if (weight === "bold") return 700;
  if (weight === "normal" || weight == null) return 400;
  const parsed = Number(weight);
  return Number.isFinite(parsed) ? parsed : 400;
}

export function getDetailPageFontWeights(font: DetailPageFont): number[] {
  return [...new Set(font.styles.map((style) => style.weight))].sort(
    (a, b) => a - b,
  );
}

export function closestDetailPageFontWeight(
  font: DetailPageFont,
  requested: unknown,
): number {
  const target = normalizeFontWeight(requested);
  return getDetailPageFontWeights(font).reduce((best, weight) =>
    Math.abs(weight - target) < Math.abs(best - target) ? weight : best,
  );
}

export function resolveDetailPageFontStyle(
  font: DetailPageFont,
  weight: unknown,
  style: string,
): DetailPageFontStyle {
  const requestedWeight = normalizeFontWeight(weight);
  const sameStyle = font.styles.filter((candidate) => candidate.style === style);
  const candidates = sameStyle.length ? sameStyle : font.styles;
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.weight - requestedWeight) <
    Math.abs(best.weight - requestedWeight)
      ? candidate
      : best,
  );
}

function asCanvasStyle(style: DetailPageFontStyle): CanvasFontStyle {
  return {
    src: `url("${style.url}") format("${style.format}")`,
    fontStyle: style.style,
    fontWeight: String(style.weight),
  };
}

function registerStoreFont(
  store: FontCatalogStore | undefined,
  font: DetailPageFont,
  loadedStyle: DetailPageFontStyle,
) {
  if (!store?.addFont) return;
  const existing = store.fonts?.find(
    (candidate) => candidate.fontFamily === font.family,
  );
  const previous = Array.isArray(existing?.styles)
    ? (existing.styles as CanvasFontStyle[])
    : [];
  const next = asCanvasStyle(loadedStyle);
  const styles = previous.filter(
    (style) =>
      !(
        style.fontStyle === next.fontStyle &&
        String(style.fontWeight) === next.fontWeight
      ),
  );
  styles.push(next);
  store.addFont({ fontFamily: font.family, styles });
}

/**
 * Loads only the selected family/style/weight. The picker itself uses static
 * WebP assets, so opening or searching the list never downloads font bytes.
 */
export async function loadDetailPageFont({
  family,
  weight,
  style = "normal",
  sample = "",
  store,
}: {
  family: string;
  weight: unknown;
  style?: string;
  sample?: string;
  store?: FontCatalogStore;
}): Promise<DetailPageFontStyle | null> {
  const font = getDetailPageFont(family);
  if (!font || typeof document === "undefined" || typeof FontFace === "undefined") {
    return null;
  }
  const source = resolveDetailPageFontStyle(font, weight, style);
  const key = `${font.family}\n${source.style}\n${source.weight}`;
  let promise = loadPromises.get(key);
  if (!promise) {
    promise = new FontFace(
      font.family,
      `url("${source.url}") format("${source.format}")`,
      {
        style: source.style,
        weight: String(source.weight),
        display: "swap",
      },
    )
      .load()
      .then(async (face) => {
        document.fonts.add(face);
        await document.fonts.load(
          `${source.style} ${source.weight} 24px "${font.family}"`,
          sample || font.previewText,
        );
        return source;
      });
    loadPromises.set(key, promise);
    promise.catch(() => loadPromises.delete(key));
  }
  const loaded = await promise;
  registerStoreFont(store, font, loaded);
  return loaded;
}
