/**
 * '텍스트를 GIF로' 요청 본문 만들기(camelCase 입력 → snake_case 페이로드).
 *
 * 운영 편집기(editor-client)와 데모 하니스(dev-canvas)가 같은 계약으로 호출해야 해서
 * 한 곳에 둔다 — 한쪽에만 필드를 더하면 데모에서만 폰트가 안 실리는 식으로 갈린다.
 */

export type TextGifRequestInput = {
  text: string;
  effect: string;
  color?: string;
  accent?: string;
  background?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  lines?: Array<{
    text: string;
    color: string;
    fontSize: number;
    fontWeight: number;
    fontFamily: string;
    /** 원본 상자 기준 앵커 x(px). 주면 서버가 그 자리에 그대로 찍는다. */
    x?: number;
    /** 원본 상자 기준 줄의 세로 중심 y(px). */
    y?: number;
    /** 가로 정렬 기준(편집기 left/center/right → start/middle/end). */
    anchor?: "start" | "middle" | "end";
  }>;
  fonts?: Array<{ family: string; url: string; weight: number }>;
  /** 원본 텍스트 상자 크기(px). 주면 서버가 캔버스를 추정하지 않는다. */
  boxWidth?: number;
  boxHeight?: number;
  /** 상자 밖으로 번지는 이펙트를 위한 사방 여백(px). */
  bleed?: number;
  brandId?: string;
};

export function buildTextGifPayload(input: TextGifRequestInput) {
  return {
    text: input.text,
    effect: input.effect,
    color: input.color,
    accent: input.accent,
    background: input.background,
    font_size: input.fontSize,
    font_weight: input.fontWeight,
    font_family: input.fontFamily,
    // 한 줄짜리도 lines 로 보낸다 — 요소 안의 줄바꿈이 이미 여기서 줄로 쪼개져 있고,
    // 서버는 lines 가 있으면 그걸 쌓는다.
    lines: (input.lines ?? []).map((line) => ({
      text: line.text,
      color: line.color,
      font_size: line.fontSize,
      font_weight: line.fontWeight,
      font_family: line.fontFamily,
      x: line.x,
      y: line.y,
      anchor: line.anchor,
    })),
    fonts: input.fonts ?? [],
    box_width: input.boxWidth,
    box_height: input.boxHeight,
    bleed: input.bleed,
    brand_id: input.brandId,
  };
}
