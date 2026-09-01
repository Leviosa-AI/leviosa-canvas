import { describe, expect, it } from "vitest";

import { CanvasStore } from "../store";
import { frameInsertIndex, frameOf, groupFrames } from "../render/frames";

const page = (id: string, frame?: string) => ({
  id,
  custom: frame === undefined ? undefined : { frame },
});

describe("frameOf", () => {
  it("꼬리표가 없으면 빈 프레임이다", () => {
    expect(frameOf(page("p1"))).toBe("");
    expect(frameOf({ custom: {} })).toBe("");
    expect(frameOf({ custom: { frame: 7 } })).toBe("");
  });

  it("꼬리표가 있으면 그 값이다", () => {
    expect(frameOf(page("p1", "A"))).toBe("A");
  });
});

describe("groupFrames", () => {
  // 이 저장소에 이미 있는 문서는 전부 꼬리표가 없다. 그것들이 한 열로 남아야
  // 지금까지 만들어진 문서의 그림이 안 바뀐다.
  it("꼬리표 없는 문서는 순서 그대로 한 열이다", () => {
    const pages = [page("p1"), page("p2"), page("p3")];
    expect(groupFrames(pages)).toEqual([{ key: "", pages }]);
  });

  it("꼬리표마다 열이 하나씩, 처음 나온 순서대로", () => {
    const [a1, b1, a2] = [page("p1", "A"), page("p2", "B"), page("p3", "A")];
    expect(groupFrames([a1, b1, a2])).toEqual([
      { key: "A", pages: [a1, a2] },
      { key: "B", pages: [b1] },
    ]);
  });

  it("꼬리표가 섞여 있으면 없는 쪽도 제 열을 갖는다", () => {
    const [bare, tagged] = [page("p1"), page("p2", "A")];
    expect(groupFrames([bare, tagged])).toEqual([
      { key: "", pages: [bare] },
      { key: "A", pages: [tagged] },
    ]);
  });

  it("빈 문서는 열이 없다", () => {
    expect(groupFrames([])).toEqual([]);
  });
});

describe("frameInsertIndex", () => {
  const pages = [
    page("a1", "A"),
    page("b1", "B"),
    page("a2", "A"),
    page("b2", "B"),
  ];

  it("벌 안의 자리를 문서 전체의 자리로 옮긴다", () => {
    // A 는 문서에서 0, 2 번이다.
    expect(frameInsertIndex(pages, "A", 0)).toBe(0);
    expect(frameInsertIndex(pages, "A", 1)).toBe(2);
    // 맨 뒤는 마지막 장 «다음»이다.
    expect(frameInsertIndex(pages, "A", 2)).toBe(3);
  });

  it("범위를 벗어난 자리는 양 끝으로 접는다", () => {
    expect(frameInsertIndex(pages, "B", -5)).toBe(1);
    expect(frameInsertIndex(pages, "B", 99)).toBe(4);
  });

  it("한 장도 없는 벌은 맨 뒤에 선다", () => {
    expect(frameInsertIndex(pages, "C", 0)).toBe(4);
  });
});

describe("선택이 보고 있는 페이지를 옮긴다", () => {
  it("다른 벌의 요소를 집으면 그 벌의 페이지가 활성이 된다", () => {
    const store = new CanvasStore({
      pages: [
        { id: "a", custom: { frame: "v1" }, children: [{ id: "a1", type: "text" }] },
        { id: "b", custom: { frame: "v2" }, children: [{ id: "b1", type: "text" }] },
      ],
    });
    store.selectPage("a");
    store.selectElements(["b1"]);
    expect(store.activePage?.id).toBe("b");
    expect(frameOf(store.activePage!)).toBe("v2");
  });

  it("선택을 비우면 보고 있던 페이지는 그대로다", () => {
    const store = new CanvasStore({
      pages: [
        { id: "a", children: [{ id: "a1", type: "text" }] },
        { id: "b", children: [] },
      ],
    });
    store.selectPage("b");
    store.selectElements([]);
    expect(store.activePage?.id).toBe("b");
  });
});
