/**
 * Canvas/Konva 색 문자열을 HEX로 접는다.
 *
 * 편집기는 같은 색을 `#17150f` 로도 `rgb(23, 21, 15)` 로도 돌려준다(요소를 어떻게
 * 만들었는지에 따라 다르다). 반면 텍스트 GIF 같은 백엔드 엔드포인트는 색을 SVG 속성값에
 * 그대로 박기 때문에 짧은 HEX만 받는다. 그래서 보내기 직전에 여기서 정규화한다.
 */

const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i;

/**
 * `value` 를 `#rrggbb`(알파가 있으면 `#rrggbbaa`)로 바꾼다.
 * 아는 형태가 아니면 `fallback` 을 돌려준다 — 백엔드에서 422를 맞느니 기본색이 낫다.
 */
export function toHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;

  const text = value.trim();
  if (HEX_RE.test(text)) return text.toLowerCase();

  const match = RGB_RE.exec(text);
  if (!match) return fallback;

  const channels = [match[1], match[2], match[3]].map(Number);
  if (channels.some((channel) => channel > 255)) return fallback;

  const hex = `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  if (match[4] === undefined) return hex;

  const alpha = Math.round(Math.min(1, Math.max(0, Number(match[4]))) * 255);
  return alpha === 255 ? hex : `${hex}${alpha.toString(16).padStart(2, "0")}`;
}
