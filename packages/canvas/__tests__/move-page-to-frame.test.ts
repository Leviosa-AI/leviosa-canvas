import { describe, expect, it } from "vitest";

import { movePageToFrame } from "../edit/commands";
import { frameOf } from "../render/frames";
import { createCanvasStore } from "../store";
import type { DocumentJson } from "../types";

function doc(): DocumentJson {
  const page = (id: string, frame: string, text: string) => ({
    id,
    background: "#ffffff",
    custom: { frame, note: "지켜져야 한다" },
    children: [
      {
        id: `${id}-t`,
        type: "text",
        x: 0,
        y: 0,
        width: 100,
        height: 40,
        text,
        fontFamily: "Pretendard",
      },
    ],
  });
  return {
    width: 1080,
    height: 1350,
    pages: [page("a1", "A", "1안 첫장"), page("b1", "B", "2안 첫장")],
  } as DocumentJson;
}

describe("movePageToFrame", () => {
  it("끌면 옮겨진다 — 원본은 그 벌에서 없어진다", () => {
    const store = createCanvasStore(doc());
    const made = movePageToFrame(store, "b1", "A", 1);

    expect(made).not.toBeNull();
    expect(store.getPageById("b1")).toBeNull();
    expect(store.pages.map((p) => frameOf(p))).toEqual(["A", "A"]);
    expect(store.pages[1].id).toBe(made?.id);
  });

  it("⌥ 로 끌면 원본이 남는다", () => {
    const store = createCanvasStore(doc());
    const made = movePageToFrame(store, "b1", "A", 1, true);

    expect(store.getPageById("b1")).not.toBeNull();
    expect(store.pages.map((p) => frameOf(p))).toEqual(["A", "A", "B"]);
    expect(store.pages[1].id).toBe(made?.id);
  });

  it("id 를 전부 새로 딴다 — 문서 안에서 유일해야 한다", () => {
    const store = createCanvasStore(doc());
    const made = movePageToFrame(store, "b1", "A", 0);

    const ids = store.pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(made?.id).not.toBe("b1");
    expect(made?.children[0].id).not.toBe("b1-t");
    // 내용은 그대로 따라와야 한다.
    expect(made?.children[0].text).toBe("2안 첫장");
    // 우리가 모르는 값도 지우지 않는다.
    expect((made?.custom as Record<string, unknown>).note).toBe("지켜져야 한다");
  });

  it("놓은 자리를 활성으로 만든다", () => {
    const store = createCanvasStore(doc());
    const made = movePageToFrame(store, "b1", "A", 1);
    expect(store.activePage?.id).toBe(made?.id);
  });

  it("되돌리기 한 번에 없던 일이 된다", () => {
    const store = createCanvasStore(doc());
    movePageToFrame(store, "b1", "A", 1);
    expect(store.pages).toHaveLength(2);
    store.history.undo();
    expect(store.pages.map((p) => p.id)).toEqual(["a1", "b1"]);
    expect(store.pages.map((p) => frameOf(p))).toEqual(["A", "B"]);
  });

  it("없는 판은 아무 일도 안 한다", () => {
    const store = createCanvasStore(doc());
    expect(movePageToFrame(store, "없음", "A", 0)).toBeNull();
    expect(store.pages).toHaveLength(2);
  });
});
