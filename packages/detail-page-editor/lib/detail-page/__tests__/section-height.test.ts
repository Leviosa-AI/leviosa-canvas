import { describe, expect, it, vi } from "vitest";

import {
  MAX_SECTION_HEIGHT,
  MIN_SECTION_HEIGHT,
  applySectionHeight,
  clampSectionHeight,
  isSectionBackdrop,
  sectionContentBottom,
} from "../section-height";

/**
 * 섹션 높이를 바꾸는 규칙.
 *
 * 지켜야 할 주장 넷.
 *
 * 1. **배경은 같이 늘어난다.** 페이지만 늘리면 아래에 흰 띠가 생기는데, 그건 기능이 아니라
 *    고장으로 보인다.
 * 2. **글은 안 늘어난다.** 페이지를 꽉 채운 텍스트 상자를 배경으로 잘못 잡으면 글줄이
 *    세로로 벌어진다.
 * 3. **"내용에 맞추기"는 배경을 빼고 잰다.** 배경까지 세면 언제나 지금 높이가 답이라
 *    버튼이 아무 일도 안 한다.
 * 4. **굽기 상한 밖으로는 못 나간다.** 편집기에서만 되고 구운 결과는 잘리는 상태를 만들면
 *    안 된다.
 */

type El = {
  id: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: El[];
  set?: (attrs: Record<string, unknown>) => void;
};

/** 실제 요소처럼 ``set`` 이 자기 값을 바꾸는 가짜. */
function el(props: Partial<El> & { id: string }): El {
  const node: El = { x: 0, y: 0, width: 100, height: 100, ...props };
  node.set = (attrs) => Object.assign(node, attrs);
  return node;
}

function page(children: El[], { width = 750, height = 1200 } = {}) {
  const p = {
    computedWidth: width,
    computedHeight: height,
    children,
    set: (attrs: Record<string, unknown>) => {
      if (typeof attrs.height === "number") p.computedHeight = attrs.height;
      Object.assign(p, attrs);
    },
  };
  return p;
}

describe("clampSectionHeight", () => {
  it("stays inside the range the server bakes", () => {
    expect(clampSectionHeight(50)).toBe(MIN_SECTION_HEIGHT);
    expect(clampSectionHeight(99_999)).toBe(MAX_SECTION_HEIGHT);
    expect(clampSectionHeight(1480.6)).toBe(1481);
  });

  it("falls back instead of writing NaN into the document", () => {
    expect(clampSectionHeight("높이")).toBe(MIN_SECTION_HEIGHT);
    expect(clampSectionHeight(undefined)).toBe(MIN_SECTION_HEIGHT);
  });
});

describe("isSectionBackdrop", () => {
  const full = { x: 0, y: 0, width: 750, height: 1200 };

  it("recognises a page-filling image or shape", () => {
    expect(isSectionBackdrop({ type: "image", ...full }, 750, 1200)).toBe(true);
    expect(isSectionBackdrop({ type: "figure", ...full }, 750, 1200)).toBe(true);
  });

  it("never treats text as a backdrop", () => {
    // 세로로 늘어난 글줄은 되돌리기 전까지 원래 모습을 못 찾는다.
    expect(isSectionBackdrop({ type: "text", ...full }, 750, 1200)).toBe(false);
  });

  it("never treats a group as a backdrop", () => {
    // 그룹은 자식이 좌표를 들고 있어 높이를 늘려도 화면이 안 변한다(조용한 무동작).
    expect(isSectionBackdrop({ type: "group", ...full }, 750, 1200)).toBe(false);
  });

  it("leaves a normal photo alone", () => {
    expect(
      isSectionBackdrop({ type: "image", x: 40, y: 300, width: 670, height: 400 }, 750, 1200),
    ).toBe(false);
  });
});

describe("applySectionHeight", () => {
  it("grows the backdrop by the same amount as the page", () => {
    const backdrop = el({ id: "bg", type: "image", width: 750, height: 1200 });
    const photo = el({ id: "photo", type: "image", x: 40, y: 200, width: 670, height: 400 });
    const p = page([backdrop, photo]);

    applySectionHeight(p, 1600);

    expect(p.computedHeight).toBe(1600);
    expect(backdrop.height).toBe(1600);
    expect(photo.height).toBe(400);
  });

  it("shrinks the backdrop too", () => {
    const backdrop = el({ id: "bg", type: "figure", width: 750, height: 1200 });
    applySectionHeight(page([backdrop]), 900);
    expect(backdrop.height).toBe(900);
  });

  it("measures backdrops against the OLD height", () => {
    // 페이지를 먼저 바꾸면 판정이 새 높이를 보게 되어 아무것도 배경으로 안 잡힌다.
    const backdrop = el({ id: "bg", type: "image", width: 750, height: 1200 });
    applySectionHeight(page([backdrop]), 2400);
    expect(backdrop.height).toBe(2400);
  });

  it("returns the height it actually applied", () => {
    const p = page([]);
    expect(applySectionHeight(p, 99_999)).toBe(MAX_SECTION_HEIGHT);
    expect(p.computedHeight).toBe(MAX_SECTION_HEIGHT);
  });

  it("touches nothing when the height does not change", () => {
    const backdrop = el({ id: "bg", type: "image", width: 750, height: 1200 });
    const spy = vi.fn();
    backdrop.set = spy;
    applySectionHeight(page([backdrop]), 1200);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("sectionContentBottom", () => {
  it("finds where the real content ends", () => {
    const p = page([
      el({ id: "a", type: "text", y: 80, height: 60 }),
      el({ id: "b", type: "image", y: 300, height: 420 }),
    ]);
    expect(sectionContentBottom(p)).toBe(720);
  });

  it("ignores the backdrop", () => {
    // 배경까지 세면 "내용에 맞추기"가 언제나 지금 높이를 답으로 내놓는다.
    const p = page([
      el({ id: "bg", type: "image", width: 750, height: 1200 }),
      el({ id: "a", type: "text", y: 80, height: 60 }),
    ]);
    expect(sectionContentBottom(p)).toBe(140);
  });

  it("adds the group's own offset to its children", () => {
    // 디컴포저는 그룹을 원점에 고정하고 자식에 절대 좌표를 남긴다. 유저가 그룹을 끌면
    // 그 이동량만 그룹 y 에 쌓이므로, 더하지 않으면 옮겨 놓은 그룹이 안 세어진다.
    const p = page([
      el({
        id: "g",
        type: "group",
        y: 200,
        children: [el({ id: "g1", type: "text", y: 400, height: 50 })],
      }),
    ]);
    expect(sectionContentBottom(p)).toBe(650);
  });

  it("is 0 for an empty section instead of NaN", () => {
    expect(sectionContentBottom(page([]))).toBe(0);
    expect(sectionContentBottom({})).toBe(0);
  });
});
