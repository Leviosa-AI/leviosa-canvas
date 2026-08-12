/**
 * 편집기 도형(벡터) → 투명 PNG data URI.
 *
 * 도형을 GIF로 만들려면 이펙트 파이프라인에 픽셀을 줘야 한다. 서버에 SVG를 보내
 * 헤드리스 브라우저로 굽는 방법도 있지만, 색 치환(``colorsReplace``)과 그라데이션까지
 * 편집기와 똑같이 재현하려면 결국 렌더 규칙을 서버에 복제해야 한다. 브라우저는 이미
 * 그 규칙을 들고 있으므로 여기서 굽고 픽셀만 올린다.
 *
 * 도형은 두 종류다.
 *  - ``svg``: 마크업이 ``src``에 data URI로 들어 있다(색 치환은 ``colorsReplace``).
 *  - ``figure``: 네이티브 도형. 마크업이 없어 subType/치수에서 만들어 낸다
 *    (``leviosa-canvas/paint/figure-svg``가 화면과 같은 규칙으로 그린다).
 *
 * 배경은 투명하게 둔다 — GIF 인코더가 투명 소스를 알아보고 투명 배경 GIF로 굽는다.
 */

import { parseStops } from "../../components/detail-page/fill-control";
import { encodeSvgDataUri } from "../detail-page-canvas/export/svg";
import { figureToSvg } from "@leviosa-ai/canvas/paint/figure-svg";
import {
  ensureSvgNamespace,
  loadSvgMarkup,
  readColorReplace,
  replaceSvgColors,
} from "@leviosa-ai/canvas/render/svg-source";

export type ShapeElementLike = {
  type?: unknown;
  src?: unknown;
  width?: unknown;
  height?: unknown;
  fill?: unknown;
  stroke?: unknown;
  strokeWidth?: unknown;
  dash?: unknown;
  cornerRadius?: unknown;
  subType?: unknown;
  colorsReplace?: unknown;
  id?: unknown;
};

/** 굽는 해상도 배율. 편집기 좌표는 작아서 1배로 구우면 이펙트에서 뭉갠다. */
const RASTER_SCALE = 2;
/** 한 변 상한(서버 GIF 소스 상한과 렌더 시간 양쪽을 고려). */
const MAX_EDGE = 1400;

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** GIF로 구울 수 있는 도형인지(그룹·텍스트·이미지는 각자의 경로가 따로 있다). */
export function isShapeElement(
  el: ShapeElementLike | null | undefined,
): boolean {
  const type = String(el?.type ?? "");
  return type === "svg" || type === "figure";
}

/**
 * ``linear-gradient(...)`` 채우기를 SVG ``<linearGradient>``로 바꾼다.
 *
 * 방향은 스톡 편집기가 캔버스에 그릴 때 쓰는 규칙과 같다(``useColor``: CSS 각도 A의 진행
 * 방향이 ``(sin A, -cos A)``). 각도를 무시하면 편집기에서 가로로 흐르던 그라데이션이
 * GIF에서만 세로로 흐른다.
 *
 * 그라데이션이 아니면 ``null``(호출부가 색 문자열을 그대로 쓴다).
 */
export function gradientToSvgPaint(
  fill: unknown,
  id: string,
): { def: string; ref: string } | null {
  const parsed = parseStops(String(fill ?? ""));
  if (!parsed) return null;
  const rad = (parsed.angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = Math.cos(rad) / 2;
  const stops = parsed.stops
    .map(
      (stop) =>
        `<stop offset="${Math.round(stop.pos)}%" stop-color="${stop.color}"/>`,
    )
    .join("");
  return {
    def:
      `<linearGradient id="${id}" x1="${(0.5 - dx).toFixed(4)}" ` +
      `y1="${(0.5 + dy).toFixed(4)}" x2="${(0.5 + dx).toFixed(4)}" ` +
      `y2="${(0.5 - dy).toFixed(4)}">${stops}</linearGradient>`,
    ref: `url(#${id})`,
  };
}

/**
 * ``figureToSvg``가 만든 마크업의 그라데이션 채우기를 defs로 바꿔 끼운다.
 *
 * 그 함수는 ``fill``을 문자열 그대로 박기 때문에 ``linear-gradient(...)``가 무효한
 * paint가 되어 도형이 통째로 검게 굳는다.
 */
export function patchFigureGradient(
  markup: string,
  el: ShapeElementLike,
): string {
  const fill = String(el.fill ?? "");
  const paint = gradientToSvgPaint(fill, `dp-grad-${String(el.id ?? "shape")}`);
  if (!paint) return markup;
  const withDefs = markup.includes("<defs>")
    ? markup.replace("<defs>", `<defs>${paint.def}`)
    : markup.replace(/<svg([^>]*)>/, `<svg$1><defs>${paint.def}</defs>`);
  return withDefs.split(`fill="${fill}"`).join(`fill="${paint.ref}"`);
}

/**
 * 루트 ``<svg>``에 픽셀 크기를 못 박는다.
 *
 * ``<img>``로 SVG를 그릴 때 루트에 width/height가 없으면 브라우저가 기본 300×150을
 * 고유 크기로 잡는다. 그 상태로 다른 비율의 캔버스에 그리면 도형이 눌리거나 늘어난다
 * (viewBox만 있는 라이브러리 도형이 여기 해당한다).
 */
export function withExplicitSize(
  markup: string,
  width: number,
  height: number,
): string {
  const root = markup.match(/<svg\b[^>]*>/i);
  if (!root) return markup;
  const cleaned = root[0]
    .replace(/\swidth="[^"]*"/i, "")
    .replace(/\sheight="[^"]*"/i, "")
    .replace(/\spreserveAspectRatio="[^"]*"/i, "")
    .replace(
      /^<svg/i,
      `<svg width="${width}" height="${height}" preserveAspectRatio="none"`,
    );
  return markup.replace(root[0], cleaned);
}

/**
 * 도형 요소 → ``<img>``에 바로 물릴 수 있는 SVG data URI.
 *
 * 색 치환이 있는 svg 도형은 스톡 편집기의 ``replaceColors``가 이미 data URI를 돌려주므로
 * 마크업으로 되돌리지 않는다(되돌렸다 다시 인코딩하면 한글이 깨질 여지만 생긴다).
 */
export async function shapeSvgDataUri(
  el: ShapeElementLike,
): Promise<string | null> {
  const type = String(el.type ?? "");
  const width = num(el.width, 0);
  const height = num(el.height, 0);
  if (width <= 0 || height <= 0) return null;

  if (type === "figure") {
    const markup = figureToSvg({
      ...el,
      width,
      height,
      strokeWidth: num(el.strokeWidth, 0),
      cornerRadius: num(el.cornerRadius, 0),
      dash: Array.isArray(el.dash) ? el.dash : [],
    });
    if (!markup) return null;
    return encodeSvgDataUri(
      withExplicitSize(patchFigureGradient(markup, el), width, height),
    );
  }
  if (type !== "svg") return null;
  const src = String(el.src ?? "");
  if (!src) return null;

  const raw = await loadSvgMarkup(src);
  const sized = ensureSvgNamespace(withExplicitSize(raw, width, height));
  return encodeSvgDataUri(
    replaceSvgColors(sized, readColorReplace(el.colorsReplace)),
  );
}

/** SVG data URI를 투명 배경 PNG data URI로 굽는다. 실패하면 null. */
export async function rasterizeSvgDataUri(
  uri: string,
  width: number,
  height: number,
): Promise<string | null> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const scale = Math.min(RASTER_SCALE, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const image = await loadImage(uri);
  if (!image) return null;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function loadImage(uri: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    // data URI는 캔버스를 오염시키지 않는다(외부 호스트가 아니라 CORS도 없다).
    image.src = uri;
  });
}

/**
 * 선택 도형 → GIF 소스로 보낼 투명 PNG data URI.
 *
 * 도형이 아니거나 구울 수 없으면 ``null`` — 호출부가 안내를 띄운다.
 */
export async function shapeSourceImage(
  el: ShapeElementLike,
): Promise<string | null> {
  if (!isShapeElement(el)) return null;
  const uri = await shapeSvgDataUri(el);
  if (!uri) return null;
  return rasterizeSvgDataUri(uri, num(el.width, 0), num(el.height, 0));
}
