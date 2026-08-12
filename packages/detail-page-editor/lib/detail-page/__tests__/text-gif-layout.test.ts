import { describe, expect, it } from "vitest";

import {
  estimateMeasure,
  gifBleed,
  layoutTextLines,
  toFontWeight,
  wrapText,
  type Measure,
} from "../text-gif-layout";

/** 한 글자 = fontSize 폭인 단순 측정기(계산이 눈으로 검산된다). */
const monoMeasure: Measure = ({ text, fontSize }) => text.length * fontSize;

const style = { fontSize: 10, fontWeight: 700, fontFamily: "Paperozi" };

describe("wrapText", () => {
  it("하드 개행을 줄로 쪼갠다", () => {
    expect(wrapText("첫 줄\n둘째 줄", 0, monoMeasure, style)).toEqual([
      "첫 줄",
      "둘째 줄",
    ]);
  });

  it("상자 폭에서 접힌 줄도 재현한다", () => {
    // SVG <text>는 접히지 않는다 — 편집기가 접어 보여주는 그대로 미리 쪼개야
    // 결과 GIF가 같은 모양이 된다.
    expect(wrapText("abcdefgh", 40, monoMeasure, style)).toEqual([
      "abcd",
      "efgh",
    ]);
  });

  it("공백이 있으면 단어 경계에서 접는다", () => {
    expect(wrapText("abc de fghi", 60, monoMeasure, style)).toEqual([
      "abc de",
      "fghi",
    ]);
  });

  it("공백이 없는 한국어는 글자 단위로 접는다", () => {
    expect(wrapText("가나다라마바", 30, monoMeasure, style)).toEqual([
      "가나다",
      "라마바",
    ]);
  });

  it("폭이 0이면 접지 않는다(폭을 모를 때 억지로 쪼개지 않는다)", () => {
    expect(wrapText("아주 긴 한 줄", 0, monoMeasure, style)).toEqual([
      "아주 긴 한 줄",
    ]);
  });

  it("한 글자도 안 들어가는 폭에서도 끝난다", () => {
    const lines = wrapText("가나다", 1, monoMeasure, style);
    expect(lines).toEqual(["가", "나", "다"]);
  });

  it("빈 줄은 버린다", () => {
    expect(wrapText("a\n\n\nb", 0, monoMeasure, style)).toEqual(["a", "b"]);
  });
});

describe("toFontWeight", () => {
  it.each([
    ["bold", 700],
    ["normal", 400],
    ["", 400],
    ["600", 600],
    [800, 800],
    [undefined, 400],
  ])("%s → %s", (input, expected) => {
    expect(toFontWeight(input)).toBe(expected);
  });
});

describe("layoutTextLines", () => {
  const box = { x: 100, y: 50, width: 400, height: 200 };

  function text(overrides: Record<string, unknown> = {}) {
    return {
      x: 100,
      y: 50,
      width: 400,
      height: 60,
      text: "레비오사",
      fill: "#26221e",
      fontSize: 40,
      fontWeight: "bold",
      fontFamily: "Paperozi",
      align: "center",
      ...overrides,
    };
  }

  it("상자 기준 좌표로 줄을 놓는다", () => {
    const [line] = layoutTextLines([text()], box, monoMeasure);
    expect(line).toMatchObject({
      x: 200, // 상자 왼쪽에서 요소 가운데까지
      anchor: "middle",
      fontSize: 40,
      fontWeight: 700,
    });
    expect(line.y).toBeCloseTo(24, 5); // 줄 높이(40 * 1.2)의 절반
  });

  it("정렬을 앵커로 옮긴다", () => {
    expect(
      layoutTextLines([text({ align: "left" })], box, monoMeasure)[0],
    ).toMatchObject({ x: 0, anchor: "start" });
    expect(
      layoutTextLines([text({ align: "right" })], box, monoMeasure)[0],
    ).toMatchObject({ x: 400, anchor: "end" });
  });

  it("lineHeight를 반영해 줄을 쌓는다", () => {
    const lines = layoutTextLines(
      [text({ text: "가\n나", fontSize: 20, lineHeight: 2 })],
      box,
      monoMeasure,
    );
    expect(lines.map((l) => l.y)).toEqual([20, 60]);
  });

  it("verticalAlign=middle이면 남는 높이의 절반만큼 내려간다", () => {
    const lines = layoutTextLines(
      [text({ text: "가", fontSize: 20, height: 100, verticalAlign: "middle" })],
      box,
      monoMeasure,
    );
    // 남는 높이 100 - 24 = 76 → 절반 38, 거기에 줄 중심 12.
    expect(lines[0].y).toBeCloseTo(50, 5);
  });

  it("여러 요소는 화면 순서(위→아래)로 이어 붙인다", () => {
    const lines = layoutTextLines(
      [
        text({ y: 140, text: "부제", fontSize: 20 }),
        text({ y: 50, text: "헤드라인", fontSize: 40 }),
      ],
      box,
      monoMeasure,
    );
    expect(lines.map((l) => l.text)).toEqual(["헤드라인", "부제"]);
  });

  it("빈 텍스트는 줄을 만들지 않는다", () => {
    expect(layoutTextLines([text({ text: "   " })], box, monoMeasure)).toEqual([]);
  });
});

describe("gifBleed", () => {
  it("가장 큰 글자를 기준으로 잡는다", () => {
    expect(gifBleed([{ fontSize: 20 }, { fontSize: 80 }])).toBe(36);
  });

  it("아주 작은 글자에도 최소 여백은 준다", () => {
    expect(gifBleed([{ fontSize: 8 }])).toBe(12);
  });

  it("아주 큰 글자에도 상한을 둔다", () => {
    expect(gifBleed([{ fontSize: 600 }])).toBe(120);
  });

  it("줄이 없으면 최소값", () => {
    expect(gifBleed([])).toBe(12);
  });
});

describe("estimateMeasure", () => {
  it("한글은 글자 크기만큼, ASCII는 그보다 좁게 잡는다", () => {
    expect(estimateMeasure({ ...style, text: "가나" })).toBe(20);
    expect(estimateMeasure({ ...style, text: "ab" })).toBeLessThan(20);
  });
});
