import { describe, expect, it } from "vitest";

import {
  createCanvasStore,
  walkElements,
  type CanvasStore,
} from "@/lib/leviosa-canvas/store";
import type { DocumentJson } from "@/lib/leviosa-canvas/types";

/** 그룹 하나 + 최상위 둘. 우리가 모르는 필드(`custom`, `mystery`)도 섞어 둔다. */
function doc(): DocumentJson {
  return {
    width: 860,
    height: 1200,
    unit: "px",
    dpi: 72,
    fonts: [{ fontFamily: "Pretendard" }],
    mystery: { kept: true },
    pages: [
      {
        id: "page-1",
        background: "#ffffff",
        custom: { screen: "hero" },
        children: [
          {
            id: "bg",
            type: "figure",
            subType: "rect",
            x: 0,
            y: 0,
            width: 860,
            height: 400,
            fill: "#eee",
          },
          {
            id: "grp",
            type: "group",
            x: 100,
            y: 200,
            width: 300,
            height: 120,
            children: [
              {
                id: "title",
                type: "text",
                x: 0,
                y: 0,
                width: 300,
                height: 60,
                text: "안녕하세요",
                fontSize: 40,
                custom: { slot: "headline" },
              },
              {
                id: "sub",
                type: "text",
                x: 0,
                y: 70,
                width: 300,
                height: 50,
                text: "반갑습니다",
                fontSize: 20,
              },
            ],
          },
          {
            id: "photo",
            type: "image",
            x: 40,
            y: 600,
            width: 200,
            height: 200,
            src: "https://example.test/a.png",
          },
        ],
      },
      { id: "page-2", children: [] },
    ],
  };
}

function ids(store: CanvasStore, pageIndex = 0): string[] {
  return store.pages[pageIndex].children.map((el) => el.id);
}

describe("CanvasStore — 직렬화", () => {
  it("Polotno JSON을 무손실로 되돌려 쓴다 (모르는 필드 포함)", () => {
    const source = doc();
    const store = createCanvasStore(source);
    expect(store.toJSON()).toEqual(source);
  });

  it("문서 상단 필드를 잃지 않는다", () => {
    const store = createCanvasStore(doc());
    const json = store.toJSON();
    expect(json.unit).toBe("px");
    expect(json.dpi).toBe(72);
    expect(json.mystery).toEqual({ kept: true });
    expect(json.fonts).toEqual([{ fontFamily: "Pretendard" }]);
  });

  it("id 없는 요소에는 id를 발급한다", () => {
    const store = createCanvasStore({
      pages: [{ children: [{ type: "text", text: "hi" }] }],
    });
    const el = store.pages[0].children[0];
    expect(el.id).toMatch(/^lc/);
    expect(store.pages[0].id).toMatch(/^pg/);
  });
});

describe("CanvasStore — 조회", () => {
  it("그룹 안 요소도 id로 찾는다", () => {
    const store = createCanvasStore(doc());
    expect(store.getElementById("title")?.type).toBe("text");
    expect(store.getPageOfElement("title")?.id).toBe("page-1");
  });

  it("그룹 자식의 절대 좌표는 조상 x/y를 더한 값", () => {
    const store = createCanvasStore(doc());
    expect(store.getElementById("sub")?.absolutePosition).toEqual({
      x: 100,
      y: 270,
    });
  });

  it("walkElements가 그룹 안까지 훑는다", () => {
    const store = createCanvasStore(doc());
    const seen: string[] = [];
    walkElements(store, (el) => seen.push(el.id));
    expect(seen).toEqual(["bg", "grp", "title", "sub", "photo"]);
  });
});

describe("CanvasStore — 변경과 구독", () => {
  it("set은 그 요소의 version만 올린다", () => {
    const store = createCanvasStore(doc());
    const title = store.getElementById("title")!;
    const sub = store.getElementById("sub")!;
    const before = sub.version;
    title.set({ text: "바뀜" });
    expect(title.version).toBe(1);
    expect(sub.version).toBe(before);
    expect(title.text).toBe("바뀜");
  });

  it("같은 값을 넣으면 아무 일도 안 일어난다", () => {
    const store = createCanvasStore(doc());
    const title = store.getElementById("title")!;
    let notified = 0;
    store.subscribe(() => (notified += 1));
    title.set({ text: "안녕하세요" });
    expect(title.version).toBe(0);
    expect(notified).toBe(0);
  });

  it("id와 children은 set으로 못 바꾼다", () => {
    const store = createCanvasStore(doc());
    const title = store.getElementById("title")!;
    title.set({ id: "hacked", children: [] });
    expect(title.id).toBe("title");
  });

  it("구독자는 변경마다 한 번만 불린다", () => {
    const store = createCanvasStore(doc());
    let notified = 0;
    store.subscribe(() => (notified += 1));
    store.getElementById("title")!.set({ x: 5 });
    store.getElementById("sub")!.set({ x: 6 });
    expect(notified).toBe(2);
  });
});

describe("CanvasStore — 순서·복제·삭제", () => {
  it("setElementZIndex로 형제 순서를 옮긴다", () => {
    const store = createCanvasStore(doc());
    store.pages[0].setElementZIndex("bg", 2);
    expect(ids(store)).toEqual(["grp", "photo", "bg"]);
  });

  it("그룹 안에서도 순서를 옮긴다", () => {
    const store = createCanvasStore(doc());
    const group = store.getElementById("grp")!;
    group.setElementZIndex("sub", 0);
    expect(group.children.map((c) => c.id)).toEqual(["sub", "title"]);
  });

  it("clone은 바로 뒤에 새 id로 끼우고 선택을 옮긴다", () => {
    const store = createCanvasStore(doc());
    const copy = store.getElementById("grp")!.clone()!;
    expect(copy.id).not.toBe("grp");
    expect(ids(store)).toEqual(["bg", "grp", copy.id, "photo"]);
    expect(store.selectedElementsIds).toEqual([copy.id]);
    // 자손 id도 전부 새로 딴다 — 같은 id가 둘이면 나중에 한쪽을 잃는다.
    const cloned = copy.children.map((c) => c.id);
    expect(cloned).not.toContain("title");
    expect(cloned).not.toContain("sub");
    expect(copy.children[0].text).toBe("안녕하세요");
  });

  it("clone(skipSelect)은 선택을 건드리지 않는다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["photo"]);
    store.getElementById("bg")!.clone(undefined, { skipSelect: true });
    expect(store.selectedElementsIds).toEqual(["photo"]);
  });

  it("삭제하면 선택에서도 빠진다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["bg", "photo"]);
    store.deleteElements(["bg"]);
    expect(ids(store)).toEqual(["grp", "photo"]);
    expect(store.selectedElementsIds).toEqual(["photo"]);
  });
});

describe("CanvasStore — 그룹", () => {
  it("그룹 상자는 자식 합집합이고 자식 좌표는 그룹 기준으로 바뀐다", () => {
    const store = createCanvasStore(doc());
    const group = store.groupElements(["bg", "photo"])!;
    expect({
      x: group.x,
      y: group.y,
      width: group.width,
      height: group.height,
    }).toEqual({ x: 0, y: 0, width: 860, height: 800 });
    const photo = store.getElementById("photo")!;
    expect({ x: photo.x, y: photo.y }).toEqual({ x: 40, y: 600 });
    // 절대 좌표는 그대로여야 한다 — 묶었다고 그림이 움직이면 안 된다.
    expect(photo.absolutePosition).toEqual({ x: 40, y: 600 });
  });

  it("그룹은 첫 요소가 있던 z 자리에 들어간다", () => {
    const store = createCanvasStore(doc());
    const group = store.groupElements(["grp", "photo"])!;
    expect(ids(store)).toEqual(["bg", group.id]);
  });

  it("부모가 다르면 묶지 않는다", () => {
    const store = createCanvasStore(doc());
    expect(store.groupElements(["bg", "title"])).toBeNull();
  });

  it("해제하면 자식이 그룹 자리에 그대로 돌아온다", () => {
    const store = createCanvasStore(doc());
    store.ungroupElements(["grp"]);
    expect(ids(store)).toEqual(["bg", "title", "sub", "photo"]);
    const sub = store.getElementById("sub")!;
    expect({ x: sub.x, y: sub.y }).toEqual({ x: 100, y: 270 });
    expect(store.selectedElementsIds).toEqual(["title", "sub"]);
  });

  it("묶었다 풀면 원래 좌표로 돌아온다", () => {
    const store = createCanvasStore(doc());
    const group = store.groupElements(["bg", "photo"])!;
    store.ungroupElements([group.id]);
    const photo = store.getElementById("photo")!;
    expect({ x: photo.x, y: photo.y }).toEqual({ x: 40, y: 600 });
  });
});

describe("CanvasStore — 히스토리", () => {
  it("undo/redo가 문서를 되돌린다", () => {
    const store = createCanvasStore(doc());
    const before = JSON.stringify(store.toJSON());
    store.getElementById("title")!.set({ text: "바뀜" });
    expect(store.history.canUndo).toBe(true);

    store.history.undo();
    expect(store.getElementById("title")!.text).toBe("안녕하세요");
    expect(JSON.stringify(store.toJSON())).toBe(before);

    store.history.redo();
    expect(store.getElementById("title")!.text).toBe("바뀜");
  });

  it("트랜잭션 하나는 undo 한 번으로 되돌아간다", () => {
    const store = createCanvasStore(doc());
    store.history.startTransaction();
    store.getElementById("title")!.set({ x: 1 });
    store.getElementById("sub")!.set({ x: 2 });
    store.getElementById("photo")!.set({ x: 3 });
    store.history.endTransaction();

    store.history.undo();
    expect(store.getElementById("title")!.x).toBe(0);
    expect(store.getElementById("sub")!.x).toBe(0);
    expect(store.getElementById("photo")!.x).toBe(40);
    expect(store.history.canUndo).toBe(false);
  });

  it("아무것도 안 바꾼 트랜잭션은 undo 단계를 만들지 않는다", () => {
    const store = createCanvasStore(doc());
    store.history.startTransaction();
    store.history.endTransaction();
    expect(store.history.canUndo).toBe(false);
  });

  it("선택은 문서 변경이 아니므로 히스토리에 안 남는다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["photo"]);
    store.selectPage("page-2");
    expect(store.history.canUndo).toBe(false);
  });

  it("undo는 그때의 선택도 되돌린다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["photo"]);
    store.deleteElements(["photo"]);
    expect(store.selectedElementsIds).toEqual([]);
    store.history.undo();
    expect(store.selectedElementsIds).toEqual(["photo"]);
    expect(ids(store)).toEqual(["bg", "grp", "photo"]);
  });

  it("새 변경은 redo 스택을 버린다", () => {
    const store = createCanvasStore(doc());
    store.getElementById("title")!.set({ x: 1 });
    store.history.undo();
    expect(store.history.canRedo).toBe(true);
    store.getElementById("sub")!.set({ x: 9 });
    expect(store.history.canRedo).toBe(false);
  });
});

describe("CanvasStore — 선택과 페이지", () => {
  it("없는 id는 선택되지 않는다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["title", "없는것"]);
    expect(store.selectedElementsIds).toEqual(["title"]);
    expect(store.selectedElements.map((el) => el.id)).toEqual(["title"]);
  });

  it("activePage는 기본이 첫 페이지, selectPage로 옮긴다", () => {
    const store = createCanvasStore(doc());
    expect(store.activePage?.id).toBe("page-1");
    store.selectPage("page-2");
    expect(store.activePage?.id).toBe("page-2");
  });
});
