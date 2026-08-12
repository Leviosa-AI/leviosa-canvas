import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  DetailPageLayersPanel,
  flattenLayers,
  groupContextIds,
  rangeIds,
  selectionExpandIds,
  zoneAt,
} from "../detail-page-layers-panel";
import {
  getHoveredLayerId,
  setHoveredLayerId,
} from "../hovered-layer";

/**
 * The layers panel is a Figma-style tree over ``activePage.children``: groups
 * nest (indented, collapsible), the front-most element sits at the top, and each
 * row can select / toggle-visibility / lock / delete the element.
 */
function el(overrides: Record<string, unknown>) {
  return {
    id: "e",
    type: "figure",
    name: "",
    visible: true,
    locked: false,
    removable: true,
    selectable: true,
    set: vi.fn(),
    ...overrides,
  };
}

function makeStore(children: Array<Record<string, unknown>>, selected: string[] = []) {
  const flat: Array<Record<string, unknown>> = [];
  const walk = (list: Array<Record<string, unknown>>) => {
    for (const c of list) {
      flat.push(c);
      if (Array.isArray(c.children)) walk(c.children as Array<Record<string, unknown>>);
    }
  };
  walk(children);
  return {
    activePage: { children },
    selectedElements: flat.filter((c) => selected.includes(c.id as string)),
    selectElements: vi.fn(),
    deleteElements: vi.fn(),
  };
}

describe("DetailPageLayersPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("labels a text layer with its content and other layers with their name", () => {
    const store = makeStore([
      el({ id: "t1", type: "text", text: "  데일리 <b>피지</b> 컨트롤 " }),
      el({ id: "i1", type: "image", name: "#benefit-image-0" }),
    ]);
    render(<DetailPageLayersPanel store={store} />);
    expect(screen.getByText("데일리 피지 컨트롤")).toBeTruthy();
    expect(screen.getByText("#benefit-image-0")).toBeTruthy();
  });

  it("labels a GIF layer 'GIF' (custom.detailPageGif) instead of the image auto-name", () => {
    const store = makeStore([
      el({ id: "g1", type: "image", name: "", custom: { detailPageGif: true } }),
    ]);
    render(<DetailPageLayersPanel store={store} />);
    expect(screen.getByText("GIF")).toBeTruthy();
    // 이미지 기본 라벨로는 뜨지 않는다.
    expect(screen.queryByText("detailPage.layers.image")).toBeNull();
  });

  it("labels a .gif-src image layer 'GIF' even without the custom flag", () => {
    const store = makeStore([
      el({ id: "g2", type: "image", name: "", src: "https://s3/anim.gif" }),
    ]);
    render(<DetailPageLayersPanel store={store} />);
    expect(screen.getByText("GIF")).toBeTruthy();
  });

  it("renders front-most element first (children array reversed)", () => {
    const store = makeStore([
      el({ id: "back", type: "text", text: "뒤" }),
      el({ id: "front", type: "text", text: "앞" }),
    ]);
    render(<DetailPageLayersPanel store={store} />);
    // The first labelled row should be the front-most ("앞").
    const order = screen.getAllByText(/^(앞|뒤)$/).map((n) => n.textContent);
    expect(order[0]).toBe("앞");
  });

  it("selects the element on row click", async () => {
    const user = userEvent.setup();
    const store = makeStore([el({ id: "t1", type: "text", text: "제목" })]);
    render(<DetailPageLayersPanel store={store} />);
    await user.click(screen.getByText("제목"));
    expect(store.selectElements).toHaveBeenCalledWith(["t1"]);
  });

  it("toggles visibility, and re-shows a hidden layer", async () => {
    const user = userEvent.setup();
    const visible = el({ id: "v1", type: "figure", visible: true });
    render(<DetailPageLayersPanel store={makeStore([visible])} />);
    await user.click(screen.getByRole("button", { name: "detailPage.layers.hide" }));
    expect(visible.set).toHaveBeenCalledWith({ visible: false });

    const hidden = el({ id: "h1", type: "figure", visible: false });
    render(<DetailPageLayersPanel store={makeStore([hidden])} />);
    await user.click(screen.getByRole("button", { name: "detailPage.layers.show" }));
    expect(hidden.set).toHaveBeenCalledWith({ visible: true });
  });

  it("treats a missing `visible` field as visible", async () => {
    // 분해기가 만든 문서에는 `visible`이 아예 없다. `!el.visible`로 읽으면 열자마자
    // 모든 레이어가 취소선 + 눈 감은 아이콘으로 뜬다. 렌더러는 `=== false`만 숨긴다.
    const user = userEvent.setup();
    const bare = el({ id: "b1", type: "figure" });
    delete (bare as { visible?: boolean }).visible;
    render(<DetailPageLayersPanel store={makeStore([bare])} />);

    expect(
      screen.getByRole("button", { name: "detailPage.layers.hide" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "detailPage.layers.show" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "detailPage.layers.hide" }));
    expect(bare.set).toHaveBeenCalledWith({ visible: false });
  });

  it("lists an element that carries no `selectable` flag", async () => {
    // 좌측 패널에서 갓 넣은 도형·아이콘·차트에는 이 필드가 없다. `!el.selectable`로
    // 읽으면 행이 통째로 사라져서, 머리글 숫자는 세는데 목록에는 안 뜨는 모양이 된다.
    const bare = el({ id: "n1", type: "svg" });
    delete (bare as { selectable?: boolean }).selectable;
    const named = el({ id: "n2", type: "group", name: "차트" });
    delete (named as { selectable?: boolean }).selectable;
    render(<DetailPageLayersPanel store={makeStore([bare, named])} />);

    expect(screen.getByText("차트")).toBeInTheDocument();
    expect(screen.getByText("detailPage.layers.shape")).toBeInTheDocument();
  });

  it("keeps the delete button live when `removable` is absent", async () => {
    const bare = el({ id: "r1", type: "svg" });
    delete (bare as { removable?: boolean }).removable;
    render(<DetailPageLayersPanel store={makeStore([bare])} />);

    expect(
      screen.getByRole("button", { name: "detailPage.layers.delete" }),
    ).not.toBeDisabled();
  });

  it("hides only what is pinned unselectable", async () => {
    const blocked = el({ id: "x1", type: "figure", selectable: false });
    render(<DetailPageLayersPanel store={makeStore([blocked])} />);

    expect(screen.queryByText("detailPage.layers.shape")).not.toBeInTheDocument();
  });

  it("locks an unlocked layer by clearing its edit flags", async () => {
    const user = userEvent.setup();
    const unlocked = el({ id: "u1", locked: false });
    render(<DetailPageLayersPanel store={makeStore([unlocked])} />);
    await user.click(screen.getByRole("button", { name: "detailPage.layers.lock" }));
    // locked=false → set every edit flag to false (the stock editor's lock semantics).
    expect(unlocked.set).toHaveBeenCalledWith({
      draggable: false,
      contentEditable: false,
      styleEditable: false,
      resizable: false,
      removable: false,
    });
  });

  it("deletes a removable layer through the store", async () => {
    const user = userEvent.setup();
    const removable = el({ id: "r1", removable: true });
    const store = makeStore([removable]);
    render(<DetailPageLayersPanel store={store} />);
    await user.click(screen.getByRole("button", { name: "detailPage.layers.delete" }));
    expect(store.deleteElements).toHaveBeenCalledWith(["r1"]);
  });

  it("disables delete for a non-removable layer", () => {
    const store = makeStore([el({ id: "n1", removable: false })]);
    render(<DetailPageLayersPanel store={store} />);
    expect(screen.getByRole("button", { name: "detailPage.layers.delete" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("nests group children, collapsed by default, and toggles on chevron click", async () => {
    const user = userEvent.setup();
    const store = makeStore([
      el({
        id: "g1",
        type: "group",
        name: "#benefit-group",
        children: [el({ id: "c1", type: "text", text: "자식텍스트" })],
      }),
    ]);
    render(<DetailPageLayersPanel store={store} />);
    // Collapsed by default: child is hidden.
    expect(screen.queryByText("자식텍스트")).toBeNull();
    // Expand via the group's chevron (labelled 펼치기).
    await user.click(screen.getByRole("button", { name: "detailPage.layers.expand" }));
    expect(screen.getByText("자식텍스트")).toBeTruthy();
    // Collapse again (now labelled 접기).
    await user.click(screen.getByRole("button", { name: "detailPage.layers.collapse" }));
    expect(screen.queryByText("자식텍스트")).toBeNull();
  });

  it("auto-expands a group when it is the current selection", () => {
    const store = makeStore(
      [
        el({
          id: "g1",
          type: "group",
          name: "#benefit-group",
          children: [el({ id: "c1", type: "text", text: "자식텍스트" })],
        }),
      ],
      ["g1"],
    );
    render(<DetailPageLayersPanel store={store} />);
    // Selecting the group opens it, revealing the child without a manual toggle.
    expect(screen.getByText("자식텍스트")).toBeTruthy();
  });

  it("hides non-selectable elements (e.g. locked background)", () => {
    const store = makeStore([
      el({ id: "bg", type: "figure", name: "#benefit-bg", selectable: false }),
      el({ id: "t1", type: "text", text: "보이는텍스트" }),
    ]);
    render(<DetailPageLayersPanel store={store} />);
    expect(screen.queryByText("#benefit-bg")).toBeNull();
    expect(screen.getByText("보이는텍스트")).toBeTruthy();
  });
});

/**
 * 캔버스에서 되는 삭제가 레이어 패널에서도 돼야 한다 — 행에 포커스가 있으면
 * Backspace/Delete로 지운다.
 */
describe("DetailPageLayersPanel — 키보드 삭제", () => {
  afterEach(() => vi.restoreAllMocks());

  const rowOf = (text: string) =>
    screen.getByText(text).closest('[role="button"]') as HTMLElement;

  it("포커스한 행에서 Backspace로 지운다", async () => {
    const user = userEvent.setup();
    const store = makeStore([el({ id: "r1", type: "image", name: "사진" })]);
    render(<DetailPageLayersPanel store={store} />);

    rowOf("사진").focus();
    await user.keyboard("{Backspace}");

    expect(store.deleteElements).toHaveBeenCalledWith(["r1"]);
  });

  it("Delete 키도 같다", async () => {
    const user = userEvent.setup();
    const store = makeStore([el({ id: "r1", type: "image", name: "사진" })]);
    render(<DetailPageLayersPanel store={store} />);

    rowOf("사진").focus();
    await user.keyboard("{Delete}");

    expect(store.deleteElements).toHaveBeenCalledWith(["r1"]);
  });

  it("지울 수 없는 레이어는 그대로 둔다", async () => {
    const user = userEvent.setup();
    const store = makeStore([
      el({ id: "n1", type: "image", name: "배경", removable: false }),
    ]);
    render(<DetailPageLayersPanel store={store} />);

    rowOf("배경").focus();
    await user.keyboard("{Backspace}");

    expect(store.deleteElements).not.toHaveBeenCalled();
  });
});

/**
 * Figma처럼 행을 끌어 순서를 바꾸고 그룹 안팎으로 옮긴다. 옮기는 규칙 자체는
 * ``layer-move``에서 검증하고, 여기서는 배선(어느 자리로 옮기라고 부르는지)을 본다.
 */
describe("DetailPageLayersPanel — 드래그 이동", () => {
  afterEach(() => vi.restoreAllMocks());

  const dataTransfer = () => ({
    setData: vi.fn(),
    getData: vi.fn(),
    dropEffect: "",
    effectAllowed: "",
  });

  const rowOf = (text: string) =>
    screen.getByText(text).closest('[role="button"]') as HTMLElement;

  it("행을 다른 행 위로 끌면 그 행보다 앞으로 옮긴다", () => {
    const store = makeStore([
      el({ id: "a", type: "image", name: "A" }),
      el({ id: "b", type: "image", name: "B" }),
      el({ id: "c", type: "image", name: "C" }),
    ]);
    const setElementZIndex = vi.fn();
    (store.activePage as { setElementZIndex?: unknown }).setElementZIndex =
      setElementZIndex;
    render(<DetailPageLayersPanel store={store} />);

    const dt = dataTransfer();
    fireEvent.dragStart(rowOf("A"), { dataTransfer: dt });
    fireEvent.dragOver(rowOf("C"), { dataTransfer: dt, clientY: 0 });
    fireEvent.drop(rowOf("C"), { dataTransfer: dt });

    // 목록은 뒤집혀 보이므로 "C 행 위"는 모델의 맨 앞(2번 칸).
    expect(setElementZIndex).toHaveBeenCalledWith("a", 2);
  });

  it("행 위 어디를 가리키는지에 따라 놓을 자리가 갈린다", () => {
    // 그룹 행 가운데(30~70%)만 "그 안으로", 나머지는 위/아래 순서 바꾸기.
    expect(zoneAt(0.5, true)).toBe("inside");
    expect(zoneAt(0.1, true)).toBe("before");
    expect(zoneAt(0.9, true)).toBe("after");
    // 그룹이 아니면 가운데도 순서 바꾸기다.
    expect(zoneAt(0.5, false)).toBe("after");
    expect(zoneAt(0.2, false)).toBe("before");
  });
});

/**
 * Hovering a row previews that layer on the canvas. A decomposed chart is a dozen
 * rows all reading "도형", so the only way to tell them apart is to see the shape
 * light up — and it must be a PREVIEW: hovering must never change the selection.
 */
describe("DetailPageLayersPanel — hover preview", () => {
  afterEach(() => {
    setHoveredLayerId(null);
    vi.restoreAllMocks();
  });

  it("publishes the hovered layer id and clears it on leave", async () => {
    const user = userEvent.setup();
    const store = makeStore([el({ id: "s1", type: "svg" })]);
    render(<DetailPageLayersPanel store={store} />);

    const row = screen.getByText("detailPage.layers.shape");
    await user.hover(row);
    expect(getHoveredLayerId()).toBe("s1");

    await user.unhover(row);
    expect(getHoveredLayerId()).toBeNull();
    // A preview, not a state: hovering never selects.
    expect(store.selectElements).not.toHaveBeenCalled();
  });
});

/**
 * With a group selected — or one shape inside it — the tree gives no clue which of
 * the surrounding rows belong to that group (a decomposed chart is a dozen sibling
 * rows all reading "도형"). The active group's whole subtree gets a pale wash; the
 * selected row keeps the solid blue.
 */
describe("groupContextIds", () => {
  const tree = [
    {
      id: "g1",
      type: "group",
      children: [
        { id: "a", type: "text" },
        {
          id: "g2",
          type: "group",
          children: [
            { id: "b", type: "svg" },
            { id: "c", type: "svg" },
          ],
        },
      ],
    },
    { id: "t1", type: "text" },
  ];

  it("washes a selected group's whole subtree, itself included", () => {
    expect([...groupContextIds(tree, ["g1"])]).toEqual(["g1", "a", "g2", "b", "c"]);
  });

  it("washes the group that CONTAINS the selected shape, not the whole page", () => {
    // 'b' lives in g2 — so g2 and its children light up, but g1's other branch ('a')
    // and the top-level text do not.
    expect([...groupContextIds(tree, ["b"])]).toEqual(["g2", "b", "c"]);
  });

  it("washes nothing for a top-level element or an empty selection", () => {
    expect([...groupContextIds(tree, ["t1"])]).toEqual([]);
    expect([...groupContextIds(tree, [])]).toEqual([]);
  });
});

/**
 * Groups start collapsed; selecting one opens it (and its ancestors, so a nested
 * pick is visible). Only these ids get merged into the open set — nothing is closed
 * — which is what makes the expansion sticky (no accordion).
 */
describe("selectionExpandIds", () => {
  const tree = [
    {
      id: "g1",
      type: "group",
      children: [
        { id: "a", type: "text" },
        {
          id: "g2",
          type: "group",
          children: [
            { id: "b", type: "svg" },
            { id: "c", type: "svg" },
          ],
        },
      ],
    },
    { id: "t1", type: "text" },
  ];

  it("opens a selected group itself", () => {
    expect([...selectionExpandIds(tree, ["g1"])]).toEqual(["g1"]);
  });

  it("opens the whole ancestor chain down to a nested selection", () => {
    // 'b' lives in g2 inside g1 — both must open so the row is reachable.
    expect(new Set(selectionExpandIds(tree, ["b"]))).toEqual(new Set(["g1", "g2"]));
  });

  it("opens the containing group when a plain child is selected", () => {
    expect([...selectionExpandIds(tree, ["a"])]).toEqual(["g1"]);
  });

  it("opens nothing for a top-level element or an empty selection", () => {
    expect([...selectionExpandIds(tree, ["t1"])]).toEqual([]);
    expect([...selectionExpandIds(tree, [])]).toEqual([]);
  });
});

/**
 * 여러 줄 고르기. 캔버스에서 ⇧클릭으로 여럿을 잡을 수 있는데 목록에서만 한 개씩이면
 * 같은 문서를 두 가지 규칙으로 만지는 셈이 된다.
 */
describe("DetailPageLayersPanel — 범위 선택", () => {
  afterEach(() => vi.restoreAllMocks());

  const rowOf = (text: string) =>
    screen.getByText(text).closest('[role="button"]') as HTMLElement;

  const five = () =>
    makeStore(
      ["A", "B", "C", "D", "E"].map((name) =>
        el({ id: name.toLowerCase(), type: "image", name }),
      ),
    );

  it("⇧클릭은 먼저 누른 줄부터 여기까지 통째로 잡는다", async () => {
    const user = userEvent.setup();
    const store = five();
    render(<DetailPageLayersPanel store={store} />);

    // 목록은 뒤집혀 보인다 — 위에서부터 E D C B A.
    await user.click(rowOf("D"));
    expect(store.selectElements).toHaveBeenLastCalledWith(["d"]);

    await user.keyboard("{Shift>}");
    await user.click(rowOf("B"));
    await user.keyboard("{/Shift}");

    expect(store.selectElements).toHaveBeenLastCalledWith(["d", "c", "b"]);
  });

  it("어느 쪽을 먼저 눌러도 사이가 잡힌다", async () => {
    const user = userEvent.setup();
    const store = five();
    render(<DetailPageLayersPanel store={store} />);

    await user.click(rowOf("B"));
    await user.keyboard("{Shift>}");
    await user.click(rowOf("D"));
    await user.keyboard("{/Shift}");

    expect(store.selectElements).toHaveBeenLastCalledWith(["d", "c", "b"]);
  });

  it("기준점 없이 ⇧클릭하면 그 줄만", async () => {
    const user = userEvent.setup();
    const store = five();
    render(<DetailPageLayersPanel store={store} />);

    await user.keyboard("{Shift>}");
    await user.click(rowOf("C"));
    await user.keyboard("{/Shift}");

    expect(store.selectElements).toHaveBeenLastCalledWith(["c"]);
  });

  it("⌘클릭은 그 줄만 넣고 뺀다", async () => {
    const user = userEvent.setup();
    const store = makeStore(
      ["A", "B", "C"].map((name) => el({ id: name.toLowerCase(), type: "image", name })),
      ["a"],
    );
    render(<DetailPageLayersPanel store={store} />);

    await user.keyboard("{Meta>}");
    await user.click(rowOf("C"));
    await user.keyboard("{/Meta}");
    expect(store.selectElements).toHaveBeenLastCalledWith(["a", "c"]);

    await user.keyboard("{Meta>}");
    await user.click(rowOf("A"));
    await user.keyboard("{/Meta}");
    expect(store.selectElements).toHaveBeenLastCalledWith([]);
  });

  it("펼친 그룹의 자식도 같은 줄 세기에 들어간다", async () => {
    const user = userEvent.setup();
    const store = makeStore([
      el({ id: "z", type: "image", name: "Z" }),
      el({
        id: "g",
        type: "group",
        name: "G",
        children: [
          el({ id: "g1", type: "image", name: "G1" }),
          el({ id: "g2", type: "image", name: "G2" }),
        ],
      }),
    ]);
    render(<DetailPageLayersPanel store={store} />);

    await user.click(screen.getByTitle("detailPage.layers.expand"));
    await user.click(rowOf("G2"));
    await user.keyboard("{Shift>}");
    await user.click(rowOf("Z"));
    await user.keyboard("{/Shift}");

    // 보이는 순서는 G · G2 · G1 · Z다.
    expect(store.selectElements).toHaveBeenLastCalledWith(["g2", "g1", "z"]);
  });
});

describe("flattenLayers / rangeIds", () => {
  const node = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    type: "image",
    ...extra,
  });

  it("앞에 그려지는 것이 목록 위로 온다", () => {
    const rows = flattenLayers([node("a"), node("b")], new Set());
    expect(rows.map((r) => r.el.id)).toEqual(["b", "a"]);
  });

  it("접힌 그룹의 자식은 안 센다", () => {
    const tree = [node("g", { type: "group", children: [node("c1")] })];
    expect(flattenLayers(tree, new Set()).map((r) => r.el.id)).toEqual(["g"]);
    expect(flattenLayers(tree, new Set(["g"])).map((r) => r.el.id)).toEqual(["g", "c1"]);
  });

  it("선택 불가로 못 박은 것만 뺀다 — 필드가 없는 것이 정상이다", () => {
    const rows = flattenLayers(
      [node("keep"), node("pinned", { selectable: false })],
      new Set(),
    );
    expect(rows.map((r) => r.el.id)).toEqual(["keep"]);
  });

  it("기준점이 목록에서 사라졌으면 누른 줄 하나만", () => {
    const rows = [{ el: { id: "a" } }, { el: { id: "b" } }];
    expect(rangeIds(rows, "없음", "b")).toEqual(["b"]);
    expect(rangeIds(rows, null, "b")).toEqual(["b"]);
  });
});
