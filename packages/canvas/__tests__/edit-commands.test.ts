// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * 정렬·순서·복제·클립보드.
 *
 * 셋 다 스톡 편집기에서 오던 것이라 **손버릇이 같은지**가 판정 기준이다 — 하나만 골랐을 때
 * 페이지 기준으로 맞추는 것, 그룹 **안에서** 순서가 바뀌는 것, 같은 페이지에 붙이면
 * 어긋나게 놓이는 것.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  alignElements,
  clearClipboard,
  copyElements,
  cutElements,
  duplicateElements,
  isClipboardEmpty,
  moveElements,
  pasteElements,
  pasteExternal,
} from "../edit/commands";
import { clearImageCache } from "../render/image-cache";
import { elementRect } from "../edit/rect";
import { createCanvasStore } from "../store";
import type { DocumentJson } from "../types";

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
          {
            id: "grp",
            type: "group",
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            children: [
              { id: "g1", type: "figure", x: 10, y: 10, width: 20, height: 20 },
              { id: "g2", type: "figure", x: 40, y: 10, width: 20, height: 20 },
              { id: "g3", type: "figure", x: 70, y: 10, width: 20, height: 20 },
            ],
          },
        ],
      },
    ],
  };
}

beforeEach(() => clearClipboard());

describe("alignElements", () => {
  it("하나만 골랐으면 페이지가 기준이다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a"]);
    alignElements(store, "center");
    // (1000 - 200) / 2 = 400
    expect(elementRect(store.getElementById("a")!).x).toBe(400);
  });

  it("여럿이면 고른 것들의 바깥 네모가 기준이다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a", "b"]);
    alignElements(store, "left");
    // 둘 중 왼쪽 끝(100)에 맞춘다 — 페이지 왼쪽(0)이 아니다.
    expect(store.getElementById("a")!.x).toBe(100);
    expect(store.getElementById("b")!.x).toBe(100);
  });

  it("그룹도 눈에 보이는 자리로 맞춘다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["grp"]);
    alignElements(store, "left");
    expect(elementRect(store.getElementById("grp")!).x).toBe(0);
    // 자식 좌표는 그대로여야 한다(G0 계약).
    expect(store.getElementById("g1")!.x).toBe(10);
  });

  it("잠긴 것은 안 움직이지만 기준 네모에는 낀다", () => {
    const store = createCanvasStore(doc());
    store.getElementById("a")!.set({ locked: true });
    store.selectElements(["a", "b"]);
    alignElements(store, "left");
    expect(store.getElementById("a")!.x).toBe(100);
    // 잠긴 것을 기준에서까지 빼면 남은 하나가 "혼자"가 되어 페이지 왼쪽(0)으로 간다.
    expect(store.getElementById("b")!.x).toBe(100);
  });

  it("한 번 되돌리면 전부 제자리로 온다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a", "b"]);
    alignElements(store, "top");
    store.history.undo();
    expect(store.getElementById("a")!.y).toBe(40);
    expect(store.getElementById("b")!.y).toBe(300);
  });
});

describe("moveElements", () => {
  const order = (store: ReturnType<typeof createCanvasStore>, id: string) =>
    store.getElementById(id)!.parent!.children.map((el) => el.id);

  it("그룹 안 요소는 그룹 안에서 움직인다", () => {
    const store = createCanvasStore(doc());
    moveElements(store, ["g1"], "up");
    expect(order(store, "g1")).toEqual(["g2", "g1", "g3"]);
  });

  it("맨 앞으로 보내면 형제 끝으로 간다", () => {
    const store = createCanvasStore(doc());
    moveElements(store, ["g1"], "top");
    expect(order(store, "g1")).toEqual(["g2", "g3", "g1"]);
  });

  it("여럿을 함께 올려도 서로 밀어내지 않는다", () => {
    const store = createCanvasStore(doc());
    moveElements(store, ["g1", "g2"], "up");
    expect(order(store, "g1")).toEqual(["g3", "g1", "g2"]);
  });

  it("맨 끝에서 더 올려도 그대로다", () => {
    const store = createCanvasStore(doc());
    moveElements(store, ["g3"], "up");
    expect(order(store, "g3")).toEqual(["g1", "g2", "g3"]);
  });
});

describe("duplicateElements", () => {
  it("바로 뒤에 놓고 선택을 복제본으로 옮긴다", () => {
    const store = createCanvasStore(doc());
    const made = duplicateElements(store, ["a"]);
    expect(made).toHaveLength(1);
    expect(store.selectedElementsIds).toEqual(made);
    const page = store.pages[0];
    expect(page.children[1].id).toBe(made[0]);
    expect(page.children[1].x).toBe(110);
  });

  it("자손 id까지 새로 딴다", () => {
    const store = createCanvasStore(doc());
    const [id] = duplicateElements(store, ["grp"]);
    const copy = store.getElementById(id)!;
    expect(copy.children.map((el) => el.id)).not.toContain("g1");
    expect(copy.children).toHaveLength(3);
  });
});

describe("클립보드", () => {
  it("복사한 뒤 붙이면 같은 페이지에서는 어긋나게 놓인다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a"]);
    copyElements(store);
    const made = pasteElements(store);
    const copy = store.getElementById(made[0])!;
    // 1000 / 20 = 50
    expect(copy.x).toBe(150);
    expect(copy.y).toBe(90);
    expect(store.selectedElementsIds).toEqual(made);
  });

  it("연달아 붙이면 계단처럼 쌓인다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a"]);
    copyElements(store);
    pasteElements(store);
    const second = pasteElements(store);
    expect(store.getElementById(second[0])!.x).toBe(200);
  });

  it("잘라내기는 원본을 지우고 클립보드에 남긴다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["b"]);
    cutElements(store);
    expect(store.getElementById("b")).toBeNull();
    expect(isClipboardEmpty()).toBe(false);
    const made = pasteElements(store);
    expect(store.getElementById(made[0])!.width).toBe(100);
  });

  it("빈 클립보드로는 아무 일도 안 일어난다", () => {
    const store = createCanvasStore(doc());
    expect(isClipboardEmpty()).toBe(true);
    expect(pasteElements(store)).toEqual([]);
    expect(store.pages[0].children).toHaveLength(3);
  });

  it("들어가 있는 그룹이 있으면 그 안에, 그룹 기준 좌표로 붙인다", () => {
    const store = createCanvasStore(doc());
    store.getElementById("grp")!.set({ x: 30, y: 20 });
    store.selectElements(["a"]);
    copyElements(store);
    const made = pasteElements(store, "grp");
    const copy = store.getElementById(made[0])!;
    expect(copy.parent).toBe(store.getElementById("grp"));
    // 보이는 자리는 a(100,40) + 50 어긋남 — 그룹 오프셋만큼 빼서 든다.
    expect(copy.absolutePosition).toEqual({ x: 150, y: 90 });
  });

  it("옮긴 그룹 안에서 복사해 밖에 붙이면 보이던 자리에 놓인다", () => {
    const store = createCanvasStore(doc());
    store.getElementById("grp")!.set({ x: 30, y: 20 });
    store.selectElements(["g1"]);
    copyElements(store);
    const made = pasteElements(store);
    const copy = store.getElementById(made[0])!;
    expect(copy.parent).toBe(store.pages[0]);
    expect({ x: copy.x, y: copy.y }).toEqual({ x: 90, y: 80 });
  });
});

describe("pasteExternal", () => {
  class FakeImage {
    crossOrigin = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 2000;
    naturalHeight = 500;
    set src(_: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  beforeEach(() => {
    clearImageCache();
    vi.stubGlobal("Image", FakeImage);
    let n = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:x${++n}`);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("그림 파일은 페이지에 맞춰 줄인 image 요소가 된다", async () => {
    const store = createCanvasStore(doc());
    const file = new File(["x"], "a.png", { type: "image/png" });
    const made = await pasteExternal(store, { files: [file] });
    const el = store.getElementById(made[0])!;
    expect(el.type).toBe("image");
    expect(el.src).toBe("blob:x1");
    // 1000 × 0.8 = 800 폭, 비율 유지
    expect({ w: el.width, h: el.height }).toEqual({ w: 800, h: 200 });
    expect({ x: el.x, y: el.y }).toEqual({ x: 100, y: 150 });
    expect(store.selectedElementsIds).toEqual(made);
  });

  it("글자만 있으면 text 요소 하나", async () => {
    const store = createCanvasStore(doc());
    const made = await pasteExternal(store, { text: "  안녕  " });
    const el = store.getElementById(made[0])!;
    expect(el.type).toBe("text");
    expect(el.text).toBe("안녕");
  });

  it("그림이 아닌 파일과 빈 글자는 무시한다", async () => {
    const store = createCanvasStore(doc());
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    expect(await pasteExternal(store, { files: [file], text: " " })).toEqual([]);
    expect(store.history.canUndo).toBe(false);
  });
});
