const COMMON_TEXT_RANGES: Array<[number, number]> = [
  [0x0009, 0x000d],
  [0x0020, 0x007e],
  [0x00a0, 0x00ff],
  [0x1100, 0x11ff],
  [0x2000, 0x206f],
  [0x20a0, 0x20cf],
  [0x2100, 0x214f],
  [0x2190, 0x21ff],
  [0x2460, 0x24ff],
  [0x2e80, 0x9fff],
  [0xac00, 0xd7af],
  [0xff01, 0xff60],
];

import { FONT_FAMILIES, matchFontFamily, type FontClass, type FontShape } from "./font-catalog";

const SUPPORTED_FONT_FAMILIES = new Set(FONT_FAMILIES);

function isVariationSelector(codePoint: number): boolean {
  return (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef);
}

function isSupportedCodePoint(codePoint: number): boolean {
  if (isVariationSelector(codePoint)) return false;
  return COMMON_TEXT_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

// 안 번들된 폰트명(Georgia, Playfair Display 등)은 렌더 시 FontLoadError로 500을 낸다.
// 번들 폰트로 매핑한다: serif 계열은 Noto Serif KR, 그 외는 Pretendard.
const _SERIF_HINT = /serif|times|georgia|playfair|garamond|merriweather|myeongjo|batang|명조|바탕/i;

const _FONT_CLASSES = new Set<string>(["gothic", "myeongjo", "handwriting", "display"]);
const _FONT_SHAPES = new Set<string>(["neutral", "round", "angular", "narrow", "pixel"]);

/**
 * 레퍼런스 추출이 넘기는 글씨 묘사("gothic/round" 같은 계열/형태 쌍)를 실제 패밀리로.
 * 추출 쪽은 우리 폰트 목록을 몰라도 되고, 폰트가 늘어도 추출은 그대로다.
 * 묘사가 아니면 null — 호출부가 기존 경로(패밀리명/serif 힌트)로 넘어간다.
 */
function familyFromTraitDescriptor(name: string): string | null {
  const [head, tail] = name.toLowerCase().split("/", 2);
  if (!_FONT_CLASSES.has(head)) return null;
  return matchFontFamily({
    class: head as FontClass,
    shape: tail && _FONT_SHAPES.has(tail) ? (tail as FontShape) : null,
  });
}

export function resolveFontFamily(family: string | null | undefined): string {
  const name = (family ?? "").trim();
  if (name && SUPPORTED_FONT_FAMILIES.has(name)) return name;
  const fromTraits = name ? familyFromTraitDescriptor(name) : null;
  if (fromTraits) return fromTraits;
  return _SERIF_HINT.test(name) ? "Noto Serif KR" : "Pretendard";
}

export function shouldUseEmojiFontForChar(family: string, char: string): boolean {
  if (!SUPPORTED_FONT_FAMILIES.has(family)) return false;
  const codePoint = char.codePointAt(0);
  return codePoint !== undefined && !isSupportedCodePoint(codePoint);
}

export function textRequiresEmojiFont(family: string, text: string): boolean {
  for (const char of text) {
    if (shouldUseEmojiFontForChar(family, char)) return true;
  }
  return false;
}

export function fontLoadSampleForText(
  family: string,
  text: string,
  fallback = "가Aa1",
): string {
  if (!SUPPORTED_FONT_FAMILIES.has(family)) return text.trim() || fallback;

  let sample = "";
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    if (isSupportedCodePoint(codePoint)) sample += char;
  }
  return sample.trim() || fallback;
}

export function findUnsupportedFontCodePoint(
  family: string,
  text: string,
): number | null {
  if (!SUPPORTED_FONT_FAMILIES.has(family)) return null;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    if (!isSupportedCodePoint(codePoint)) return codePoint;
  }
  return null;
}

export function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}
