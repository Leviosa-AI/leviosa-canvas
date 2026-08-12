/**
 * 차트 값의 **문자열 ↔ 숫자** 변환.
 *
 * 사용자는 값을 엑셀에서 붙여넣거나 손으로 친다. "1,234", "45%", "0.9ms", "  12 "
 * 같은 것들이 그대로 들어오므로, 읽을 때는 관용적으로 흡수하고 쓸 때는 스펙의
 * 단위·소수점 규칙 하나로만 찍는다(그래야 라벨이 제각각이 되지 않는다).
 */

/**
 * 사람이 쓴 값 문자열을 숫자로. 못 읽으면 ``null``(= 값 없음, 0이 아니다).
 *
 * 천단위 콤마는 버리고, 단위 접미사·앞뒤 공백·통화기호도 떼어낸다. 소수점 콤마
 * ("1,5")는 **지원하지 않는다** — 천단위 콤마와 구분할 방법이 없고, 한국어 상세페이지
 * 맥락에서는 천단위 쪽이 압도적으로 흔하다.
 */
export function parseChartNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // 부호 + 숫자 + (천단위 콤마) + 소수부만 남긴다. 앞뒤에 붙은 단위/기호는 버린다.
  const match = trimmed.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export type FormatOptions = {
  decimals?: number;
  unit?: string;
  /** 천단위 구분. 기본 켬 — 상세페이지 수치는 대개 크다. */
  grouping?: boolean;
};

/** 값 + 단위. ``null``이면 빈 문자열(칸을 비워 두는 게 0으로 거짓말하는 것보다 낫다). */
export function formatChartValue(
  value: number | null,
  { decimals = 0, unit = "", grouping = true }: FormatOptions = {},
): string {
  if (value === null || !Number.isFinite(value)) return "";
  const places = Math.max(0, Math.min(6, Math.round(decimals)));
  const fixed = value.toFixed(places);
  if (!grouping) return `${fixed}${unit}`;
  const [whole, fraction] = fixed.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${fraction ? `.${fraction}` : ""}${unit}`;
}

/**
 * 데이터에서 소수 자릿수를 추론한다(붙여넣기 직후 기본값 잡기용).
 *
 * 하나라도 소수를 쓰면 그 최대 자릿수를 따라간다. 2자리를 넘기면 차트 라벨이 길어져
 * 읽기 어려우니 2에서 자른다.
 */
export function inferDecimals(values: ReadonlyArray<number | null>): number {
  let most = 0;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    const text = String(value);
    const dot = text.indexOf(".");
    if (dot >= 0) most = Math.max(most, text.length - dot - 1);
  }
  return Math.min(2, most);
}
