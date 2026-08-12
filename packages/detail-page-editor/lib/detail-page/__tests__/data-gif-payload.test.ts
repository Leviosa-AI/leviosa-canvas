import { describe, expect, it } from "vitest";

import {
  buildDataGifPayload,
  parseCountUpText,
  parseFilledRows,
  textAnchorOf,
} from "../data-gif-payload";

describe("parseCountUpText", () => {
  it("소수 자릿수와 접미사를 원문에서 읽는다", () => {
    // 폼을 따로 두지 않는 게 요점이다 — 캔버스에 적힌 값이 그대로 GIF 값이 된다.
    expect(parseCountUpText("279.45%")).toEqual({
      to: 279.45,
      decimals: 2,
      grouping: false,
      prefix: "",
      suffix: "%",
    });
  });

  it("천 단위 쉼표는 자릿수 구분으로 인정하고 값에서는 뺀다", () => {
    expect(parseCountUpText("21,480,600개")).toMatchObject({
      to: 21480600,
      grouping: true,
      suffix: "개",
    });
  });

  it("쉼표가 없던 숫자는 GIF에도 안 찍는다", () => {
    expect(parseCountUpText("21480600")?.grouping).toBe(false);
  });

  it("숫자 앞 글자는 접두사로 간다", () => {
    expect(parseCountUpText("₩1,240,000")).toMatchObject({
      to: 1240000,
      prefix: "₩",
      suffix: "",
    });
  });

  it("숫자가 없으면 null — 호출부가 섹션을 감춘다", () => {
    expect(parseCountUpText("수분 가득한 하루")).toBeNull();
    expect(parseCountUpText("")).toBeNull();
  });

  it("접두/접미사는 서버 상한(8자)까지만 보낸다", () => {
    const parsed = parseCountUpText(`${"가".repeat(20)}12${"나".repeat(20)}`);
    expect(parsed?.prefix).toHaveLength(8);
    expect(parsed?.suffix).toHaveLength(8);
  });

  it("세 자리로 안 끊긴 쉼표는 자릿수 구분이 아니다", () => {
    // "1,2" 를 12 로 읽으면 값이 통째로 틀린다.
    expect(parseCountUpText("1,2")).toMatchObject({ to: 1, grouping: false });
  });
});

describe("buildDataGifPayload", () => {
  it("카운트업을 snake_case 로 접고 다른 블록은 안 보낸다", () => {
    const payload = buildDataGifPayload({
      kind: "count_up",
      to: 98.6,
      decimals: 1,
      suffix: "점",
      fontSize: 42,
      fontWeight: 800,
      marker: "#f7f14a",
      width: 200,
      height: 60,
      background: "#ffffff",
      brandId: "brand_1",
    });
    expect(payload).toMatchObject({
      kind: "count_up",
      count_up: { to: 98.6, font_size: 42, font_weight: 800, marker: "#f7f14a" },
      background: "#ffffff",
      brand_id: "brand_1",
    });
    expect(payload).not.toHaveProperty("cell_grid");
  });

  it("셀 격자는 pitch 를 x/y 로 나눠 보낸다", () => {
    const payload = buildDataGifPayload({
      kind: "cell_grid",
      filled: [6, 4],
      cols: 8,
      shape: "hexagon",
      pitchX: 34,
      pitchY: 30,
    });
    expect(payload).toMatchObject({
      kind: "cell_grid",
      cell_grid: { filled: [6, 4], shape: "hexagon", pitch_x: 34, pitch_y: 30 },
    });
    expect(payload).not.toHaveProperty("count_up");
  });
});

describe("parseFilledRows", () => {
  it("쉼표든 공백이든 행별 칸 수로 읽는다", () => {
    expect(parseFilledRows("6,4,2")).toEqual([6, 4, 2]);
    expect(parseFilledRows("6 4 2")).toEqual([6, 4, 2]);
  });

  it("숫자가 아닌 입력은 빈 배열 — 버튼이 잠긴다", () => {
    expect(parseFilledRows("가나다")).toEqual([]);
    expect(parseFilledRows("")).toEqual([]);
  });
});

describe("textAnchorOf — 편집기 정렬 → SVG 앵커", () => {
  it("left/center/right 를 옮긴다", () => {
    expect(textAnchorOf("left")).toBe("start");
    expect(textAnchorOf("center")).toBe("middle");
    expect(textAnchorOf("right")).toBe("end");
  });

  it("빈 값·모르는 값은 왼쪽(Canvas 기본값)", () => {
    expect(textAnchorOf(undefined)).toBe("start");
    expect(textAnchorOf("justify")).toBe("start");
  });
});

describe("buildDataGifPayload — 타이포 필드", () => {
  it("자간·앵커를 snake_case 로 실어 보낸다", () => {
    const body = buildDataGifPayload({
      kind: "count_up",
      to: 279.45,
      letterSpacing: -1.5,
      anchor: "start",
      fontWeight: 400,
    }) as { count_up: Record<string, unknown> };

    expect(body.count_up.letter_spacing).toBe(-1.5);
    expect(body.count_up.anchor).toBe("start");
    expect(body.count_up.font_weight).toBe(400);
  });
});
