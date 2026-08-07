/**
 * 요소가 차지하는 네모 — 정렬·스냅·마퀴가 전부 이 하나를 본다.
 *
 * 그룹이 핵심이다. 그룹은 **자기 폭·높이를 안 믿는다**(G0 계약: 자식이 페이지 좌표를
 * 들고, 그룹의 x/y는 그 뒤로 옮긴 양이다). 여기가 틀리면 정렬은 눈에 보이는 자리가
 * 아니라 문서에 적힌 숫자에 맞춰 세운다 — 화면에서는 어긋난 채로.
 */

import { describe, expect, it } from "vitest";

import { elementRect, moveElementTo, unionRect } from "@/lib/leviosa-canvas/edit/rect";
import { createCanvasStore } from "@/lib/leviosa-canvas/store";
import type { DocumentJson } from "@/lib/leviosa-canvas/types";

function doc(): DocumentJson {
  return {
    width: 750,
    height: 500,
    pages: [
      {
        id: "p1",
        children: [
          { id: "box", type: "figure", x: 10, y: 20, width: 100, height: 40 },
          {
            id: "grp",
            type: "group",
            x: 0,
            y: 0,
            width: 999,
            height: 999,
            children: [
              { id: "a", type: "figure", x: 200, y: 100, width: 50, height: 50 },
              { id: "b", type: "figure", x: 300, y: 120, width: 50, height: 30 },
            ],
          },
        ],
      },
    ],
  };
}

describe("elementRect", () => {
  it("잎 요소는 자기 좌표 그대로다", () => {
    const store = createCanvasStore(doc());
    expect(elementRect(store.getElementById("box")!)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    });
  });

  it("그룹은 자기 폭·높이가 아니라 자식들의 합집합이다", () => {
    const store = createCanvasStore(doc());
    // 문서에 적힌 999×999가 아니라 200..350 × 100..150 이어야 한다.
    expect(elementRect(store.getElementById("grp")!)).toEqual({
      x: 200,
      y: 100,
      width: 150,
      height: 50,
    });
  });

  it("그룹이 옮겨 간 만큼 합집합도 같이 옮겨진다", () => {
    const store = createCanvasStore(doc());
    const group = store.getElementById("grp")!;
    group.set({ x: 30, y: -10 });
    expect(elementRect(group)).toMatchObject({ x: 230, y: 90 });
  });

  it("회전한 요소는 축에 나란한 네모로 감싼다", () => {
    const store = createCanvasStore(doc());
    const box = store.getElementById("box")!;
    box.set({ rotation: 90 });
    // 왼쪽 위를 축으로 90도 — 폭과 높이가 뒤바뀐다.
    const rect = elementRect(box);
    expect(Math.round(rect.width)).toBe(40);
    expect(Math.round(rect.height)).toBe(100);
  });

  it("unionRect는 빈 목록에 null을 준다", () => {
    expect(unionRect([])).toBeNull();
  });
});

describe("moveElementTo", () => {
  it("그룹은 자식을 안 건드리고 자기 x/y만 옮긴다", () => {
    const store = createCanvasStore(doc());
    const group = store.getElementById("grp")!;
    moveElementTo(group, 0, 0);
    expect(elementRect(group)).toMatchObject({ x: 0, y: 0 });
    // 자식은 그대로 — 그룹 좌표에 얹혀 따라온다.
    expect(store.getElementById("a")!.x).toBe(200);
    expect(group.x).toBe(-200);
  });

  it("이미 그 자리면 아무것도 안 한다", () => {
    const store = createCanvasStore(doc());
    const box = store.getElementById("box")!;
    const before = box.version;
    moveElementTo(box, 10, 20);
    expect(box.version).toBe(before);
  });
});
