/**
 * 텍스트 GIF 요청에 실어 보낼 **웹폰트 URL**을 편집기 폰트 카탈로그에서 뽑는다.
 *
 * 서버는 헤드리스 Chromium으로 GIF를 굽는데, 그 컨테이너엔 우리 폰트가 하나도 없다.
 * family 이름만 보내면 시스템 폴백(비트맵 픽셀 폰트)으로 그려져서 "폰트가 유지되지
 * 않는다"는 증상이 난다. 그래서 실제 폰트 파일 주소를 함께 보낸다.
 *
 * 소스가 둘이라 주소 모양도 둘이다(서버는 확장자로 구분한다):
 *   catalog — jsdelivr 의 woff2 한 개(굵기별 파일)
 *   bundle  — 우리 오리진의 스타일시트 한 개(한글 unicode-range 조각 ~90개를 묶은 것)
 *
 * 서버가 호스트 허용 목록으로 한 번 더 거르므로, 여기서 못 만들거나 로컬 오리진이면
 * 그냥 비워 보낸다 — 그 경우 서버의 폴백 폰트로 그려진다.
 */

import { LEVIOSA_KONVA_VERSION } from "@leviosa-ai/konva";

import {
  closestDetailPageFontWeight,
  getDetailPageFont,
  resolveDetailPageFontStyle,
} from "./font-catalog";
import { closestEditorFontWeight, getEditorFont } from "./editor-fonts";

export type GifWebFont = {
  family: string;
  url: string;
  weight: number;
};

/** 번들 폰트 스타일시트 경로가 쓰는 슬러그(font-loader와 같은 규칙). */
function slugifyFamily(family: string): string {
  return family
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function currentOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/**
 * (family, weight) 쌍들 → 서버에 보낼 폰트 목록. 같은 조합은 한 번만 담고, 카탈로그에
 * 없는 family(문서에만 있는 레거시 이름)는 건너뛴다.
 */
export function resolveGifWebFonts(
  faces: Array<{ family: string; weight?: unknown }>,
  origin: string = currentOrigin(),
): GifWebFont[] {
  const out: GifWebFont[] = [];
  const seen = new Set<string>();

  for (const face of faces) {
    const family = (face.family ?? "").trim();
    if (!family) continue;
    const editorFont = getEditorFont(family);
    if (!editorFont) continue;

    if (editorFont.source === "catalog") {
      const catalogFont = getDetailPageFont(family);
      if (!catalogFont) continue;
      const weight = closestDetailPageFontWeight(catalogFont, face.weight);
      const key = `${family}\n${weight}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const style = resolveDetailPageFontStyle(catalogFont, weight, "normal");
      if (style?.url) out.push({ family, url: style.url, weight });
      continue;
    }

    // 번들 폰트는 우리 오리진에서 서빙된다 — 서버가 받아갈 수 있는 절대 주소로만 보낸다.
    if (!/^https:\/\//i.test(origin)) continue;
    const slug = slugifyFamily(family);
    if (!slug) continue;
    const weight = closestEditorFontWeight(editorFont, face.weight);
    const key = `${family}\n${weight}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      family,
      weight,
      url: `${origin}/render-fonts/family-css/${slug}-${weight}.css?v=${LEVIOSA_KONVA_VERSION}`,
    });
  }

  return out.slice(0, 8);
}
