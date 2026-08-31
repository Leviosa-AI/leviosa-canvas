import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  DetailPageProperties,
  ElementAiEditPanel,
  alignedCoord,
  groupFrame,
} from "../detail-page-properties-panel";
import { EditorAiProvider } from "../editor-ai-context";
import { CanvasStoreContext } from "../canvas-observer";
import { createCanvasStore } from "@leviosa-ai/canvas/store";
import { encodeSvgDataUri } from "../../../lib/detail-page-canvas/export/svg";

import { withDetailPageHost } from "./host-stub";

// 그룹 편집 전송 경로만 세우고 나머지는 가짜 호스트가 알아서 채운다. 예전에는
// `vi.mock("@/lib/sourcing-api")` 로 모듈을 통째로 갈았는데, 패널이 실제 함수를 여럿
// 부르는 바람에 원본을 되살려 섞어야 했다 — 주입 지점이 하나가 되면서 사라진 문제다.
const mockGroupPromptEdit = vi.fn();

function render(ui: ReactNode) {
  return rtlRender(
    withDetailPageHost(ui, { api: { groupPromptEditDetailPage: mockGroupPromptEdit } }),
  );
}

/**
 * 프롬프트 편집은 우측 패널이 아니라 **캔버스 위 띠**에서 열린다. 부품은 그대로라
 * 계약도 그대로지만, 여는 자리가 달라졌으므로 여기서는 그 부품을 직접 세운다.
 * 생성 ID·사용량은 이제 컨텍스트로 온다(`editor-ai-context`).
 */
function renderAiEdit(
  store: Record<string, unknown>,
  els: Array<Record<string, unknown>>,
  generatedId?: string,
) {
  return render(
    <EditorAiProvider value={{ generatedId }}>
      <ElementAiEditPanel store={store as never} els={els as never} />
    </EditorAiProvider>,
  );
}

/**
 * The properties panel exposes an "그룹 해제" (ungroup) action for a selected
 * group, mirroring the built-in Cmd+G so the action is discoverable in the UI.
 * It must only appear for a single group selection and must wire to
 * ``store.ungroupElements``.
 */
function makeElement(overrides: Record<string, unknown>): Record<string, unknown> & {
  id: string;
  set: ReturnType<typeof vi.fn>;
} {
  return {
    id: "e1",
    type: "figure",
    opacity: 1,
    set: vi.fn(),
    ...overrides,
  };
}

function makeStore(selected: Array<Record<string, unknown>>) {
  return {
    selectedElements: selected,
    pages: [],
    activePage: { id: "p1", children: [] },
    deleteElements: vi.fn(),
    ungroupElements: vi.fn(),
  };
}

describe("DetailPageProperties — ungroup", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows 그룹 해제 for a single selected group and calls ungroupElements", async () => {
    const user = userEvent.setup();
    const group = makeElement({ id: "g1", type: "group" });
    const store = makeStore([group]);

    render(<DetailPageProperties store={store} />);

    const button = screen.getByRole("button", { name: "detailPage.properties.ungroup" });
    await user.click(button);
    expect(store.ungroupElements).toHaveBeenCalledWith(["g1"]);
    expect(store.deleteElements).not.toHaveBeenCalled();
  });

  it("hides 그룹 해제 when the selection is not a single group", () => {
    const figure = makeElement({ id: "f1", type: "figure" });
    const store = makeStore([figure]);

    render(<DetailPageProperties store={store} />);

    expect(screen.queryByRole("button", { name: "detailPage.properties.ungroup" })).toBeNull();
    // The delete action stays available for the non-group selection.
    expect(screen.getByRole("button", { name: "detailPage.properties.delete" })).toBeTruthy();
  });

  it("hides 그룹 해제 when multiple elements are selected", () => {
    const store = makeStore([
      makeElement({ id: "g1", type: "group" }),
      makeElement({ id: "g2", type: "group" }),
    ]);

    render(<DetailPageProperties store={store} />);

    expect(screen.queryByRole("button", { name: "detailPage.properties.ungroup" })).toBeNull();
  });
});

/**
 * A GIF (inserted as type "image" + custom.detailPageGif) must read as "GIF" in
 * the inspector header, not the generic "이미지" — the user manipulates it as a GIF.
 */
describe("DetailPageProperties — GIF 인스펙터", () => {
  afterEach(() => vi.restoreAllMocks());

  it("custom.detailPageGif 선택 시 헤더가 'GIF'로 뜬다(이미지 아님)", () => {
    const gif = makeElement({ id: "g", type: "image", custom: { detailPageGif: true } });
    render(<DetailPageProperties store={makeStore([gif])} />);
    expect(screen.getByText("GIF")).toBeTruthy();
    expect(screen.queryByText("detailPage.properties.typeImage")).toBeNull();
  });

  it(".gif src 이미지도 헤더가 'GIF'", () => {
    const gif = makeElement({ id: "g2", type: "image", src: "https://s3/a.gif" });
    render(<DetailPageProperties store={makeStore([gif])} />);
    expect(screen.getByText("GIF")).toBeTruthy();
  });

  it("일반 이미지는 헤더가 여전히 이미지 라벨", () => {
    const img = makeElement({ id: "i", type: "image", src: "https://s3/a.png" });
    render(<DetailPageProperties store={makeStore([img])} />);
    expect(screen.getByText("detailPage.properties.typeImage")).toBeTruthy();
    expect(screen.queryByText("GIF")).toBeNull();
  });
});

/**
 * 텍스트 인스펙터의 채우기(단색/그라데이션)와 하이라이트(text background*).
 */
describe("DetailPageProperties — 텍스트 gradient + 하이라이트", () => {
  afterEach(() => vi.restoreAllMocks());

  it("단색/그라데이션 토글을 노출한다", () => {
    const text = makeElement({ id: "t", type: "text", fill: "#ff0000" });
    render(<DetailPageProperties store={makeStore([text])} />);
    expect(
      screen.getByRole("button", { name: "detailPage.properties.fillSolid" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "detailPage.properties.fillGradient" }),
    ).toBeTruthy();
  });

  it("그라데이션 토글을 누르면 fill을 linear-gradient 문자열로 설정한다", async () => {
    const user = userEvent.setup();
    const text = makeElement({ id: "t", type: "text", fill: "#ff0000" });
    render(<DetailPageProperties store={makeStore([text])} />);
    await user.click(
      screen.getByRole("button", { name: "detailPage.properties.fillGradient" }),
    );
    const call = text.set.mock.calls.find(
      (c) => typeof c[0]?.fill === "string" && c[0].fill.includes("linear-gradient"),
    );
    expect(call).toBeTruthy();
    expect(call![0].fill).toContain("#ff0000"); // 시작색은 기존 단색에서 시드
  });

  it("하이라이트 토글이 custom.highlightColor를 켜고 네이티브 배경은 끈다", async () => {
    const user = userEvent.setup();
    const text = makeElement({ id: "t", type: "text" });
    render(<DetailPageProperties store={makeStore([text])} />);
    await user.click(
      screen.getByRole("button", { name: "detailPage.properties.highlight" }),
    );
    const call = text.set.mock.calls.at(-1)![0] as {
      custom?: Record<string, unknown>;
      backgroundEnabled?: boolean;
    };
    expect(typeof call.custom?.highlightColor).toBe("string");
    expect(call.backgroundEnabled).toBe(false);
  });

  it("하이라이트 토글 OFF는 custom.highlightColor를 제거한다", async () => {
    const user = userEvent.setup();
    const text = makeElement({
      id: "t",
      type: "text",
      custom: { highlightColor: "#FFEB3B" },
    });
    render(<DetailPageProperties store={makeStore([text])} />);
    await user.click(
      screen.getByRole("button", { name: "detailPage.properties.highlight" }),
    );
    const call = text.set.mock.calls.at(-1)![0] as {
      custom?: Record<string, unknown>;
    };
    expect("highlightColor" in (call.custom ?? {})).toBe(false);
  });

  it("예전 backgroundEnabled 하이라이트도 켜짐으로 인식한다", () => {
    const text = makeElement({
      id: "t",
      type: "text",
      backgroundEnabled: true,
      backgroundColor: "#7ED321",
    });
    render(<DetailPageProperties store={makeStore([text])} />);
    // 켜짐이면 색 입력(ColorInput)이 보이고 힌트 문구는 숨는다.
    expect(
      screen.queryByText("detailPage.properties.highlightHint"),
    ).toBeNull();
  });
});

/**
 * 도형(figure) 인스펙터의 채우기 그라데이션 — 텍스트와 같은 FillControl을 ``fill``에 배선.
 */
describe("DetailPageProperties — 도형 gradient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("figure 선택 시 채우기 토글을 노출한다", () => {
    const figure = makeElement({ id: "f", type: "figure", fill: "rgb(0, 161, 255)" });
    render(<DetailPageProperties store={makeStore([figure])} />);
    expect(
      screen.getByRole("button", { name: "detailPage.properties.fillGradient" }),
    ).toBeTruthy();
  });

  it("그라데이션 토글이 figure.fill을 linear-gradient로 설정한다", async () => {
    const user = userEvent.setup();
    const figure = makeElement({ id: "f", type: "figure", fill: "#00a1ff" });
    render(<DetailPageProperties store={makeStore([figure])} />);
    await user.click(
      screen.getByRole("button", { name: "detailPage.properties.fillGradient" }),
    );
    const call = figure.set.mock.calls.find(
      (c) => typeof c[0]?.fill === "string" && c[0].fill.includes("linear-gradient"),
    );
    expect(call).toBeTruthy();
  });
});

/**
 * 선택이 없을 때 페이지 배경도 단색/그라데이션을 지원한다(page.background에 문자열).
 */
describe("DetailPageProperties — 화면 다루기", () => {
  afterEach(() => vi.restoreAllMocks());

  /** 캔버스 옆 세로 띠에 있던 두 가지가 여기로 왔다. */
  function pageStore(pages: number) {
    const clone = vi.fn();
    const deletePages = vi.fn();
    const list = Array.from({ length: pages }, (_, i) => ({
      id: `p${i + 1}`,
      children: [],
      background: "#ffffff",
      set: vi.fn(),
      clone,
    }));
    return {
      clone,
      deletePages,
      store: {
        selectedElements: [],
        pages: list,
        activePage: list[0],
        deleteElements: vi.fn(),
        deletePages,
        ungroupElements: vi.fn(),
      },
    };
  }

  it("복제는 활성 화면의 clone 을 부른다", async () => {
    const user = userEvent.setup();
    const { clone, store } = pageStore(2);
    render(<DetailPageProperties store={store} />);
    await user.click(
      screen.getByRole("button", { name: /detailPage.pageToolbar.duplicate/ }),
    );
    expect(clone).toHaveBeenCalled();
  });

  it("삭제는 활성 화면 id 로 deletePages 를 부른다", async () => {
    const user = userEvent.setup();
    const { deletePages, store } = pageStore(2);
    render(<DetailPageProperties store={store} />);
    await user.click(
      screen.getByRole("button", { name: /detailPage.pageToolbar.delete/ }),
    );
    expect(deletePages).toHaveBeenCalledWith(["p1"]);
  });

  it("화면이 하나뿐이면 삭제를 막는다", () => {
    const { store } = pageStore(1);
    render(<DetailPageProperties store={store} />);
    expect(
      screen.getByRole("button", { name: /detailPage.pageToolbar.delete/ }),
    ).toBeDisabled();
  });
});

/**
 * The "정렬 순서" (z-order) section reorders the selected element *within its
 * immediate parent* — group or page — through ``parent.setElementZIndex``. That
 * is the API both Page and Group expose; ``element.moveUp()`` is a no-op for a
 * grouped element because it targets the page, not the enclosing group.
 */
describe("DetailPageProperties — 정렬 순서 (z-order)", () => {
  afterEach(() => vi.restoreAllMocks());

  function makeParented(zIndex: number, siblingCount: number) {
    const setElementZIndex = vi.fn();
    const children = Array.from({ length: siblingCount }, (_, i) => ({
      id: `s${i}`,
    }));
    const el = makeElement({
      id: `s${zIndex}`,
      type: "figure",
      zIndex,
      parent: { children, setElementZIndex },
    });
    return { el, setElementZIndex };
  }

  it("moves a middle element to front / forward / backward / back", async () => {
    const user = userEvent.setup();
    const { el, setElementZIndex } = makeParented(1, 3); // middle of 3
    render(<DetailPageProperties store={makeStore([el])} />);

    await user.click(screen.getByRole("button", { name: "detailPage.properties.bringToFront" }));
    expect(setElementZIndex).toHaveBeenLastCalledWith("s1", 2);
    await user.click(screen.getByRole("button", { name: "detailPage.properties.bringForward" }));
    expect(setElementZIndex).toHaveBeenLastCalledWith("s1", 2);
    await user.click(screen.getByRole("button", { name: "detailPage.properties.sendBackward" }));
    expect(setElementZIndex).toHaveBeenLastCalledWith("s1", 0);
    await user.click(screen.getByRole("button", { name: "detailPage.properties.sendToBack" }));
    expect(setElementZIndex).toHaveBeenLastCalledWith("s1", 0);
  });

  it("disables front actions when already front-most", () => {
    const { el } = makeParented(2, 3); // front of 3
    render(<DetailPageProperties store={makeStore([el])} />);
    expect(screen.getByRole("button", { name: "detailPage.properties.bringToFront" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "detailPage.properties.bringForward" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "detailPage.properties.sendBackward" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("hides the section for a lone element with no siblings", () => {
    const { el } = makeParented(0, 1);
    render(<DetailPageProperties store={makeStore([el])} />);
    expect(screen.queryByRole("button", { name: "detailPage.properties.bringToFront" })).toBeNull();
  });

  it("hides the section when multiple elements are selected", () => {
    const a = makeParented(0, 3).el;
    const b = makeParented(1, 3).el;
    render(<DetailPageProperties store={makeStore([a, b])} />);
    expect(screen.queryByRole("button", { name: "detailPage.properties.bringToFront" })).toBeNull();
  });
});

/**
 * A group CHILD selected from the layers tree must be editable here. the stock editor's
 * ``selectedElements`` getter only scans each page's direct children, so a nested
 * id resolves to nothing and the inspector used to read "선택 없음". We resolve
 * ``selectedElementsIds`` through ``getElementById`` (backed by ``_idsMap``, which
 * walks groups) instead.
 */
describe("DetailPageProperties — group-child selection", () => {
  afterEach(() => vi.restoreAllMocks());

  it("edits a nested group child that the stock selectedElements getter cannot see", () => {
    const child = makeElement({ id: "c1", type: "text", text: "입니다." });
    const store = {
      // The stock getter is blind to the nested id (this is the stock editor bug).
      selectedElements: [],
      selectedElementsIds: ["c1"],
      getElementById: (id: string) => (id === "c1" ? child : undefined),
      pages: [],
      activePage: { id: "p1", children: [] },
      deleteElements: vi.fn(),
      ungroupElements: vi.fn(),
    };

    render(<DetailPageProperties store={store} />);

    // The text inspector renders for the nested child (not "선택 없음").
    expect(screen.getByDisplayValue("입니다.")).toBeTruthy();
    expect(screen.queryByText("detailPage.properties.selectionNone")).toBeNull();
  });

  it("still resolves a plain top-level selection", () => {
    const top = makeElement({ id: "t1", type: "text", text: "최상위" });
    const store = {
      selectedElements: [top],
      selectedElementsIds: [],
      pages: [],
      activePage: { id: "p1", children: [] },
      deleteElements: vi.fn(),
      ungroupElements: vi.fn(),
    };
    render(<DetailPageProperties store={store} />);
    expect(screen.getByDisplayValue("최상위")).toBeTruthy();
  });
});

/**
 * Align must resolve its FRAME per element: a group child aligns inside its
 * group, a top-level element inside the section (page). Aligning a group child
 * against the page would fling it clean out of its group — its x/y live in the
 * group's local space.
 */
describe("align frame — group vs section", () => {
  afterEach(() => vi.restoreAllMocks());

  it("derives the group frame from the sibling bounding box", () => {
    const siblings = [
      { x: 20, y: 10, width: 100, height: 30 },
      { x: 60, y: 50, width: 40, height: 20 },
    ];
    // x: 20 .. 120  |  y: 10 .. 70
    expect(groupFrame(siblings, "x")).toEqual({ start: 20, size: 100 });
    expect(groupFrame(siblings, "y")).toEqual({ start: 10, size: 60 });
  });

  it("returns no frame for an empty / degenerate group", () => {
    expect(groupFrame([], "x")).toBeNull();
  });

  it("places a box at the start / centre / end of its frame", () => {
    const frame = { start: 20, size: 100 }; // 20 .. 120
    expect(alignedCoord(frame, 40, "start")).toBe(20);
    expect(alignedCoord(frame, 40, "center")).toBe(50); // 20 + (100-40)/2
    expect(alignedCoord(frame, 40, "end")).toBe(80); // 120 - 40
  });

  it("centres a group child inside the GROUP, not the page", async () => {
    const user = userEvent.setup();
    const child = makeElement({ id: "c1", type: "figure", x: 0, y: 0, width: 40, height: 20 });
    const siblings = [child, { id: "c2", x: 20, y: 10, width: 100, height: 30 }];
    child.parent = { type: "group", children: siblings };

    const store = {
      selectedElements: [],
      selectedElementsIds: ["c1"],
      getElementById: (id: string) => (id === "c1" ? child : undefined),
      // A page far wider than the group — a section-based align would use this.
      pages: [{ id: "p1", computedWidth: 1000, computedHeight: 2000, children: [] }],
      activePage: { id: "p1", computedWidth: 1000, computedHeight: 2000, children: [] },
      deleteElements: vi.fn(),
      ungroupElements: vi.fn(),
    };

    render(<DetailPageProperties store={store} />);
    // The heading names the frame so the behaviour is not a surprise.
    expect(screen.getByText("detailPage.properties.alignInGroup")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "detailPage.properties.alignHCenter" }));
    // Group x-frame is 0..120 (child at 0 w40, sibling 20..120) -> (120-40)/2 = 40.
    // A page-centred align would have been (1000-40)/2 = 480.
    expect(child.set).toHaveBeenCalledWith({ x: 40 });
  });

  it("keeps section alignment for a top-level element", async () => {
    const user = userEvent.setup();
    const top = makeElement({ id: "t1", type: "figure", x: 0, y: 0, width: 40, height: 20 });
    const store = {
      selectedElements: [top],
      selectedElementsIds: [],
      pages: [{ id: "p1", computedWidth: 1000, computedHeight: 2000, children: [top] }],
      activePage: { id: "p1", computedWidth: 1000, computedHeight: 2000, children: [top] },
      deleteElements: vi.fn(),
      ungroupElements: vi.fn(),
    };

    render(<DetailPageProperties store={store} />);
    expect(screen.getByText("detailPage.properties.alignInSection")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "detailPage.properties.alignHCenter" }));
    expect(top.set).toHaveBeenCalledWith({ x: 480 }); // (1000 - 40) / 2
  });

  const pressed = (name: string) =>
    screen
      .getByRole("button", { name: `detailPage.properties.${name}` })
      .getAttribute("aria-pressed");

  it("현재 정렬 상태를 버튼에 표시한다 (중앙정렬 요소 → 중앙 버튼만 pressed)", () => {
    // x center = (1000-40)/2 = 480, y center = (2000-20)/2 = 990
    const top = makeElement({ id: "t1", type: "figure", x: 480, y: 990, width: 40, height: 20 });
    const store = {
      selectedElements: [top],
      selectedElementsIds: [],
      pages: [{ id: "p1", computedWidth: 1000, computedHeight: 2000, children: [top] }],
      activePage: { id: "p1", computedWidth: 1000, computedHeight: 2000, children: [top] },
      deleteElements: vi.fn(),
      ungroupElements: vi.fn(),
    };
    render(<DetailPageProperties store={store} />);
    expect(pressed("alignHCenter")).toBe("true");
    expect(pressed("alignVCenter")).toBe("true");
    expect(pressed("alignLeft")).toBe("false");
    expect(pressed("alignRight")).toBe("false");
    expect(pressed("alignTop")).toBe("false");
    expect(pressed("alignBottom")).toBe("false");
  });

  it("좌상단 정렬 요소 → 좌·상 버튼이 pressed", () => {
    const top = makeElement({ id: "t2", type: "figure", x: 0, y: 0, width: 40, height: 20 });
    const store = {
      selectedElements: [top],
      selectedElementsIds: [],
      pages: [{ id: "p1", computedWidth: 1000, computedHeight: 2000, children: [top] }],
      activePage: { id: "p1", computedWidth: 1000, computedHeight: 2000, children: [top] },
      deleteElements: vi.fn(),
      ungroupElements: vi.fn(),
    };
    render(<DetailPageProperties store={store} />);
    expect(pressed("alignLeft")).toBe("true");
    expect(pressed("alignTop")).toBe("true");
    expect(pressed("alignHCenter")).toBe("false");
  });

  it("셋 이상 · 같은 부모일 때만 간격 고르게가 산다", async () => {
    const user = userEvent.setup();
    const page = { id: "p1", computedWidth: 1000, computedHeight: 2000, children: [] as unknown[] };
    const kids = [
      makeElement({ id: "d1", type: "figure", x: 0, y: 0, width: 100, height: 20, parent: page }),
      makeElement({ id: "d2", type: "figure", x: 130, y: 0, width: 100, height: 20, parent: page }),
      makeElement({ id: "d3", type: "figure", x: 400, y: 0, width: 100, height: 20, parent: page }),
    ];
    page.children = kids;
    const store = {
      selectedElements: kids,
      selectedElementsIds: kids.map((k) => k.id),
      pages: [page],
      activePage: page,
      deleteElements: vi.fn(),
      ungroupElements: vi.fn(),
    };
    render(<DetailPageProperties store={store} />);
    await user.click(
      screen.getByRole("button", { name: "detailPage.properties.spreadH" }),
    );
    // 전체 폭 500, 내용 300 → 여백 100씩. 양 끝은 안 움직인다.
    expect(kids[0].set).toHaveBeenCalledWith({ x: 0 });
    expect(kids[1].set).toHaveBeenCalledWith({ x: 200 });
    expect(kids[2].set).toHaveBeenCalledWith({ x: 400 });
  });

  it("둘만 고르면 간격 고르게가 죽어 있다", () => {
    // 사이가 하나뿐이라 눌러도 아무 것도 안 바뀐다.
    const page = { id: "p1", computedWidth: 1000, computedHeight: 2000, children: [] as unknown[] };
    const kids = [
      makeElement({ id: "d1", type: "figure", x: 0, y: 0, width: 100, height: 20, parent: page }),
      makeElement({ id: "d2", type: "figure", x: 400, y: 0, width: 100, height: 20, parent: page }),
    ];
    page.children = kids;
    render(
      <DetailPageProperties
        store={{
          selectedElements: kids,
          selectedElementsIds: kids.map((k) => k.id),
          pages: [page],
          activePage: page,
          deleteElements: vi.fn(),
          ungroupElements: vi.fn(),
        }}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "detailPage.properties.spreadH",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("정렬되지 않은 요소는 어떤 버튼도 pressed 아님", () => {
    const top = makeElement({ id: "t3", type: "figure", x: 137, y: 42, width: 40, height: 20 });
    const store = {
      selectedElements: [top],
      selectedElementsIds: [],
      pages: [{ id: "p1", computedWidth: 1000, computedHeight: 2000, children: [top] }],
      activePage: { id: "p1", computedWidth: 1000, computedHeight: 2000, children: [top] },
      deleteElements: vi.fn(),
      ungroupElements: vi.fn(),
    };
    render(<DetailPageProperties store={store} />);
    for (const name of [
      "alignLeft",
      "alignHCenter",
      "alignRight",
      "alignTop",
      "alignVCenter",
      "alignBottom",
    ]) {
      expect(pressed(name)).toBe("false");
    }
  });
});

/**
 * 불투명도 슬라이더는 controlled input이다. OpacityRow가 observer가 아니면 스토어
 * 변경 신호를 못 받아 값이 바뀌어도 리렌더되지 않고, 슬라이더가 옛 값에 고정된다 —
 * 사용자에겐 "클릭이 아예 안 먹는" 것으로 보인다.
 *
 * 흉내 낸 스토어가 아니라 **진짜 `CanvasStore`** 위에서 잰다. 리렌더를 거는 것은
 * 컨텍스트에 꽂힌 스토어의 구독이라(`canvas-observer.tsx`), 목으로 재면 그 배선이
 * 끊겨도 통과한다.
 */
describe("DetailPageProperties — 불투명도", () => {
  afterEach(() => vi.restoreAllMocks());

  it("스토어의 opacity 변경을 따라 슬라이더가 갱신된다", async () => {
    const store = createCanvasStore({
      width: 100,
      height: 100,
      pages: [
        {
          id: "p1",
          children: [
            { id: "svg1", type: "svg", x: 0, y: 0, width: 10, height: 10, opacity: 1 },
          ],
        },
      ],
    });
    store.selectElements(["svg1"]);

    render(
      <CanvasStoreContext.Provider value={store}>
        <DetailPageProperties store={store} />
      </CanvasStoreContext.Provider>,
    );
    expect(screen.getByText("100%")).toBeTruthy();

    act(() => store.getElementById("svg1")!.set({ opacity: 0.4 }));

    expect(await screen.findByText("40%")).toBeTruthy();
    expect(screen.getByRole("slider")).toHaveProperty("value", "40");
  });

  it("슬라이더를 움직이면 선택된 요소에 opacity가 반영된다", async () => {
    const user = userEvent.setup();
    const el = makeElement({ id: "svg1", type: "svg", opacity: 1 });
    const store = makeStore([el]);

    render(<DetailPageProperties store={store} />);
    const slider = screen.getByRole("slider");
    await user.click(slider);
    fireEvent.change(slider, { target: { value: "30" } });

    expect(el.set).toHaveBeenCalledWith({ opacity: 0.3 });
  });
});

/**
 * A selected text gets the copy prompt-edit panel ("프롬프트로 편집") in the real
 * editor. It must appear for ANY text (a generation instance exists), even one
 * without a ``custom.leviosaSlot`` — headlines and ungrouped texts often carry no
 * slot, and gating on the slot used to hide the panel entirely. Fixtures (no
 * generatedId) still hide it.
 */
describe("DetailPageProperties — 텍스트 프롬프트 편집 게이팅", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the copy prompt-edit panel for a slotless text when a generatedId is present", () => {
    const el = makeElement({ id: "t1", type: "text", text: "해외에서 먼저 입소문 난" });
    const store = makeStore([el]);
    renderAiEdit(store, [el], "gen_1");
    expect(screen.getByText("detailPage.promptEdit.header")).toBeTruthy();
  });

  it("still shows it for a slotted text", () => {
    const el = makeElement({
      id: "t1",
      type: "text",
      text: "쿨링 진정 앰플",
      custom: { leviosaSlot: "headline.sub" },
    });
    const store = makeStore([el]);
    renderAiEdit(store, [el], "gen_1");
    expect(screen.getByText("detailPage.promptEdit.header")).toBeTruthy();
  });

  it("hides it in fixture mode (no generatedId)", () => {
    const el = makeElement({ id: "t1", type: "text", text: "본문" });
    const store = makeStore([el]);
    renderAiEdit(store, [el]);
    expect(screen.queryByText("detailPage.promptEdit.header")).toBeNull();
  });
});

/**
 * Selecting a GROUP must expose a SINGLE "프롬프트로 편집" box under a "그룹 편집"
 * section that rewrites every editable element inside the group at once — texts
 * are rewritten together (one LLM call so they stay consistent) and SVG shapes are
 * redrawn under the same instruction. Only ONE prompt component appears regardless
 * of how many texts/shapes the group holds. Images are ignored. A group with no
 * editable descendants shows no such section.
 */
describe("DetailPageProperties — 그룹 편집", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockGroupPromptEdit.mockReset();
  });

  it("renders exactly ONE prompt panel for a group with several texts", () => {
    const t1 = makeElement({ id: "t1", type: "text", text: "해외에서 먼저 입소문 난" });
    const t2 = makeElement({ id: "t2", type: "text", text: "쿨링 진정 앰플" });
    const img = makeElement({ id: "i1", type: "image" });
    const group = makeElement({
      id: "g1",
      type: "group",
      children: [t1, img, t2],
    });
    const store = makeStore([group]);
    renderAiEdit(store, [group], "gen_1");

    expect(screen.getByText("detailPage.groupEdit.title")).toBeTruthy();
    expect(screen.getByText("detailPage.groupEdit.texts")).toBeTruthy();
    // 텍스트가 여러 개여도 프롬프트 편집 컴포넌트는 딱 하나.
    expect(screen.getAllByText("프롬프트로 편집")).toHaveLength(1);
  });

  it("그룹 해제·삭제는 우측 패널에 그대로 남는다", () => {
    const t1 = makeElement({ id: "t1", type: "text", text: "문구" });
    const group = makeElement({ id: "g1", type: "group", children: [t1] });
    const store = makeStore([group]);
    render(<DetailPageProperties store={store} generatedId="gen_1" />);
    expect(
      screen.getByRole("button", { name: "detailPage.properties.ungroup" }),
    ).toBeTruthy();
    // 프롬프트 편집은 띠로 옮겼으므로 우측에는 없다.
    expect(screen.queryByText("detailPage.groupEdit.title")).toBeNull();
  });

  it("includes texts nested in sub-groups under one panel", () => {
    const deep = makeElement({ id: "d1", type: "text", text: "중첩 텍스트" });
    const inner = makeElement({ id: "gi", type: "group", children: [deep] });
    const group = makeElement({ id: "g1", type: "group", children: [inner] });
    const store = makeStore([group]);
    renderAiEdit(store, [group], "gen_1");
    expect(screen.getByText("detailPage.groupEdit.title")).toBeTruthy();
    expect(screen.getAllByText("프롬프트로 편집")).toHaveLength(1);
  });

  it("exposes ONE prompt panel for a group of SVG shapes (with markup)", () => {
    const svg = encodeSvgDataUri('<svg viewBox="0 0 10 10"><rect/></svg>');
    const s1 = makeElement({ id: "s1", type: "svg", src: svg });
    const s2 = makeElement({ id: "s2", type: "svg", src: svg });
    const group = makeElement({ id: "g1", type: "group", children: [s1, s2] });
    const store = makeStore([group]);
    renderAiEdit(store, [group], "gen_1");
    expect(screen.getByText("detailPage.groupEdit.title")).toBeTruthy();
    expect(screen.getByText("detailPage.groupEdit.shapes")).toBeTruthy();
    expect(screen.getAllByText("프롬프트로 편집")).toHaveLength(1);
  });

  it("describes a mixed text+shape group and shows one panel", () => {
    const svg = encodeSvgDataUri('<svg viewBox="0 0 10 10"><rect/></svg>');
    const t1 = makeElement({ id: "t1", type: "text", text: "배지 문구" });
    const s1 = makeElement({ id: "s1", type: "svg", src: svg });
    const group = makeElement({ id: "g1", type: "group", children: [s1, t1] });
    const store = makeStore([group]);
    renderAiEdit(store, [group], "gen_1");
    expect(screen.getByText("detailPage.groupEdit.both")).toBeTruthy();
    expect(screen.getAllByText("프롬프트로 편집")).toHaveLength(1);
  });

  it("sends every editable descendant in ONE call and applies results by id", async () => {
    const user = userEvent.setup();
    mockGroupPromptEdit.mockResolvedValue({
      results: [
        { id: "t1", kind: "text", text: "새 문구 1" },
        { id: "t2", kind: "text", text: "새 문구 2" },
      ],
      text_used: 1,
      text_limit: 20,
      svg_used: 0,
      svg_limit: 20,
    });
    const t1 = makeElement({ id: "t1", type: "text", text: "옛 문구 1" });
    const t2 = makeElement({ id: "t2", type: "text", text: "옛 문구 2" });
    const group = makeElement({ id: "g1", type: "group", children: [t1, t2] });
    const store = makeStore([group]);
    renderAiEdit(store, [group], "gen_1");

    await user.type(
      screen.getByPlaceholderText(/어떻게 바꿀까요/),
      "톤을 통일해서",
    );
    await user.click(screen.getByRole("button", { name: "프롬프트로 수정" }));

    expect(mockGroupPromptEdit).toHaveBeenCalledTimes(1);
    const [genId, payload] = mockGroupPromptEdit.mock.calls[0];
    expect(genId).toBe("gen_1");
    expect(payload.instruction).toBe("톤을 통일해서");
    // 그룹 안 두 텍스트가 한 요청의 items로 함께 전달된다.
    expect(payload.items.map((i: { id: string }) => i.id)).toEqual(["t1", "t2"]);
    // 결과가 id로 각 요소에 반영된다.
    expect(t1.set).toHaveBeenCalledWith({ text: "새 문구 1" });
    expect(t2.set).toHaveBeenCalledWith({ text: "새 문구 2" });
  });

  it("hides the section for a group with no editable descendants", () => {
    const img = makeElement({ id: "i1", type: "image" });
    // src 없는 svg는 마크업이 없어 편집 대상이 아니다.
    const shape = makeElement({ id: "s1", type: "svg" });
    const group = makeElement({ id: "g1", type: "group", children: [img, shape] });
    const store = makeStore([group]);
    renderAiEdit(store, [group], "gen_1");
    expect(screen.queryByText("detailPage.groupEdit.title")).toBeNull();
    // 하지만 그룹 자체 액션(해제/삭제)은 우측 패널에 여전히 있다.
    render(<DetailPageProperties store={store} generatedId="gen_1" />);
    expect(screen.getByRole("button", { name: "detailPage.properties.ungroup" })).toBeTruthy();
  });

  it("hides the section in fixture mode (no generatedId)", () => {
    const t1 = makeElement({ id: "t1", type: "text", text: "본문" });
    const group = makeElement({ id: "g1", type: "group", children: [t1] });
    const store = makeStore([group]);
    renderAiEdit(store, [group]);
    expect(screen.queryByText("detailPage.groupEdit.title")).toBeNull();
  });
});

/**
 * A selected SVG shape gets a prompt-edit panel ("AI 도형 편집") — but only in the
 * real editor (a generation instance exists) and only when the element actually
 * carries decodable SVG markup in its ``src``. Fixtures (no generatedId) and
 * markup-less shapes must not show it.
 */
describe("DetailPageProperties — SVG 프롬프트 편집", () => {
  afterEach(() => vi.restoreAllMocks());

  const svgDataUri = `data:image/svg+xml;base64,${btoa(
    '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
  )}`;

  it("shows the prompt-edit panel for an svg with markup when a generatedId is present", () => {
    const el = makeElement({ id: "s1", type: "svg", src: svgDataUri });
    const store = makeStore([el]);
    renderAiEdit(store, [el], "gen_1");
    expect(screen.getByText("detailPage.properties.aiShapeEdit")).toBeTruthy();
  });

  it("hides the prompt-edit panel in fixture mode (no generatedId)", () => {
    const el = makeElement({ id: "s1", type: "svg", src: svgDataUri });
    const store = makeStore([el]);
    renderAiEdit(store, [el]);
    expect(screen.queryByText("detailPage.properties.aiShapeEdit")).toBeNull();
  });

  it("hides the prompt-edit panel for a shape without decodable svg markup", () => {
    const el = makeElement({ id: "f1", type: "svg", src: "" });
    const store = makeStore([el]);
    renderAiEdit(store, [el], "gen_1");
    expect(screen.queryByText("detailPage.properties.aiShapeEdit")).toBeNull();
  });
});

/**
 * 크기·위치의 W/H/X/Y 라벨은 피그마식 드래그 스크럽 핸들이다. 라벨을 누른 채 좌우로
 * 끌면 1px당 값이 증감하고(Shift ×10) 요소에 실시간 반영된다. 단일 선택일 때만 뜬다.
 */
describe("DetailPageProperties — 크기·위치 드래그 스크럽", () => {
  afterEach(() => vi.restoreAllMocks());

  it("드래그하면 폭이 이동 px만큼 증가한다", () => {
    const el = makeElement({ id: "f1", type: "figure", width: 100, height: 50, x: 0, y: 0 });
    const store = makeStore([el]);
    render(<DetailPageProperties store={store} />);
    const handle = screen.getByTitle(/W —/);
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 240, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    // 100 + 40px = 140
    expect(el.set).toHaveBeenLastCalledWith({ width: 140 });
  });

  it("Shift 드래그는 ×10 가속한다", () => {
    const el = makeElement({ id: "f1", type: "figure", width: 100, height: 50, x: 0, y: 0 });
    const store = makeStore([el]);
    render(<DetailPageProperties store={store} />);
    const handle = screen.getByTitle(/H —/);
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 105, shiftKey: true, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    // 50 + 5px*10 = 100
    expect(el.set).toHaveBeenLastCalledWith({ height: 100 });
  });

  it("크기·위치는 다중 선택 시 숨는다", () => {
    const store = makeStore([
      makeElement({ id: "a", type: "figure" }),
      makeElement({ id: "b", type: "figure" }),
    ]);
    render(<DetailPageProperties store={store} />);
    expect(screen.queryByTitle(/W —/)).toBeNull();
  });
});
