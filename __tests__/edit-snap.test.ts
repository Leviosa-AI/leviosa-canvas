/**
 * 붙는 자리.
 *
 * 제일 중요한 규칙은 "가장 가까운 한 줄에만 붙는다"다. 축마다 후보를 다 붙이면 요소가
 * 두 군데로 끌려가 덜덜 떤다 — 눈으로만 보면 원인을 못 찾는 종류의 버그다.
 */

import { describe, expect, it } from "vitest";

import {
  rectFromPoints,
  rectsOverlap,
  snapRect,
} from "@/lib/leviosa-canvas/edit/snap";

const page = { width: 1000, height: 500 };
const box = (x: number, y: number, width = 100, height = 50) => ({
  x,
  y,
  width,
  height,
});

describe("snapRect", () => {
  it("가까운 왼쪽 변에 붙는다", () => {
    const result = snapRect(box(103, 300), [box(100, 40)], page, 6);
    expect(result.dx).toBe(-3);
    expect(result.guides.some((g) => g.orientation === "v")).toBe(true);
  });

  it("멀면 안 붙는다", () => {
    const result = snapRect(box(120, 300), [box(100, 40)], page, 6);
    expect(result).toMatchObject({ dx: 0, dy: 0, guides: [] });
  });

  it("한 축에서는 가장 가까운 한 줄만 고른다", () => {
    // 왼쪽 변끼리는 4px, 가운데끼리는 1px 차이 — 가운데가 이겨야 한다.
    const result = snapRect(box(104, 300), [box(100, 40), box(105, 40)], page, 6);
    expect(result.guides.filter((g) => g.orientation === "v")).toHaveLength(1);
    expect(result.dx).toBe(1);
  });

  it("페이지 한가운데도 상대다", () => {
    // 폭 100짜리를 가운데(500)에 두려면 x=450. 452에서 끌면 -2로 당겨진다.
    const result = snapRect(box(452, 300), [], page, 6);
    expect(result.dx).toBe(-2);
    expect(result.guides[0]?.position).toBe(500);
  });

  it("가로·세로가 동시에 붙을 수 있다", () => {
    const result = snapRect(box(102, 42), [box(100, 40)], page, 6);
    expect(result.dx).toBe(-2);
    expect(result.dy).toBe(-2);
    expect(result.guides).toHaveLength(2);
  });

  it("허용 거리가 0이면 아무것도 안 한다", () => {
    expect(snapRect(box(100, 40), [box(100, 40)], page, 0).guides).toEqual([]);
  });

  it("정렬선은 나와 상대를 함께 덮는다", () => {
    const result = snapRect(box(100, 300), [box(100, 40)], page, 6);
    const guide = result.guides.find((g) => g.orientation === "v")!;
    expect(guide.from).toBe(40);
    expect(guide.to).toBe(350);
  });
});

describe("rectsOverlap", () => {
  it("스치기만 해도 걸린다", () => {
    expect(rectsOverlap(box(0, 0, 100, 100), box(99, 99, 10, 10))).toBe(true);
  });

  it("변이 딱 맞닿으면 안 걸린다", () => {
    expect(rectsOverlap(box(0, 0, 100, 100), box(100, 0, 10, 10))).toBe(false);
  });
});

describe("rectFromPoints", () => {
  it("어느 방향으로 끌든 양수 폭·높이다", () => {
    expect(rectFromPoints(100, 80, 40, 20)).toEqual({
      x: 40,
      y: 20,
      width: 60,
      height: 60,
    });
  });
});
