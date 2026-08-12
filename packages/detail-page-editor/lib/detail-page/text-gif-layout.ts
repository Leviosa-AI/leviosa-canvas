/**
 * '텍스트를 GIF로'가 서버에 넘길 **실측 레이아웃**.
 *
 * 예전에는 글자와 색만 넘겼고 서버가 캔버스를 글자 수로 추정했다(``fontSize * chars *
 * 0.66 + 96``). 그렇게 나온 GIF를 편집기가 페이지 폭의 62%로 꽂으니, 원본이 600px짜리
 * 상자였어도 결과는 훨씬 크게 들어갔다 — 유저가 본 "폰트 크기가 커지고 줄이 밀리는"
 * 증상의 정체다.
 *
 * 그래서 여기서 편집기가 아는 것을 전부 잰다: 원본 상자, 줄마다의 자리와 정렬, 그리고
 * **눈에 보이는 줄바꿈**. 편집기의 텍스트는 상자 폭에서 자동으로 접히는데(soft wrap)
 * SVG ``<text>``는 접히지 않으므로, 접힌 결과를 여기서 미리 줄로 쪼개 넘겨야 같은 모양이
 * 나온다.
 */

export type TextElementLike = {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  text?: unknown;
  fill?: unknown;
  fontSize?: unknown;
  fontWeight?: unknown;
  fontFamily?: unknown;
  lineHeight?: unknown;
  align?: unknown;
  verticalAlign?: unknown;
};

export type Box = { x: number; y: number; width: number; height: number };

export type LaidOutLine = {
  text: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  /** 상자 좌상단 기준 앵커 x. */
  x: number;
  /** 상자 좌상단 기준 줄의 세로 중심 y. */
  y: number;
  anchor: "start" | "middle" | "end";
};

/** 한 줄의 렌더 폭을 재는 함수(브라우저에서는 canvas measureText). */
export type Measure = (spec: {
  text: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
}) => number;

/** Canvas 텍스트 기본값(model/text-model.js). */
const DEFAULT_LINE_HEIGHT = 1.2;
const DEFAULT_FONT_SIZE = 14;

/** 접기 폭주 방지 — 폭이 말도 안 되게 좁아도 무한 루프에 빠지지 않게. */
const MAX_WRAPPED_LINES = 60;

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** ``normal``/``bold`` 같은 CSS 키워드를 숫자 굵기로. */
export function toFontWeight(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(900, Math.max(100, Math.round(value)));
  }
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "bold") return 700;
  if (text === "normal" || text === "") return 400;
  const parsed = Number(text);
  return Number.isFinite(parsed)
    ? Math.min(900, Math.max(100, Math.round(parsed)))
    : 400;
}

/**
 * 편집기가 보여주는 줄바꿈을 그대로 재현한다.
 *
 * 하드 개행으로 먼저 쪼개고, 각 줄이 상자 폭을 넘으면 들어가는 만큼 잘라 접는다.
 * 자를 자리는 마지막 공백을 우선하되(단어 보존), 공백이 없는 한국어·중국어 문장은
 * 글자 단위로 접는다 — Konva가 하는 것과 같은 결이다.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: Measure,
  style: { fontSize: number; fontWeight: number; fontFamily: string },
): string[] {
  const hard = String(text ?? "").split(/\r?\n/);
  if (!(maxWidth > 0)) {
    return hard.map((line) => line.trim()).filter(Boolean);
  }
  const out: string[] = [];
  for (const raw of hard) {
    let rest = raw.trim();
    if (!rest) continue;
    let guard = 0;
    while (rest && guard < MAX_WRAPPED_LINES) {
      guard += 1;
      if (measure({ ...style, text: rest }) <= maxWidth) {
        out.push(rest);
        break;
      }
      // 들어가는 가장 긴 앞부분(폭은 길이에 대해 단조 증가한다).
      let low = 1;
      let high = rest.length;
      let fit = 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (measure({ ...style, text: rest.slice(0, mid) }) <= maxWidth) {
          fit = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      let cut = fit;
      const lastSpace = rest.lastIndexOf(" ", cut);
      if (lastSpace > 0) cut = lastSpace;
      const head = rest.slice(0, cut).trim();
      const tail = rest.slice(cut).replace(/^\s+/, "");
      if (!head) {
        // 한 글자도 안 들어가는 극단 — 그래도 진도는 나가야 한다.
        out.push(rest.slice(0, 1));
        rest = rest.slice(1);
        continue;
      }
      out.push(head);
      rest = tail;
      if (!rest) break;
      if (guard >= MAX_WRAPPED_LINES - 1 && rest) out.push(rest);
    }
  }
  return out;
}

function anchorOf(align: unknown): "start" | "middle" | "end" {
  const value = String(align ?? "").trim().toLowerCase();
  if (value === "right") return "end";
  if (value === "center") return "middle";
  return "start";
}

/** 정렬에 따른 앵커 x(요소 좌표계). */
function anchorX(el: TextElementLike, anchor: "start" | "middle" | "end"): number {
  const x = num(el.x);
  const width = num(el.width);
  if (anchor === "middle") return x + width / 2;
  if (anchor === "end") return x + width;
  return x;
}

/**
 * 텍스트 요소들 → 상자 기준 줄 목록(위→아래).
 *
 * ``box``는 보통 이 요소들의 합집합 상자다. 서버는 이 좌표를 그대로 SVG에 찍고, 편집기는
 * 같은 상자에 결과를 되꽂으므로 글자 크기와 자리가 원본과 일치한다.
 */
export function layoutTextLines(
  els: TextElementLike[],
  box: Box,
  measure: Measure,
): LaidOutLine[] {
  const ordered = [...els].sort((a, b) => num(a.y) - num(b.y));
  const out: LaidOutLine[] = [];
  for (const el of ordered) {
    const fontSize = Math.max(1, Math.round(num(el.fontSize, DEFAULT_FONT_SIZE)));
    const fontWeight = toFontWeight(el.fontWeight);
    const fontFamily = String(el.fontFamily ?? "");
    const lineHeight = Math.max(
      0.5,
      num(el.lineHeight, DEFAULT_LINE_HEIGHT) || DEFAULT_LINE_HEIGHT,
    );
    const step = fontSize * lineHeight;
    const anchor = anchorOf(el.align);
    const lines = wrapText(String(el.text ?? ""), num(el.width), measure, {
      fontSize,
      fontWeight,
      fontFamily,
    });
    if (lines.length === 0) continue;

    // 세로 정렬: 요소 높이가 줄 높이 합보다 크면 top/middle/bottom에 따라 밀린다.
    const block = step * lines.length;
    const slack = Math.max(0, num(el.height) - block);
    const vertical = String(el.verticalAlign ?? "top").trim().toLowerCase();
    const offset =
      vertical === "middle" ? slack / 2 : vertical === "bottom" ? slack : 0;

    const x = anchorX(el, anchor) - box.x;
    const top = num(el.y) + offset - box.y;
    lines.forEach((line, index) => {
      out.push({
        text: line,
        color: String(el.fill ?? "#26221e"),
        fontSize,
        fontWeight,
        fontFamily,
        x,
        y: top + step * index + step / 2,
        anchor,
      });
    });
  }
  return out;
}

/**
 * 상자 밖으로 번지는 이펙트(글로우·물결·바운스)를 위한 여백.
 *
 * 가장 큰 글자를 기준으로 잡는다 — 진폭과 번짐이 글자 크기에 비례하기 때문이다.
 * 편집기도 결과를 이만큼 키운 상자에 꽂으므로 글자 자리는 그대로 맞는다.
 */
export function gifBleed(lines: Array<{ fontSize: number }>): number {
  const largest = lines.reduce((max, line) => Math.max(max, line.fontSize), 0);
  return Math.round(Math.min(120, Math.max(12, largest * 0.45)));
}

/** 브라우저 canvas 기반 폭 측정기. canvas를 못 얻으면 null(호출부가 폴백). */
export function createCanvasMeasure(): Measure | null {
  if (typeof document === "undefined") return null;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return null;
  return ({ text, fontSize, fontWeight, fontFamily }) => {
    const family = fontFamily ? `"${fontFamily}", sans-serif` : "sans-serif";
    context.font = `${fontWeight} ${fontSize}px ${family}`;
    return context.measureText(text).width;
  };
}

/**
 * 측정기가 없을 때 쓰는 대략치(폰트 폭 ≈ 글자 크기의 0.62배, ASCII는 절반).
 *
 * 실측보다 나쁘지만 "아예 안 접힌다"보다는 낫다.
 */
export const estimateMeasure: Measure = ({ text, fontSize }) => {
  let width = 0;
  for (const char of String(text ?? "")) {
    width += /[ -ÿ]/.test(char) ? fontSize * 0.52 : fontSize;
  }
  return width;
};
