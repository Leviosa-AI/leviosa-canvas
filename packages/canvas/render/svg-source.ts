/**
 * `svg` 요소의 마크업을 다루는 자리 — 디코드, 색 치환, 네임스페이스 보정.
 *
 * 우리 템플릿의 장식은 대부분 인라인 SVG고, 마크업은 `src`에 data URI로 들어 있다.
 * 무드 팔레트가 도형 색을 갈아 끼우는 통로가 `colorsReplace`(`{바꿀색: 새색}`)다.
 *
 * ## 왜 직접 짜는가
 *
 * 색 치환은 남의 구현을 쓰던 자리인데 두 가지가 걸렸다. `xmlns`가 없는 마크업에서
 * 터졌고(실제로 겪은 사고다), 색 표기가 다르면(`#abc` vs `#AABBCC` vs `rgb(...)`)
 * 같은 색인데도 안 바뀌었다. 여기서는 **색을 정규화해서 견주고**, 네임스페이스가
 * 없으면 채워 넣는다.
 *
 * `<style>` 블록 안의 CSS 규칙은 아직 안 건드린다 — 우리 디컴포저가 뽑는 마크업은
 * 색을 전부 속성으로 단다. 언젠가 외부 SVG를 받아들이면 그때 늘린다.
 */

/** 색을 견줄 수 있는 한 가지 표기로. 못 알아보면 소문자 원문 그대로. */
export function normalizeColor(value: string): string {
  const text = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  if (rgb) {
    const hex = (n: string) =>
      Math.max(0, Math.min(255, Math.round(Number(n))))
        .toString(16)
        .padStart(2, "0");
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  return text;
}

/** 색을 담는 속성들. `<style>` 안이 아니라 속성만 본다. */
const COLOR_ATTRS = "fill|stroke|stop-color|flood-color|lighting-color";
const ATTR_RE = new RegExp(`\\b(${COLOR_ATTRS})(\\s*=\\s*)(["'])(.*?)\\3`, "gi");
const STYLE_RE = /\bstyle(\s*=\s*)(["'])(.*?)\2/gi;
const STYLE_DECL_RE = new RegExp(`\\b(${COLOR_ATTRS})(\\s*:\\s*)([^;]+)`, "gi");

/** mobx 맵도, 평범한 객체도 같은 모양으로 읽는다. */
export function readColorReplace(value: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!value || typeof value !== "object") return out;
  const holder = value as { toJSON?: () => Record<string, unknown> };
  const plain =
    typeof holder.toJSON === "function"
      ? (holder.toJSON() ?? {})
      : (value as Record<string, unknown>);
  for (const [from, to] of Object.entries(plain)) {
    if (!from || typeof to !== "string" || !to) continue;
    out.set(normalizeColor(from), to);
  }
  return out;
}

/** `{바꿀색: 새색}`대로 마크업의 색을 갈아 끼운다. 표기가 달라도 같은 색이면 바꾼다. */
export function replaceSvgColors(
  markup: string,
  colors: Map<string, string>,
): string {
  if (!colors.size) return markup;
  const swap = (raw: string): string => colors.get(normalizeColor(raw)) ?? raw;

  return markup
    .replace(ATTR_RE, (_all, name, eq, quote, value) =>
      // `none`·`url(#grad)`는 색이 아니다 — 정규화해도 자기 자신이라 그대로 지나간다.
      `${name}${eq}${quote}${swap(value)}${quote}`,
    )
    .replace(
      STYLE_RE,
      (_all, eq, quote, body) =>
        `style${eq}${quote}${body.replace(
          STYLE_DECL_RE,
          (_d: string, name: string, colon: string, value: string) =>
            `${name}${colon}${swap(value)}`,
        )}${quote}`,
    );
}

/** `xmlns`가 없으면 채운다 — 없으면 브라우저가 data URI를 이미지로 못 읽는다. */
export function ensureSvgNamespace(markup: string): string {
  // 여는 태그를 먼저 잘라 낸 다음 그 안을 본다. 한 식으로 보면(`<svg[^>]*\sxmlns`)
  // `[^>]*` 와 `\s` 가 같은 공백을 서로 가져갈 수 있어, `<svg` 가 여러 번 나오고
  // 태그가 안 닫히는 마크업에서 되짚기가 길이의 제곱으로 늘어난다.
  const openTag = markup.match(/<svg\b[^>]*/i);
  if (!openTag) return markup;
  if (/\sxmlns\s*=/i.test(openTag[0])) return markup;
  return markup.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** data URI(base64 또는 퍼센트 인코딩)에서 마크업을 꺼낸다. 아니면 null. */
export function decodeSvgSrc(src: string): string | null {
  if (!src.startsWith("data:image/svg+xml")) return null;
  const comma = src.indexOf(",");
  if (comma < 0) return null;
  const head = src.slice(0, comma);
  const body = src.slice(comma + 1);
  try {
    if (/;base64/i.test(head)) {
      const binary = atob(body);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(body);
  } catch {
    return null;
  }
}

/**
 * `src`가 무엇이든 마크업 문자열로. data URI면 그 자리에서 풀고, 주소면 받아 온다.
 * (도형을 GIF·이미지로 굽는 길이 이걸 쓴다 — 화면에 그릴 때는 `<img>`가 알아서 한다.)
 */
export async function loadSvgMarkup(src: string): Promise<string> {
  const inline = decodeSvgSrc(src);
  if (inline !== null) return inline;
  const response = await fetch(src);
  if (!response.ok) throw new Error(`SVG를 못 받았다: ${response.status}`);
  return response.text();
}

export function encodeSvgSrc(markup: string): string {
  const bytes = new TextEncoder().encode(markup);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/**
 * 이 요소를 그릴 최종 `src`.
 *
 * 바꿀 것이 없으면 **원본 문자열을 그대로 돌려준다** — 새 문자열을 만들면 이미지
 * 캐시가 매번 헛돌고 화면이 깜빡인다.
 */
export function svgSourceFor(el: {
  src?: unknown;
  colorsReplace?: unknown;
}): string | null {
  const src = typeof el.src === "string" ? el.src : "";
  if (!src) return null;
  const colors = readColorReplace(el.colorsReplace);
  const markup = decodeSvgSrc(src);
  if (!markup) return src; // data URI가 아니면(원격 주소) 손대지 않는다
  const next = ensureSvgNamespace(replaceSvgColors(markup, colors));
  return next === markup ? src : encodeSvgSrc(next);
}
