/**
 * 요소 JSON → Konva 속성.
 *
 * 여기가 자체 엔진의 첫 번째 배당금이다. 디컴포저는 스톡 편집기가 **읽을 수 없는** 장식을
 * `custom` 아래에 숨겨 두었고(`gradient`, `shadow`, `clipToRect`, `fontStyle`,
 * `strokeWidth`, `strokeColor`, `decoration`, `textTransform`), SDK 경로는 그걸
 * 렌더 가능한 형태로 승격하는 어댑터 897줄로 달래고 있었다.
 * 우리 렌더러는 그 필드들을 **그냥 읽는다.**
 *
 * CSS 파서(`parseCssGradient` 등)는 이미 우리가 쓴 순수 함수라 그대로 가져다 쓴다.
 * 엔진을 패키지로 떼어낼 때 같이 옮겨 온다.
 */

import {
  linearGradientKonvaProps,
  parseCssGradient,
  parseCssShadow,
  radialGradientKonvaProps,
  type ParsedGradient,
} from "../paint/konva-fallback";

import { asRecord, num, str, type Attrs } from "../types";

export type Box = { x: number; y: number; width: number; height: number };

export type ClipBox = Box & { radius: number };

export function boxOf(el: Attrs): Box {
  return {
    x: num(el, "x", 0),
    y: num(el, "y", 0),
    width: num(el, "width", 0),
    height: num(el, "height", 0),
  };
}

function customOf(el: Attrs): Attrs {
  return asRecord(el.custom);
}

/**
 * 디컴포저의 `lineHeight`를 배수로 환산한다. CSS px 문자열("48.4px"), 무단위
 * 비율("1.9"), 절대 px 숫자(48.4), 없음 — 넷 다 온다.
 *
 * Konva는 "48.4px"를 NaN으로 먹고 글자가 사라지거나 겹친다. 4보다 작으면 이미 비율로
 * 보고, 그보다 크면 절대 px로 보아 폰트 크기로 나눈다.
 */
export function lineHeightRatio(raw: unknown, fontSize: number): number {
  const size = fontSize > 0 ? fontSize : 1;
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? parseFloat(raw)
        : NaN;
  if (!Number.isFinite(value) || value <= 0) return 1.2;
  return value < 4 ? value : value / size;
}

/**
 * Konva의 `fontStyle`은 굵기와 기울기를 한 문자열에 담는다("italic 600").
 *
 * 기울기는 **문서의 `fontStyle`만** 본다. 디컴포저가 원본 CSS를 `custom.fontStyle`에도
 * 적어 두지만 그건 기록일 뿐 계약이 아니다 — 지금 팔리는 렌더러(Canvas)는 그 값을
 * 읽지 않고, 우리가 읽으면 오늘 나가는 그림에 없던 기울임이 생긴다(cremolab 표지
 * Didot 헤드라인). custom을 승격할지는 문서를 싣는 앱이 정할 일이지 렌더러가 정할 일이 아니다.
 */
export function konvaFontStyle(el: Attrs): string {
  const italic = str(el, "fontStyle") === "italic";
  const weightRaw = el.fontWeight;
  const weight =
    typeof weightRaw === "number" ? String(weightRaw) : str(el, "fontWeight");
  const numericWeight = Number(weight);
  const canvasWeight =
    weight === "bold" || weight === "normal"
      ? weight
      : Number.isFinite(numericWeight) && numericWeight >= 1 && numericWeight <= 1000
        ? weight
        : "normal";
  return [italic ? "italic" : "", canvasWeight]
    .filter(Boolean)
    .join(" ");
}

/** 밑줄/취소선. 디컴포저는 CSS `text-decoration`을 custom에 남긴다. */
export function textDecoration(el: Attrs): string {
  const native = str(el, "textDecoration");
  if (native) return native === "line-through" ? "line-through" : native;
  const css = str(customOf(el), "decoration");
  if (css.includes("line-through")) return "line-through";
  if (css.includes("underline")) return "underline";
  return "";
}

/** `text-transform: uppercase` 같은 CSS 변형을 실제 글자에 반영한다. */
export function displayText(el: Attrs): string {
  const text = str(el, "text");
  const transform = str(customOf(el), "textTransform");
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  return text;
}

/** 글자 테두리 — 네이티브가 있으면 그걸, 없으면 디컴포저가 custom에 남긴 값. */
export function textStroke(el: Attrs): { stroke?: string; strokeWidth?: number } {
  const custom = customOf(el);
  const width = num(el, "strokeWidth", num(custom, "strokeWidth", 0));
  if (width <= 0) return {};
  const color = str(el, "stroke") || str(custom, "strokeColor");
  return color ? { stroke: color, strokeWidth: width } : {};
}

/**
 * 칠. `fill`이 CSS 그라디언트 문자열이면 그것이 우선(편집기에서 사람이 지정한 것),
 * 아니면 디컴포저가 남긴 `custom.gradient`, 둘 다 없으면 단색이다.
 */
export function fillProps(el: Attrs, width: number, height: number): Attrs {
  const custom = customOf(el);
  const fill = el.fill;
  const gradient =
    parseCssGradient(fill) ?? parseCssGradient(custom.gradient) ?? null;
  if (gradient) return gradientProps(gradient, width, height);
  return typeof fill === "string" && fill ? { fill } : {};
}

export function gradientProps(
  gradient: ParsedGradient,
  width: number,
  height: number,
): Attrs {
  return gradient.type === "linear"
    ? { ...linearGradientKonvaProps(gradient, width, height) }
    : { ...radialGradientKonvaProps(gradient, width, height) };
}

/** 그림자 — 네이티브 `shadow*`가 있으면 그걸, 없으면 `custom.shadow`(CSS 문자열). */
export function shadowProps(el: Attrs): Attrs {
  if (el.shadowEnabled === true) {
    return {
      shadowEnabled: true,
      shadowColor: str(el, "shadowColor", "#000000"),
      shadowBlur: num(el, "shadowBlur", 0),
      shadowOffsetX: num(el, "shadowOffsetX", 0),
      shadowOffsetY: num(el, "shadowOffsetY", 0),
      shadowOpacity: num(el, "shadowOpacity", 1),
    };
  }
  const parsed = parseCssShadow(customOf(el).shadow);
  if (!parsed) return {};
  return {
    shadowEnabled: true,
    shadowColor: parsed.color,
    shadowBlur: parsed.blur,
    shadowOffsetX: parsed.offsetX,
    shadowOffsetY: parsed.offsetY,
  };
}

/** `custom.clipToRect` — 부모의 `overflow:hidden`을 디컴포저가 남긴 것. */
export function clipBox(el: Attrs): ClipBox | null {
  const rect = asRecord(customOf(el).clipToRect);
  const width = num(rect, "width", 0);
  const height = num(rect, "height", 0);
  if (width <= 0 || height <= 0) return null;
  return {
    x: num(rect, "x", 0),
    y: num(rect, "y", 0),
    width,
    height,
    radius: Math.max(0, num(rect, "radius", 0)),
  };
}

/**
 * `url("…")`에서 주소만. 그라디언트 같은 비-URL 값은 null.
 *
 * 따옴표 있는 쪽과 없는 쪽을 갈라서 읽는다. 한 식으로 합치면(`\s*(['"]?)(.*?)\1\s*\)`)
 * 따옴표가 없을 때 `url(` 뒤의 공백을 두 조각이 서로 가져갈 수 있어, 닫는 괄호가 없는
 * 긴 값에서 되짚기가 길이의 제곱으로 늘어난다. 값은 문서에서 그대로 들어온다.
 */
export function cssUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // 따옴표 안은 괄호도 반대쪽 따옴표도 품을 수 있다 — SVG data URI 가 그렇다.
  // 그래서 따옴표 종류마다 따로 본다. 하나로 묶어 되짚음(`(['"])…\1`)을 쓰면 그 안에
  // 반대쪽 따옴표를 못 넣는다.
  const doubled = value.match(/url\(\s*"([^"]*)"\s*\)/);
  if (doubled) return doubled[1] || null;
  const singled = value.match(/url\(\s*'([^']*)'\s*\)/);
  if (singled) return singled[1] || null;
  // 따옴표가 없으면 괄호도 못 품는다. `(` 를 받아 주면 `url(url(url(…` 에서 시작점마다
  // 닫는 괄호를 찾아 끝까지 훑는다 — 따옴표를 갈라 놓아도 여기서 다시 제곱이 된다.
  const bare = value.match(/url\(([^'"()]*)\)/);
  const inner = bare?.[1].trim();
  return inner || null;
}

/**
 * 이미지 주소. 비어 있으면 디컴포저가 남긴 목업 사진을 쓴다 — 빈 슬롯을 투명하게
 * 두면 편집기에서 "깨진 것"으로 읽힌다.
 */
export function imageSrc(el: Attrs): string {
  const src = str(el, "src");
  if (src) return src;
  return cssUrl(customOf(el).placeholderBgImage) ?? "";
}

/** 한 줄짜리 상자인가 — 그렇다면 줄바꿈을 시키면 안 된다. */
export function isSingleLineBox(el: Attrs): boolean {
  const fontSize = num(el, "fontSize", 14);
  const ratio = lineHeightRatio(el.lineHeight, fontSize);
  return num(el, "height", 0) <= fontSize * ratio * 1.6;
}

export function cornerRadius(el: Attrs): number {
  return num(el, "cornerRadius", num(customOf(el), "cornerRadius", 0));
}
