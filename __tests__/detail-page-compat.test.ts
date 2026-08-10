/**
 * 이 파일이 이 프로젝트의 성립 근거다.
 *
 * `src/lib/detail-page/*` 의 편집 로직들은 Canvas 스토어를 보고 짠 것이지만, 전부
 * **구조적 타입**으로만 스토어를 받는다. 그래서 새 엔진이 같은 이름으로 같은 일을 하면
 * 그 모듈들은 한 줄도 안 고치고 돈다 — 여기서 실제로 그걸 확인한다.
 *
 * 하나라도 깨지면 "우리 코드는 그대로 옮겨 심는다"는 계획의 전제가 틀린 것이므로,
 * 이 테스트는 새 엔진 쪽을 고쳐서 통과시킨다(기존 모듈을 고쳐서가 아니라).
 */

import { describe, expect, it } from "vitest";

import {
  canvasMenuItems,
  runCanvasMenuAction,
} from "@/lib/detail-page/canvas-menu";
import {
  canDistribute,
  distributeCoords,
  toItems,
} from "@/lib/detail-page/distribute";
import {
  collectTextMatches,
  replaceInText,
  totalOccurrences,
} from "@/lib/detail-page/find-replace";
import {
  applyFormat,
  copyFormat,
  canPasteFormat,
} from "@/lib/detail-page/format-painter";
import { groupAction, groupableIds } from "@/lib/detail-page/group-action";
import { canMoveZ, moveZ, setZ, zOrderOf } from "@/lib/detail-page/z-order";
import { createCanvasStore } from "@/lib/leviosa-canvas/store";
import type { DocumentJson } from "@/lib/leviosa-canvas/types";

function doc(): DocumentJson {
  return {
    width: 860,
    height: 1200,
    pages: [
      {
        id: "p1",
        children: [
          { id: "a", type: "figure", x: 0, y: 0, width: 100, height: 100 },
          {
            id: "b",
            type: "text",
            x: 200,
            y: 0,
            width: 100,
            height: 40,
            text: "용량 30ml 입니다",
            fontSize: 24,
            fontFamily: "Pretendard",
            fill: "#111111",
            align: "center",
            lineHeight: 1.4,
          },
          {
            id: "c",
            type: "text",
            x: 500,
            y: 0,
            width: 100,
            height: 40,
            text: "30ml 30ml",
            fontSize: 12,
            fontFamily: "Gmarket",
            fill: "#999999",
            align: "left",
            lineHeight: 1,
          },
          {
            id: "chart",
            type: "group",
            x: 0,
            y: 300,
            width: 300,
            height: 200,
            custom: { chart: { kind: "bar" } },
            children: [
              {
                id: "chart-label",
                type: "text",
                x: 0,
                y: 0,
                width: 80,
                height: 20,
                text: "30ml",
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("z-order — 그대로 돈다", () => {
  it("zOrderOf가 형제 안 위치를 읽는다", () => {
    const store = createCanvasStore(doc());
    const b = store.getElementById("b")!;
    expect(zOrderOf(b)).toEqual({ z: 1, count: 4, atFront: false, atBack: false });
    expect(canMoveZ(zOrderOf(b), "forward")).toBe(true);
  });

  it("맨 뒤 요소는 더 뒤로 못 간다", () => {
    const store = createCanvasStore(doc());
    const a = store.getElementById("a")!;
    expect(canMoveZ(zOrderOf(a), "back")).toBe(false);
    expect(moveZ(a, "back")).toBe(false);
  });

  it("moveZ / setZ가 실제로 순서를 바꾼다", () => {
    const store = createCanvasStore(doc());
    moveZ(store.getElementById("a")!, "front");
    expect(store.pages[0].children.map((el) => el.id)).toEqual([
      "b",
      "c",
      "chart",
      "a",
    ]);
    setZ(store.getElementById("a")!, 0);
    expect(store.pages[0].children.map((el) => el.id)).toEqual([
      "a",
      "b",
      "c",
      "chart",
    ]);
  });

  it("그룹 안 요소도 부모(그룹) 기준으로 판정한다", () => {
    const store = createCanvasStore(doc());
    // 자식이 하나뿐인 그룹은 옮길 데가 없다 → 컨트롤을 아예 안 그린다.
    expect(zOrderOf(store.getElementById("chart-label")!)).toBeNull();
  });
});

describe("group-action — 그대로 돈다", () => {
  it("페이지 직속 형제만 묶을 후보로 본다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a", "b", "chart-label"]);
    expect(groupableIds(store)).toEqual(["a", "b"]);
  });

  it("⌘G가 실제로 묶고 ⌘⇧G가 푼다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a", "b"]);
    const plan = groupAction(store, false)!;
    expect(plan.kind).toBe("group");
    const group = store.groupElements(plan.ids)!;
    expect(store.pages[0].children.map((el) => el.id)).toEqual([
      group.id,
      "c",
      "chart",
    ]);

    store.selectElements([group.id]);
    const undoPlan = groupAction(store, true)!;
    expect(undoPlan).toEqual({ kind: "ungroup", ids: [group.id] });
    store.ungroupElements(undoPlan.ids);
    expect(store.pages[0].children.map((el) => el.id)).toEqual([
      "a",
      "b",
      "c",
      "chart",
    ]);
  });
});

describe("canvas-menu — 그대로 돈다", () => {
  it("선택이 없으면 메뉴를 안 연다", () => {
    const store = createCanvasStore(doc());
    expect(canvasMenuItems(store)).toEqual([]);
  });

  it("단일 선택이면 순서 항목이 나온다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["b"]);
    const actions = canvasMenuItems(store).map((item) => item.action);
    expect(actions).toContain("front");
    expect(actions).toContain("duplicate");
    expect(actions).toContain("lock");
  });

  it("여럿을 고르면 순서 항목이 비활성이고 그룹 묶기가 뜬다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a", "b"]);
    const items = canvasMenuItems(store);
    expect(items.find((i) => i.action === "front")?.disabled).toBe(true);
    expect(items.map((i) => i.action)).toContain("group");
  });

  it("잠긴 요소는 복제·삭제가 비활성", () => {
    const store = createCanvasStore(doc());
    store.getElementById("b")!.set({ locked: true });
    store.selectElements(["b"]);
    const items = canvasMenuItems(store);
    expect(items.find((i) => i.action === "duplicate")?.disabled).toBe(true);
    expect(items.find((i) => i.action === "unlock")).toBeTruthy();
  });

  it("잠금/해제와 삭제가 실제로 먹는다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["a", "b"]);
    runCanvasMenuAction(store, "lock");
    expect(store.getElementById("a")!.locked).toBe(true);
    expect(store.getElementById("b")!.locked).toBe(true);
    // 여럿을 한 번에 만진 것은 트랜잭션으로 묶여 ⌘Z 한 번에 돌아온다.
    store.history.undo();
    expect(store.getElementById("a")!.locked).toBeUndefined();

    store.selectElements(["a"]);
    runCanvasMenuAction(store, "delete");
    expect(store.getElementById("a")).toBeNull();
  });

  it("복제는 형제 자리에 사본을 만든다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["b"]);
    runCanvasMenuAction(store, "duplicate");
    const ids = store.pages[0].children.map((el) => el.id);
    expect(ids).toHaveLength(5);
    // 스톡 편집기의 clone()은 그룹 자식이어도 사본을 페이지로 꺼냈다. 우리는 원본 바로
    // 뒤, 같은 부모 안에 넣는다 — 그룹 안 도형을 복제해도 그룹이 유지된다.
    expect(ids[1]).toBe("b");
    expect(store.getElementById(ids[2])!.text).toBe("용량 30ml 입니다");
  });

  it("서식 복사·붙여넣기가 캔버스 메뉴로 돈다", () => {
    const store = createCanvasStore(doc());
    store.selectElements(["b"]);
    runCanvasMenuAction(store, "copyFormat");
    store.selectElements(["c"]);
    runCanvasMenuAction(store, "pasteFormat");
    const c = store.getElementById("c")!;
    expect(c.fontSize).toBe(24);
    expect(c.fontFamily).toBe("Pretendard");
    expect(c.fill).toBe("#111111");
    expect(c.align).toBe("center");
    // 서식만 옮긴다 — 글과 위치·크기는 그대로다.
    expect(c.text).toBe("30ml 30ml");
    expect(c.width).toBe(100);
    expect(c.x).toBe(500);
  });
});

describe("format-painter — 그대로 돈다", () => {
  it("copyFormat / applyFormat이 요소를 직접 읽고 쓴다", () => {
    const store = createCanvasStore(doc());
    const copied = copyFormat(store.getElementById("b")!)!;
    expect(copied.type).toBe("text");
    expect(canPasteFormat(copied, [store.getElementById("c")!])).toBe(true);
    expect(applyFormat(copied, [store.getElementById("c")!])).toBe(1);
    expect(store.getElementById("c")!.lineHeight).toBe(1.4);
  });

  it("그룹에는 서식을 못 복사한다", () => {
    const store = createCanvasStore(doc());
    expect(copyFormat(store.getElementById("chart")!)).toBeNull();
  });
});

describe("find-replace — 그대로 돈다", () => {
  it("문서 전체에서 세고, 차트 안은 건너뛴다", () => {
    const store = createCanvasStore(doc());
    const matches = collectTextMatches(store.pages, "30ml");
    expect(matches.map((m) => m.elementId)).toEqual(["b", "c"]);
    expect(totalOccurrences(matches)).toBe(3);
  });

  it("바꾼 값을 그대로 요소에 쓸 수 있다", () => {
    const store = createCanvasStore(doc());
    const el = store.getElementById("c")!;
    el.set({ text: replaceInText(el.text ?? "", "30ml", "50ml") });
    expect(el.text).toBe("50ml 50ml");
    expect(totalOccurrences(collectTextMatches(store.pages, "30ml"))).toBe(1);
  });
});

describe("distribute — 그대로 돈다", () => {
  it("셋 이상·같은 부모여야 배분한다", () => {
    const store = createCanvasStore(doc());
    const els = ["a", "b", "c"].map((id) => store.getElementById(id)!);
    expect(canDistribute(els)).toBe(true);
    expect(
      canDistribute([...els.slice(0, 2), store.getElementById("chart-label")!]),
    ).toBe(false);
  });

  it("간격이 고르게 계산되고 양 끝은 고정된다", () => {
    const store = createCanvasStore(doc());
    const els = ["a", "b", "c"].map((id) => store.getElementById(id)!);
    const coords = distributeCoords(toItems(els, "x")!)!;
    // 0..600 안에 폭 100짜리 셋 → 남는 공간 300, 틈 2개 = 각 150 → b는 250
    expect(coords.get("b")).toBe(250);
    // 양 끝은 못 박힌다 — 배분이 선택 전체를 밀어내면 안 된다.
    expect(coords.get("a")).toBe(0);
    expect(coords.get("c")).toBe(500);
  });
});
