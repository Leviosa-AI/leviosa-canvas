import { describe, expect, it } from "vitest";

import {
  elementPath,
  isTransformerPart,
  type HitNode,
} from "@/lib/leviosa-canvas/render/hit-path";
import {
  absorbTransform,
  nudge,
  nudgeStep,
  pickFromPath,
  toggleSelection,
} from "@/lib/leviosa-canvas/render/interaction";
import { createCanvasStore } from "@/lib/leviosa-canvas/store";
import type { DocumentJson } from "@/lib/leviosa-canvas/types";

function doc(): DocumentJson {
  return {
    width: 750,
    height: 1000,
    pages: [
      {
        id: "p",
        children: [
          {
            id: "grp",
            type: "group",
            x: 100,
            y: 100,
            width: 200,
            height: 100,
            children: [
              {
                id: "inner",
                type: "group",
                x: 0,
                y: 0,
                width: 100,
                height: 50,
                children: [
                  { id: "leaf", type: "text", x: 0, y: 0, width: 50, height: 20, text: "x" },
                ],
              },
            ],
          },
          { id: "solo", type: "figure", x: 0, y: 0, width: 10, height: 10 },
        ],
      },
    ],
  };
}

/** Konva 노드 흉내 — 부모 사슬만 있으면 된다. */
function node(id: string, parent: HitNode | null, className = "Shape"): HitNode {
  return {
    id: () => id,
    getParent: () => parent,
    getClassName: () => className,
  };
}

describe("elementPath", () => {
  it("도형에서 위로 훑어 바깥 → 안 순서로 모은다", () => {
    const store = createCanvasStore(doc());
    const stage = node("", null, "Stage");
    const layer = node("", stage, "Layer");
    const outer = node("grp", layer, "Group");
    const inner = node("inner", outer, "Group");
    const leaf = node("leaf", inner, "Group");
    const shape = node("", leaf, "Text");
    expect(elementPath(shape, store)).toEqual(["grp", "inner", "leaf"]);
  });

  it("문서에 없는 id는 줍지 않는다", () => {
    const store = createCanvasStore(doc());
    const shape = node("no-such-thing", null, "Rect");
    expect(elementPath(shape, store)).toEqual([]);
  });
});

describe("isTransformerPart", () => {
  it("손잡이를 누른 것은 선택 변경이 아니다", () => {
    const transformer = node("", null, "Transformer");
    expect(isTransformerPart(node("", transformer, "Rect"))).toBe(true);
    expect(isTransformerPart(node("solo", null, "Rect"))).toBe(false);
    expect(isTransformerPart(null)).toBe(false);
  });
});

describe("pickFromPath", () => {
  it("기본은 가장 바깥 — 그룹을 통째로 집는다", () => {
    expect(pickFromPath(["grp", "inner", "leaf"], null)).toBe("grp");
  });

  it("그 그룹 안을 보고 있으면 한 겹만 더 들어간다", () => {
    expect(pickFromPath(["grp", "inner", "leaf"], "grp")).toBe("inner");
    expect(pickFromPath(["grp", "inner", "leaf"], "inner")).toBe("leaf");
  });

  it("가장 안쪽까지 들어갔으면 그 자신", () => {
    expect(pickFromPath(["grp", "inner", "leaf"], "leaf")).toBe("leaf");
  });

  it("보고 있는 그룹 밖을 누르면 다시 바깥부터", () => {
    expect(pickFromPath(["solo"], "grp")).toBe("solo");
    expect(pickFromPath([], "grp")).toBeNull();
  });
});

describe("toggleSelection", () => {
  it("시프트 클릭은 더하거나 뺀다", () => {
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("absorbTransform", () => {
  it("scale을 폭·높이로 흡수한다", () => {
    const patch = absorbTransform(
      { type: "figure" },
      { x: 5, y: 6, width: 100, height: 50, rotation: 0, scaleX: 2, scaleY: 3 },
    );
    expect(patch).toEqual({ x: 5, y: 6, width: 200, height: 150, rotation: 0 });
    // scale은 patch에 남으면 안 된다 — 다음 조절에 또 곱해진다.
    expect(patch.scaleX).toBeUndefined();
  });

  it("텍스트를 모서리로 늘리면 글자 크기도 같이 커진다", () => {
    const patch = absorbTransform(
      { type: "text", fontSize: 20 },
      { x: 0, y: 0, width: 100, height: 40, rotation: 0, scaleX: 1.5, scaleY: 1.5 },
    );
    expect(patch.fontSize).toBe(30);
  });

  it("옆 손잡이로 넓히면 상자만 넓어진다", () => {
    const patch = absorbTransform(
      { type: "text", fontSize: 20 },
      { x: 0, y: 0, width: 100, height: 40, rotation: 0, scaleX: 1.5, scaleY: 1 },
    );
    expect(patch.fontSize).toBeUndefined();
    expect(patch.width).toBe(150);
  });

  it("0 이하로는 줄지 않는다", () => {
    const patch = absorbTransform(
      { type: "figure" },
      { x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 0, scaleY: 0 },
    );
    expect(patch.width).toBe(1);
    expect(patch.height).toBe(1);
  });
});

describe("nudge", () => {
  it("시프트를 누르면 크게 움직인다", () => {
    expect(nudgeStep(false)).toBe(1);
    expect(nudgeStep(true)).toBe(10);
  });

  it("여럿을 한 번에 옮기고 ⌘Z 한 번에 되돌린다", () => {
    const store = createCanvasStore(doc());
    const els = [store.getElementById("grp")!, store.getElementById("solo")!];
    nudge(store, els, 10, -5);
    expect({ x: els[0].x, y: els[0].y }).toEqual({ x: 110, y: 95 });
    expect({ x: els[1].x, y: els[1].y }).toEqual({ x: 10, y: -5 });

    store.history.undo();
    expect(store.getElementById("grp")!.x).toBe(100);
    expect(store.getElementById("solo")!.x).toBe(0);
    expect(store.history.canUndo).toBe(false);
  });

  it("잠긴 요소는 안 움직인다", () => {
    const store = createCanvasStore(doc());
    const solo = store.getElementById("solo")!;
    solo.set({ locked: true });
    nudge(store, [solo], 10, 10);
    expect(solo.x).toBe(0);
  });
});
