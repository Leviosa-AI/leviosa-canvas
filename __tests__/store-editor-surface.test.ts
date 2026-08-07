/**
 * 편집기가 스토어에 대고 부르는 것들 (G7-b).
 *
 * 여기 있는 것은 그리기와 무관하다 — 페이지 툴바, 글꼴 등록, 저장·QA가 문서 변경을
 * 듣는 통로다. 전환의 판정 기준이 "편집기가 이 스토어 위에서 도는가"라서, 그 접점을
 * 하나씩 못박는다.
 */

import { describe, expect, it, vi } from "vitest";

import { createCanvasStore } from "@/lib/leviosa-canvas/store";
import type { DocumentJson } from "@/lib/leviosa-canvas/types";

function doc(): DocumentJson {
  return {
    width: 800,
    height: 600,
    pages: [
      { id: "p1", children: [{ id: "a", type: "text", text: "가" }] },
      { id: "p2", children: [] },
    ],
  };
}

describe("페이지 순서·복제", () => {
  it("setZIndex로 페이지를 옮긴다", () => {
    const store = createCanvasStore(doc());
    store.pages[1].setZIndex(0);
    expect(store.pages.map((page) => page.id)).toEqual(["p2", "p1"]);
  });

  it("범위를 벗어난 자리는 끝으로 잘린다", () => {
    const store = createCanvasStore(doc());
    store.pages[0].setZIndex(9);
    expect(store.pages.map((page) => page.id)).toEqual(["p2", "p1"]);
  });

  it("clone은 바로 뒤에 꽂고 id를 전부 새로 딴다", () => {
    const store = createCanvasStore(doc());
    const copy = store.pages[0].clone();

    expect(store.pages.map((page) => page.id)[1]).toBe(copy.id);
    expect(copy.id).not.toBe("p1");
    expect(copy.children[0].id).not.toBe("a");
    // 내용은 그대로 따라온다.
    expect(copy.children[0].text).toBe("가");
  });

  it('페이지 크기 "auto"는 문서 값을 따른다', () => {
    // 페이지 추가 버튼이 실제로 이렇게 부른다. 문자열을 그대로 얹으면 상자 계산이
    // 조용히 NaN 이 된다.
    const store = createCanvasStore(doc());
    const page = store.addPage({ width: "auto", height: "auto" });

    expect(page.width).toBe(800);
    expect(page.computedHeight).toBe(600);
  });
});

describe("메서드는 떼어 가도 돈다", () => {
  it("스토어에서 떼어낸 메서드가 자기 스토어를 기억한다", () => {
    // 편집기 코드에 `const byId = store.getElementById` 처럼 떼어 쓰는 자리가 있다.
    // 예전 스토어의 액션은 늘 묶여 있어서 통했고, 안 묶으면 `this`를 잃고 터진다.
    const store = createCanvasStore(doc());
    const { getElementById, selectElements } = store;

    expect(getElementById("a")?.id).toBe("a");
    selectElements(["a"]);
    expect(store.selectedElementsIds).toEqual(["a"]);
  });

  it("묶은 메서드가 직렬화에 섞이지 않는다", () => {
    const store = createCanvasStore(doc());
    expect(Object.keys(store.toJSON())).toEqual(["width", "height", "pages"]);
  });
});

describe("문서 변경 알림", () => {
  it("문서가 바뀌면 부르고, 선택이 바뀌면 안 부른다", () => {
    const store = createCanvasStore(doc());
    const seen = vi.fn();
    store.on("change", seen);

    store.selectElements(["a"]);
    expect(seen).not.toHaveBeenCalled();

    store.getElementById("a")!.set({ text: "나" });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("문서를 통째로 갈아 끼워도 부른다", () => {
    const store = createCanvasStore(doc());
    const seen = vi.fn();
    store.on("change", seen);
    store.loadJSON({ width: 10, height: 10, pages: [] });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("끊으면 더 안 온다", () => {
    const store = createCanvasStore(doc());
    const seen = vi.fn();
    const off = store.on("change", seen);
    off();
    store.getElementById("a")!.set({ text: "다" });
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("글꼴 등록", () => {
  it("문서의 fonts 자리에 쌓이고 같은 이름은 갈아 끼운다", () => {
    const store = createCanvasStore(doc());
    store.addFont({ fontFamily: "Gowun", styles: [{ fontWeight: "400" }] });
    store.addFont({ fontFamily: "Gowun", styles: [{ fontWeight: "700" }] });

    expect(store.fonts).toHaveLength(1);
    expect(store.fonts[0].styles).toEqual([{ fontWeight: "700" }]);
    expect((store.toJSON().fonts as unknown[]).length).toBe(1);
  });

  it("글꼴 등록은 되돌리기 단계를 만들지 않는다", () => {
    // 사용자의 편집이 아니라 문서를 여는 과정에서 일어난다.
    const store = createCanvasStore(doc());
    store.addFont({ fontFamily: "Gowun" });
    expect(store.history.canUndo).toBe(false);
  });
});
