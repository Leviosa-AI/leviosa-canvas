import { describe, expect, it } from "vitest";

import {
  canDistribute,
  distributeCoords,
  toItems,
  type DistributeItem,
} from "../distribute";

/** 시작 좌표만 뽑아 읽기 쉽게. */
function coords(items: DistributeItem[]): number[] | null {
  const map = distributeCoords(items);
  return map ? items.map((it) => map.get(it.id)!) : null;
}

describe("distributeCoords", () => {
  it("크기가 같으면 등간격", () => {
    const out = coords([
      { id: "a", start: 0, size: 100 },
      { id: "b", start: 130, size: 100 },
      { id: "c", start: 400, size: 100 },
    ]);
    // 전체 폭 500, 내용 300 → 여백 200을 둘로 나눠 100씩.
    expect(out).toEqual([0, 200, 400]);
  });

  it("크기가 다르면 중심이 아니라 여백을 고르게 한다", () => {
    // 중심 등간격이면 큰 것 옆이 좁아 보인다 — 눈이 재는 건 사이 여백이다.
    const out = coords([
      { id: "a", start: 0, size: 100 },
      { id: "b", start: 200, size: 40 },
      { id: "c", start: 400, size: 100 },
    ]);
    // 전체 폭 500, 내용 240 → 여백 260/2 = 130. a끝 100 + 130 = 230.
    expect(out).toEqual([0, 230, 400]);
  });

  it("양 끝은 그대로 둔다", () => {
    // 사용자가 잡아 둔 전체 폭이 안 변해야 결과가 예측된다.
    const items: DistributeItem[] = [
      { id: "a", start: 40, size: 60 },
      { id: "b", start: 300, size: 60 },
      { id: "c", start: 500, size: 60 },
      { id: "d", start: 700, size: 60 },
    ];
    const out = coords(items)!;
    expect(out[0]).toBe(40);
    expect(out[3]).toBe(700);
  });

  it("순서가 뒤섞여 들어와도 자리로 판단한다", () => {
    // 선택 순서는 화면 순서와 무관하다.
    const out = distributeCoords([
      { id: "c", start: 400, size: 100 },
      { id: "a", start: 0, size: 100 },
      { id: "b", start: 130, size: 100 },
    ])!;
    expect([out.get("a"), out.get("b"), out.get("c")]).toEqual([0, 200, 400]);
  });

  it("겹쳐 있으면 고르게 겹친다", () => {
    // 여백이 음수여도 그대로 쓴다 — 제멋대로 겹치는 것보단 낫고, 폭을 넓히면 풀린다.
    const out = coords([
      { id: "a", start: 0, size: 100 },
      { id: "b", start: 10, size: 100 },
      { id: "c", start: 20, size: 100 },
    ]);
    expect(out).toEqual([0, 10, 20]);
  });

  it("셋 미만이면 null", () => {
    // 둘은 배분할 사이가 하나뿐이라 아무 것도 안 바뀐다.
    expect(
      distributeCoords([
        { id: "a", start: 0, size: 10 },
        { id: "b", start: 50, size: 10 },
      ]),
    ).toBeNull();
  });

  it("전부 같은 자리에 겹쳐 있으면 null", () => {
    expect(
      distributeCoords([
        { id: "a", start: 0, size: 0 },
        { id: "b", start: 0, size: 0 },
        { id: "c", start: 0, size: 0 },
      ]),
    ).toBeNull();
  });
});

describe("canDistribute", () => {
  const parent = { id: "g" };

  it("셋 이상 · 같은 부모", () => {
    expect(
      canDistribute([
        { id: "a", parent },
        { id: "b", parent },
        { id: "c", parent },
      ]),
    ).toBe(true);
  });

  it("부모가 섞이면 안 된다", () => {
    // 그룹 자식의 x/y는 그룹 로컬 좌표다 — 최상위와 섞으면 뒤섞인 결과가 나온다.
    expect(
      canDistribute([
        { id: "a", parent },
        { id: "b", parent: { id: "other" } },
        { id: "c", parent },
      ]),
    ).toBe(false);
  });

  it("둘 이하는 안 된다", () => {
    expect(canDistribute([{ id: "a", parent }, { id: "b", parent }])).toBe(false);
  });
});

describe("toItems", () => {
  it("축에 맞는 좌표·크기를 뽑는다", () => {
    const els = [{ id: "a", x: 10, y: 20, width: 30, height: 40 }];
    expect(toItems(els, "x")).toEqual([{ id: "a", start: 10, size: 30 }]);
    expect(toItems(els, "y")).toEqual([{ id: "a", start: 20, size: 40 }]);
  });

  it("숫자가 아니면 null", () => {
    // 값 하나가 비었는데 나머지만 옮기면 배치가 더 망가진다.
    expect(toItems([{ id: "a", x: 10 }], "x")).toBeNull();
    expect(toItems([{ id: "a", x: Number.NaN, width: 10 }], "x")).toBeNull();
  });
});
