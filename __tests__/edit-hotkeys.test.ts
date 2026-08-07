/**
 * 손버릇.
 *
 * Polotno의 `handleHotkey`를 대신한다. 키 배치를 그대로 물려받았으므로 여기서 재는 것은
 * **같은 키가 같은 일을 하는가**다. 하나 다른 점이 있다 — 스톡에는 `T`·`R`·`L`·`O`를
 * 그냥 누르면 "Sample Text"와 회색 네모가 꽂히는 데모용 키가 있었고, 그건 안 옮겼다.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { clearClipboard, isClipboardEmpty } from "@/lib/leviosa-canvas/edit/commands";
import { handleCanvasHotkey } from "@/lib/leviosa-canvas/edit/hotkeys";
import { createCanvasStore, type CanvasStore } from "@/lib/leviosa-canvas/store";
import type { DocumentJson } from "@/lib/leviosa-canvas/types";

function doc(): DocumentJson {
  return {
    width: 1000,
    height: 500,
    pages: [
      {
        id: "p1",
        children: [
          { id: "a", type: "figure", x: 100, y: 40, width: 200, height: 60 },
          { id: "b", type: "figure", x: 500, y: 300, width: 100, height: 40 },
        ],
      },
    ],
  };
}

function press(
  store: CanvasStore,
  init: KeyboardEventInit & { code?: string },
): boolean {
  const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
  return handleCanvasHotkey(event, store);
}

beforeEach(() => {
  clearClipboard();
  document.body.innerHTML = "";
});

describe("handleCanvasHotkey", () => {
  it("Delete로 고른 것을 지운다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a"]);
    expect(press(store, { key: "Delete" })).toBe(true);
    expect(store.getElementById("a")).toBeNull();
  });

  it("잠긴 요소는 Delete로 안 지워진다", () => {
    const store = createCanvasStore(doc());
    store.getElementById("a")!.set({ locked: true });
    store.selectElements(["a"]);
    expect(press(store, { key: "Delete" })).toBe(false);
    expect(store.getElementById("a")).not.toBeNull();
  });

  it("⌘Z는 되돌리고 ⌘⇧Z는 다시 한다", () => {
    const store = createCanvasStore(doc());
    store.getElementById("a")!.set({ x: 999 });
    press(store, { key: "z", metaKey: true });
    expect(store.getElementById("a")!.x).toBe(100);
    press(store, { key: "z", metaKey: true, shiftKey: true });
    expect(store.getElementById("a")!.x).toBe(999);
  });

  it("⌘A는 현재 페이지를 전부 고른다", () => {
    const store = createCanvasStore(doc());
    press(store, { code: "KeyA", metaKey: true });
    expect(store.selectedElementsIds).toEqual(["a", "b"]);
  });

  it("⌘C·⌘V로 복사해 붙인다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a"]);
    press(store, { code: "KeyC", metaKey: true });
    expect(isClipboardEmpty()).toBe(false);
    press(store, { code: "KeyV", metaKey: true });
    expect(store.pages[0].children).toHaveLength(3);
  });

  it("⌘D는 복제한다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a"]);
    press(store, { code: "KeyD", metaKey: true });
    expect(store.pages[0].children).toHaveLength(3);
    expect(store.selectedElementsIds).not.toEqual(["a"]);
  });

  it("⌘G로 묶고, 묶인 것을 다시 누르면 푼다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a", "b"]);
    press(store, { code: "KeyG", metaKey: true });
    expect(store.pages[0].children).toHaveLength(1);
    press(store, { code: "KeyG", metaKey: true });
    expect(store.pages[0].children).toHaveLength(2);
  });

  it("방향키는 1px, 시프트를 누르면 10px 움직인다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a"]);
    press(store, { code: "ArrowRight" });
    expect(store.getElementById("a")!.x).toBe(101);
    press(store, { code: "ArrowDown", shiftKey: true });
    expect(store.getElementById("a")!.y).toBe(50);
  });

  it("⌥W는 위로 맞춰 세운다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a", "b"]);
    press(store, { code: "KeyW", altKey: true });
    expect(store.getElementById("b")!.y).toBe(40);
  });

  it("]는 맨 앞으로, ⌘]는 한 칸 앞으로", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a"]);
    press(store, { code: "BracketRight" });
    expect(store.pages[0].children.map((el) => el.id)).toEqual(["b", "a"]);
    press(store, { code: "BracketLeft", metaKey: true });
    expect(store.pages[0].children.map((el) => el.id)).toEqual(["a", "b"]);
  });

  it("⌘+ 는 배율을 맡은 사람이 있을 때만 먹는다", () => {
    const store = createCanvasStore(doc());
    expect(press(store, { code: "Equal", metaKey: true })).toBe(false);
    let asked = 0;
    const event = new KeyboardEvent("keydown", {
      code: "Equal",
      metaKey: true,
      cancelable: true,
    });
    expect(
      handleCanvasHotkey(event, store, { setScale: () => (asked += 1) }),
    ).toBe(true);
    expect(asked).toBe(1);
  });

  it("글자를 치는 중에는 끼어들지 않는다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a"]);
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    expect(press(store, { key: "Delete" })).toBe(false);
    expect(store.getElementById("a")).not.toBeNull();
  });

  it("스톡의 데모용 삽입 키(T)는 안 옮겼다", () => {
    const store = createCanvasStore(doc());
    expect(press(store, { code: "KeyT", key: "t" })).toBe(false);
    expect(store.pages[0].children).toHaveLength(2);
  });
});
