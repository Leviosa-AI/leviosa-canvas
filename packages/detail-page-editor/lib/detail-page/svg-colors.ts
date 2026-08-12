/**
 * SVG 요소의 색을 **읽어 내는** 자리.
 *
 * 갈아 끼우는 쪽(`replaceSvgColors` / `colorsReplace`)은 렌더러에 이미 있었는데
 * **그 값을 쓰는 UI가 리포에 하나도 없었다.** 도형을 넣으면 소스 색 그대로 박제됐고,
 * 서식 복사로 다른 도형 색을 옮겨오는 우회로만 있었다. 우측 인스펙터에 색 구획을 세우려면
 * 먼저 "이 마크업에 어떤 색이 몇 개 있는가"를 알아야 해서 그 절반을 여기 둔다.
 *
 * 정규화·치환은 렌더러 것을 그대로 쓴다 — 판정이 갈리면 화면과 컨트롤이 다른 말을 한다.
 */

import { normalizeColor } from "@leviosa-ai/canvas/render/svg-source";

const COLOR_ATTRS = "fill|stroke|stop-color|flood-color|lighting-color";
const ATTR_RE = new RegExp(`\\b(?:${COLOR_ATTRS})\\s*=\\s*(["'])(.*?)\\1`, "gi");
const STYLE_DECL_RE = new RegExp(`\\b(?:${COLOR_ATTRS})\\s*:\\s*([^;"']+)`, "gi");

/** 색이 아닌 값들. 스와치로 내면 안 된다. */
const NOT_A_COLOR = new Set(["none", "transparent", "inherit", "unset", "initial"]);

function isColor(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  if (!value || NOT_A_COLOR.has(value)) return false;
  // `url(#grad)`는 그라데이션 참조지 색이 아니다.
  return !value.startsWith("url(");
}

/**
 * 마크업에 실제로 쓰인 색을 **등장 순서대로, 중복 없이** 뽑는다.
 *
 * 표기가 달라도(`#abc` / `#AABBCC` / `rgb(...)`) 같은 색이면 하나로 본다 —
 * 치환도 정규화해서 견주므로 스와치 하나가 두 표기를 한꺼번에 바꾼다.
 * `currentColor`는 그대로 남긴다: 색이 맞고, 삽입 시 구체 색으로 바뀐다(§`applyCurrentColor`).
 */
export function extractSvgColors(markup: string): string[] {
  if (!markup) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  const take = (raw: string) => {
    if (!isColor(raw)) return;
    const key = normalizeColor(raw);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  for (const match of markup.matchAll(ATTR_RE)) take(match[2]);
  for (const match of markup.matchAll(STYLE_DECL_RE)) take(match[1]);
  return out;
}

/**
 * `currentColor`를 구체 색으로 박는다.
 *
 * 모노크롬 아이콘 세트는 전부 `currentColor` 규약이다. 그런데 우리는 마크업을 data URI로
 * 담아 `<img>`로 그리므로 **문서의 색을 상속받지 못한다** — 넣는 순간 정해야 한다.
 * 구체 색으로 박아 두면 그 뒤로는 공용 도형·내 도형과 **같은 색 컨트롤**이 붙는다.
 */
export function applyCurrentColor(markup: string, color: string): string {
  if (!markup) return markup;
  return markup.replace(/currentColor/gi, color);
}

/**
 * 지금 화면에 보여 줄 색. `colorsReplace`에 바뀐 값이 있으면 그것, 없으면 원래 색.
 * 인스펙터의 스와치가 이 값을 쓴다.
 */
export function effectiveColor(
  original: string,
  replaced: Map<string, string>,
): string {
  return replaced.get(normalizeColor(original)) ?? original;
}
