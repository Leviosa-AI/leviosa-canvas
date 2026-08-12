/**
 * '수치를 GIF로' 요청 본문 만들기 + 선택 텍스트에서 숫자 읽어내기.
 *
 * 운영 편집기(editor-client)와 데모 하니스(dev-canvas)가 같은 계약으로 호출해야 해서
 * 한 곳에 둔다 — 한쪽에만 필드를 더하면 데모에서만 값이 빠지는 식으로 갈린다.
 *
 * 카운트업은 **입력 폼을 따로 두지 않는다.** 이미 캔버스에 적어 둔 "279.45%" 를 고르면
 * 거기서 목표값·소수 자릿수·접두/접미사를 읽는다. 숫자를 두 번 적게 하면 캔버스의 값과
 * GIF의 값이 어긋나는 사고가 난다.
 */

export type CountUpParsed = {
  to: number;
  decimals: number;
  /** 원문에 천 단위 쉼표가 있었는지(없었으면 GIF에도 안 찍는다). */
  grouping: boolean;
  prefix: string;
  suffix: string;
};

/** 서버 스키마 상한(스키마를 넘기면 422). */
const AFFIX_MAX = 8;
const DECIMALS_MAX = 4;

/**
 * 텍스트 한 줄에서 숫자 하나를 읽는다. 숫자가 없으면 ``null`` — 호출부는 그때 섹션을
 * 아예 감춘다("2천만 개" 같은 문구에 카운트업 버튼을 띄워도 눌러봐야 헛것이 나온다).
 */
export function parseCountUpText(raw: string): CountUpParsed | null {
  const text = String(raw ?? "").trim();
  // 쉼표는 자릿수 구분으로만 인정한다(뒤에 정확히 세 자리가 올 때).
  const match = text.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/);
  if (!match || match.index === undefined) return null;
  const token = match[0];
  const to = Number(token.replace(/,/g, ""));
  if (!Number.isFinite(to)) return null;
  const dot = token.indexOf(".");
  return {
    to,
    decimals: dot < 0 ? 0 : Math.min(token.length - dot - 1, DECIMALS_MAX),
    grouping: token.includes(","),
    prefix: text.slice(0, match.index).slice(-AFFIX_MAX),
    suffix: text.slice(match.index + token.length).slice(0, AFFIX_MAX),
  };
}

/** SVG ``text-anchor``. Canvas 의 left/center/right 를 그대로 옮긴 것. */
export type TextAnchor = "start" | "middle" | "end";

/**
 * 편집기 정렬 → SVG 앵커. 모르는 값은 왼쪽으로 둔다(Canvas 기본값과 같다).
 *
 * 상자가 글자보다 넓을 때는 정렬이 곧 자리다. 이걸 안 넘기면 서버가 항상 가운데로
 * 그려서, 제자리 교체인데 숫자만 가운데로 옮겨 앉는다.
 */
export function textAnchorOf(align: unknown): TextAnchor {
  const value = String(align ?? "")
    .trim()
    .toLowerCase();
  if (value === "center") return "middle";
  if (value === "right") return "end";
  return "start";
}

export type CountUpGifInput = {
  kind: "count_up";
  to: number;
  start?: number;
  decimals?: number;
  grouping?: boolean;
  prefix?: string;
  suffix?: string;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  letterSpacing?: number;
  anchor?: TextAnchor;
  italic?: boolean;
  /** 형광 마커 띠 색. 선택 텍스트에 하이라이트가 걸려 있으면 그 색이 온다. */
  marker?: string;
  /** 원본 상자 크기와 글자 기준선(px). 주면 서버가 캔버스를 추정하지 않는다. */
  width?: number;
  height?: number;
};

export type CellGridGifInput = {
  kind: "cell_grid";
  /** 행별로 채울 칸 수(위→아래). */
  filled: number[];
  cols?: number;
  shape?: string;
  size?: number;
  pitchX?: number;
  pitchY?: number;
  fill?: string;
  empty?: string;
  order?: string;
};

export type DataGifRequestInput = (CountUpGifInput | CellGridGifInput) & {
  background?: string;
  transparent?: boolean;
  fonts?: Array<{ family: string; url: string; weight: number }>;
  brandId?: string;
};

export function buildDataGifPayload(input: DataGifRequestInput) {
  const common = {
    background: input.background,
    transparent: input.transparent,
    fonts: input.fonts ?? [],
    brand_id: input.brandId,
  };
  if (input.kind === "count_up") {
    return {
      kind: "count_up",
      count_up: {
        to: input.to,
        start: input.start,
        decimals: input.decimals,
        grouping: input.grouping,
        prefix: input.prefix,
        suffix: input.suffix,
        color: input.color,
        font_size: input.fontSize,
        font_weight: input.fontWeight,
        font_family: input.fontFamily,
        letter_spacing: input.letterSpacing,
        anchor: input.anchor,
        italic: input.italic,
        marker: input.marker,
        width: input.width,
        height: input.height,
      },
      ...common,
    };
  }
  return {
    kind: "cell_grid",
    cell_grid: {
      filled: input.filled,
      cols: input.cols,
      shape: input.shape,
      size: input.size,
      pitch_x: input.pitchX,
      pitch_y: input.pitchY,
      fill: input.fill,
      empty: input.empty,
      order: input.order,
    },
    ...common,
  };
}

/**
 * "6,4,3" / "6 4 3" 같은 입력 → 행별 채움 수. 서버가 422로 되돌려 주기 전에 여기서
 * 숫자가 아닌 것과 음수를 걸러 낸다.
 */
export function parseFilledRows(raw: string): number[] {
  return String(raw ?? "")
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((v) => Math.max(0, Math.trunc(Number(v))))
    .filter((v) => Number.isFinite(v))
    .slice(0, 40);
}
