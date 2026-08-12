/**
 * QR·바코드 → SVG. **전부 브라우저 안에서 끝난다** — 서버도, 크레딧도 안 든다.
 *
 * 나오는 마크업은 도형과 같은 규약이다: `<svg viewBox>` 하나에 색은 속성으로만 단다.
 * 그래야 삽입 경로(`insertShape`)도, 우측 색 컨트롤(`svg-colors.ts`)도 그대로 먹는다.
 *
 * 모듈 하나를 `<rect>` 하나로 그리면 요소가 수백 개가 되고 색 스와치도 수백 개로 읽힌다.
 * 그래서 **검은 모듈 전체를 `<path>` 하나로 합친다** — 색은 배경과 전경 둘뿐이다.
 */

import qrcode from "qrcode-generator";

export type CodeColors = {
  /** 모듈·막대 색. */
  foreground: string;
  /** 여백 색. `"none"`이면 투명하게 둔다. */
  background: string;
};

const DEFAULT_COLORS: CodeColors = { foreground: "#000000", background: "#ffffff" };

/** 스캐너가 요구하는 여백. QR은 4모듈, EAN-13은 좌우 9·7모듈이 규격이다. */
const QR_QUIET_ZONE = 4;

/**
 * QR 코드 SVG.
 *
 * 오류정정은 M(약 15% 복원)으로 고정한다. 상세페이지의 QR은 인쇄물이 아니라 화면이나
 * 종이 한 장이라 H까지 올릴 이유가 없고, 올리면 모듈이 촘촘해져 작게 넣었을 때 오히려
 * 안 읽힌다. 버전은 0(자동) — 내용 길이에 맞춰 알아서 고른다.
 */
export function qrCodeSvg(
  text: string,
  colors: CodeColors = DEFAULT_COLORS,
): { markup: string; viewBox: string } | null {
  const value = text.trim();
  if (!value) return null;

  let modules: boolean[][];
  try {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    modules = Array.from({ length: count }, (_, row) =>
      Array.from({ length: count }, (_, col) => qr.isDark(row, col)),
    );
  } catch {
    // 내용이 너무 길어 버전 40에도 안 들어가는 경우.
    return null;
  }

  const count = modules.length;
  const size = count + QR_QUIET_ZONE * 2;
  const path = modulesToPath(modules, QR_QUIET_ZONE);
  const viewBox = `0 0 ${size} ${size}`;

  return {
    viewBox,
    markup:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">` +
      backgroundRect(size, size, colors.background) +
      `<path fill="${colors.foreground}" d="${path}"/>` +
      `</svg>`,
  };
}

/** 어두운 모듈을 가로로 이어 붙여 한 path로. 인접한 칸을 합쳐 경로 길이를 줄인다. */
function modulesToPath(modules: boolean[][], offset: number): string {
  const parts: string[] = [];
  for (let row = 0; row < modules.length; row += 1) {
    let col = 0;
    while (col < modules[row].length) {
      if (!modules[row][col]) {
        col += 1;
        continue;
      }
      let run = 1;
      while (col + run < modules[row].length && modules[row][col + run]) run += 1;
      parts.push(`M${col + offset} ${row + offset}h${run}v1h-${run}z`);
      col += run;
    }
  }
  return parts.join("");
}

function backgroundRect(width: number, height: number, color: string): string {
  if (!color || color === "none") return "";
  return `<rect width="${width}" height="${height}" fill="${color}"/>`;
}

// ── EAN-13 ────────────────────────────────────────────────────────────────────

/**
 * EAN-13만 낸다. CODE128·CODE39는 물류 라벨용이라 상세페이지에 실릴 일이 없고,
 * 국내 상품 바코드(KAN)가 EAN-13이다. 필요해지면 여기 옆에 붙인다.
 */

/** A(왼쪽 홀수 패리티) 집합. R은 이것의 보수, G는 R을 뒤집은 것이다. */
const EAN_L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];

const EAN_R = EAN_L.map((bits) =>
  [...bits].map((bit) => (bit === "0" ? "1" : "0")).join(""),
);
const EAN_G = EAN_R.map((bits) => [...bits].reverse().join(""));

/** 첫 자리가 왼쪽 여섯 자리의 A/G 배치를 정한다 — 13번째 자리는 막대로 안 그려진다. */
const EAN_PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

/** 오른쪽에서부터 1·3 가중치를 번갈아 곱해 10의 보수를 취한다. */
export function ean13CheckDigit(digits12: string): number | null {
  if (!/^\d{12}$/.test(digits12)) return null;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    // 왼쪽부터 0-index 짝수 자리가 가중치 1이다(오른쪽에서 홀수 번째).
    sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/** 12자리면 체크디짓을 붙이고, 13자리면 체크디짓이 맞는지 본다. */
export function normalizeEan13(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 12) {
    const check = ean13CheckDigit(digits);
    return check === null ? null : `${digits}${check}`;
  }
  if (digits.length === 13) {
    const check = ean13CheckDigit(digits.slice(0, 12));
    return check !== null && check === Number(digits[12]) ? digits : null;
  }
  return null;
}

/**
 * EAN-13 SVG. 막대 95모듈 + 좌우 여백(9·7모듈)이 규격이고, 숫자를 아래에 얹는다.
 *
 * 가드 막대(양끝·가운데)는 숫자 영역까지 내려온다 — 장식이 아니라 스캐너가 시작·끝을
 * 잡는 자리라 길이가 규격이다.
 */
export function ean13Svg(
  input: string,
  colors: CodeColors = DEFAULT_COLORS,
): { markup: string; viewBox: string; value: string } | null {
  const value = normalizeEan13(input);
  if (!value) return null;

  const parity = EAN_PARITY[Number(value[0])];
  let bits = "101";
  for (let i = 0; i < 6; i += 1) {
    const digit = Number(value[i + 1]);
    bits += parity[i] === "L" ? EAN_L[digit] : EAN_G[digit];
  }
  bits += "01010";
  for (let i = 0; i < 6; i += 1) bits += EAN_R[Number(value[i + 7])];
  bits += "101";

  const LEFT_QUIET = 11;
  const RIGHT_QUIET = 7;
  const BAR_HEIGHT = 68;
  const GUARD_EXTRA = 5;
  const TEXT_BASELINE = BAR_HEIGHT + GUARD_EXTRA + 8;
  const width = LEFT_QUIET + bits.length + RIGHT_QUIET;
  const height = TEXT_BASELINE + 3;

  // 가드 막대가 서 있는 칸(비트 인덱스). 이 칸만 아래로 더 내려온다.
  // 시작 3 · 왼쪽 42 · 가운데 5 · 오른쪽 42 · 끝 3 = 95모듈.
  const guards = new Set<number>();
  for (const [start, len] of [
    [0, 3],
    [45, 5],
    [92, 3],
  ] as const) {
    for (let i = 0; i < len; i += 1) guards.add(start + i);
  }

  const bars: string[] = [];
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i] !== "1") continue;
    const tall = guards.has(i);
    bars.push(
      `M${LEFT_QUIET + i} 0h1v${tall ? BAR_HEIGHT + GUARD_EXTRA : BAR_HEIGHT}h-1z`,
    );
  }

  const viewBox = `0 0 ${width} ${height}`;
  // 숫자는 `monospace` 한 가지만 쓴다. 이 마크업은 data URI로 `<img>`에 실려 그려지므로
  // 문서의 `@font-face`가 안 닿는다(차트 기획서에서 같은 이유로 SVG 라벨을 포기했다).
  // 시스템마다 글꼴이 갈릴 수 있지만 스캐너가 읽는 것은 막대지 숫자가 아니다.
  const digits = (text: string, x: number, anchor: string) =>
    `<text x="${x}" y="${TEXT_BASELINE}" fill="${colors.foreground}" ` +
    `font-family="monospace" font-size="9" text-anchor="${anchor}">${text}</text>`;
  const label =
    digits(value[0], LEFT_QUIET - 2, "end") +
    digits(value.slice(1, 7), LEFT_QUIET + 24, "middle") +
    digits(value.slice(7), LEFT_QUIET + 71, "middle");

  return {
    value,
    viewBox,
    markup:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">` +
      backgroundRect(width, height, colors.background) +
      `<path fill="${colors.foreground}" d="${bars.join("")}"/>` +
      label +
      `</svg>`,
  };
}
