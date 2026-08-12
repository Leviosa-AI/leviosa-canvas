import { describe, expect, it } from "vitest";

import {
  bubblePathD,
  bubbleSvgMarkup,
  insideBody,
  readBubbleParams,
  type BubbleParams,
  type Pt,
} from "../bubble-path";

const BODY: BubbleParams = {
  w: 200,
  h: 100,
  r: 24,
  pad: 20,
  fill: "#FCF5EC",
  stroke: "#F0955A",
  strokeWidth: 4,
  base: [26, 26],
  notch: 9,
};

/** path의 "L12.3 45.6" 좌표들을 뽑는다. */
function points(d: string): Pt[] {
  return [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

describe("bubblePathD — 몸통", () => {
  it("꼬리가 없으면 둥근 사각형 안에만 점이 있다", () => {
    const d = bubblePathD({ ...BODY, tip: null });
    expect(d.endsWith(" Z")).toBe(true);
    for (const [x, y] of points(d)) {
      expect(x).toBeGreaterThanOrEqual(-0.01);
      expect(x).toBeLessThanOrEqual(BODY.w + 0.01);
      expect(y).toBeGreaterThanOrEqual(-0.01);
      expect(y).toBeLessThanOrEqual(BODY.h + 0.01);
    }
  });

  it("끝점을 몸통 안으로 끌면 꼬리가 사라진다", () => {
    const inner = bubblePathD({ ...BODY, tip: [100, 50] });
    expect(inner).toBe(bubblePathD({ ...BODY, tip: null }));
  });
});

describe("bubblePathD — 꼬리는 360도 어디에 두어도 몸통에 붙어 있다", () => {
  // 이게 이 엔진의 존재 이유다. 꼬리를 별도 도형으로 얹으면 이 성질이 깨진다.
  const tips: Array<[string, Pt]> = [
    ["우하단(부리)", [212, 99]],
    ["좌하단", [-12, 99]],
    ["정하단", [100, 118]],
    ["정상단", [100, -18]],
    ["정좌측", [-18, 50]],
    ["정우측", [218, 50]],
    ["좌상단 모서리", [-10, -10]],
  ];

  for (const [name, tip] of tips) {
    it(`${name}: 끝점이 path에 정확히 들어가고 하나의 닫힌 윤곽이다`, () => {
      const d = bubblePathD({ ...BODY, tip });
      const pts = points(d);
      // 끝점 자체가 윤곽의 정점이어야 한다 — 따로 떠 있는 삼각형이 아니다.
      expect(pts.some(([x, y]) => Math.abs(x - tip[0]) < 0.1 && Math.abs(y - tip[1]) < 0.1)).toBe(true);
      // path는 하나뿐(M이 하나) → 몸통과 꼬리가 이어져 있다.
      expect(d.match(/M/g)?.length).toBe(1);
      expect(d.endsWith(" Z")).toBe(true);
      // 끝점을 뺀 나머지 정점은 전부 몸통 둘레 위(= 몸통 밖으로 새지 않는다).
      const stray = pts.filter(
        ([x, y]) =>
          !(Math.abs(x - tip[0]) < 0.1 && Math.abs(y - tip[1]) < 0.1) &&
          (x < -12 || x > BODY.w + 12 || y < -12 || y > BODY.h + 12),
      );
      expect(stray).toEqual([]);
    });
  }

  it("끝점을 옮기면 path가 실제로 달라진다(꼬리가 따라온다)", () => {
    const right = bubblePathD({ ...BODY, tip: [212, 99] });
    const left = bubblePathD({ ...BODY, tip: [-12, 99] });
    expect(right).not.toBe(left);
  });

  it("notch가 있으면 꼬리 쪽 정점이 하나 더 생긴다(오목한 부리)", () => {
    const flat = points(bubblePathD({ ...BODY, tip: [212, 99], notch: 0 }));
    const notched = points(bubblePathD({ ...BODY, tip: [212, 99], notch: 9 }));
    expect(notched.length).toBe(flat.length + 1);
  });
});

describe("insideBody", () => {
  it("모서리 라운드 바깥은 몸통이 아니다", () => {
    expect(insideBody(200, 100, 24, [1, 1])).toBe(false); // 좌상단 라운드 바깥
    expect(insideBody(200, 100, 24, [24, 24])).toBe(true); // 라운드 중심
    expect(insideBody(200, 100, 24, [100, 50])).toBe(true);
  });
});

describe("readBubbleParams", () => {
  it("custom.bubble을 읽는다", () => {
    const p = readBubbleParams({ bubble: { w: 10, h: 5, r: 2, pad: 3, fill: "#fff", tip: [12, 4] } });
    expect(p?.w).toBe(10);
    expect(p?.tip).toEqual([12, 4]);
  });

  it("말풍선이 아닌 svg는 null (일반 도형으로 취급)", () => {
    expect(readBubbleParams({ color: "rgb(0,0,0)" })).toBeNull();
    expect(readBubbleParams(null)).toBeNull();
    expect(readBubbleParams({ bubble: { w: 0, h: 0 } })).toBeNull();
  });
});

describe("bubbleSvgMarkup", () => {
  it("xmlns가 있고 viewBox가 pad만큼 넓다 (꼬리가 잘리지 않는다)", () => {
    const svg = bubbleSvgMarkup({ ...BODY, tip: [212, 99] });
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="-20 -20 240 140"');
  });

  it("stroke가 없으면 stroke 속성을 내지 않는다 (단색 말풍선)", () => {
    expect(bubbleSvgMarkup({ ...BODY, stroke: null })).not.toContain("stroke=");
  });
});
