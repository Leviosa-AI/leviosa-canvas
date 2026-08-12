import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockInsert = vi.fn();

vi.mock("../../../lib/detail-page/insert-shape", () => ({
  insertShape: (...args: unknown[]) => mockInsert(...args),
}));

import { DetailPageShapesPanel } from "../detail-page-shapes-panel";
import {
  BASIC_SHAPES,
  SHAPE_KEYWORDS,
  shapeMarkup,
  shapeMatches,
} from "../../../lib/detail-page/basic-shapes";

/** 네이티브 figure로 들어가는 셋(네모·둥근네모·동그라미). 나머지는 전부 svg다. */
const NATIVE = 3;

function renderPanel(store: unknown = { pages: [] }) {
  return render(<DetailPageShapesPanel store={store} />);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DetailPageShapesPanel", () => {
  it("카탈로그 전부를 한 화면에 편다 — 검색이 없는 목록이라 다 보여야 한다", () => {
    renderPanel();
    expect(screen.getAllByRole("button")).toHaveLength(NATIVE + BASIC_SHAPES.length);
  });

  it("상세페이지에 쓸 만큼 종류가 있다", () => {
    // 도형이 예닐곱 개뿐이면 사용자는 바깥에서 그려 온다. 하한을 못으로 박아 둔다.
    expect(BASIC_SHAPES.length).toBeGreaterThanOrEqual(50);
  });

  it("네모·동그라미는 네이티브 figure로 넣는다", async () => {
    const added: Array<Record<string, unknown>> = [];
    const page = {
      computedWidth: 750,
      computedHeight: 500,
      addElement: (opts: Record<string, unknown>) => added.push(opts),
    };
    renderPanel({ pages: [page], activePage: page });

    const buttons = screen.getAllByRole("button");
    await userEvent.click(buttons[0]);
    expect(added[0]).toMatchObject({ type: "figure", subType: "rect" });

    await userEvent.click(buttons[2]);
    expect(added[1]).toMatchObject({ type: "figure", subType: "circle" });
  });

  it("나머지는 svg다 — 우리 렌더러가 아는 subType은 네모와 타원 둘뿐이다", async () => {
    renderPanel();
    await userEvent.click(screen.getAllByRole("button")[NATIVE]);

    const first = BASIC_SHAPES[0];
    expect(mockInsert).toHaveBeenCalledWith(
      expect.anything(),
      shapeMarkup(first),
      first.viewBox,
    );
  });

  it("마지막 칸까지 자기 도형을 넣는다", async () => {
    // 카탈로그를 갈래별로 나눠 그리므로, 순서가 어긋나면 끝 칸부터 틀어진다.
    renderPanel();
    const buttons = screen.getAllByRole("button");
    await userEvent.click(buttons[buttons.length - 1]);

    const last = BASIC_SHAPES[BASIC_SHAPES.length - 1];
    expect(mockInsert).toHaveBeenCalledWith(
      expect.anything(),
      shapeMarkup(last),
      last.viewBox,
    );
  });

  it("미리보기와 삽입 마크업이 같은 함수에서 나온다", async () => {
    // 눌러 보고 다른 것이 나오면 안 된다.
    renderPanel();
    const cell = screen.getAllByRole("button")[NATIVE];
    const preview = cell.querySelector("svg");
    expect(preview?.getAttribute("viewBox")).toBe(BASIC_SHAPES[0].viewBox);

    await userEvent.click(cell);
    expect(mockInsert.mock.calls[0][1]).toBe(shapeMarkup(BASIC_SHAPES[0]));
  });

  it("색을 한 값으로 통일한다 — 우측 색 칸이 도형마다 하나여야 한다", () => {
    // 도형 하나가 색을 셋씩 쓰면 SVG 색 컨트롤이 칸을 셋 연다. 사용자는 "이 도형 색"을
    // 하나로 생각한다.
    for (const shape of BASIC_SHAPES) {
      const colors = new Set(shapeMarkup(shape).match(/#[0-9a-fA-F]{3,8}/g) ?? []);
      expect(colors.size, shape.id).toBeLessThanOrEqual(1);
    }
  });

  it("검색어를 넣으면 걸린 것만 남는다", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByRole("searchbox"), "말풍선");

    const hits = BASIC_SHAPES.filter((s) => shapeMatches(s.id, "말풍선"));
    expect(hits.length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button")).toHaveLength(hits.length);
  });

  it("한글로도 영어로도 찾힌다", () => {
    expect(shapeMatches("cloud", "구름")).toBe(true);
    expect(shapeMatches("cloud", "cloud")).toBe(true);
    expect(shapeMatches("cloud", "클라우")).toBe(false);
    // 화면 이름이 "네모"뿐이어도 사람은 "사각형"이라고 친다.
    expect(shapeMatches("rect", "사각형")).toBe(true);
    expect(shapeMatches("arrowRight", "화살표")).toBe(true);
  });

  it("빈 검색어는 아무것도 안 거른다", () => {
    expect(shapeMatches("cloud", "")).toBe(true);
    expect(shapeMatches("cloud", "   ")).toBe(true);
  });

  it("못 찾으면 빈 격자가 아니라 안내를 띄운다", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByRole("searchbox"), "존재하지않는도형");

    expect(screen.getByText("detailPage.shapes.searchEmpty")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("검색 사전이 카탈로그를 전부 덮는다", () => {
    // 사전에 없는 도형은 영어 id로만 찾히고, 한국어로는 영영 안 나온다.
    const missing = BASIC_SHAPES.filter((s) => !SHAPE_KEYWORDS[s.id]?.length);
    expect(missing.map((s) => s.id)).toEqual([]);
  });

  it("공용 카탈로그를 안 부른다 — 그건 장식 그룹으로 나갔다", () => {
    // 이 패널이 `sourcing-api`를 안 import 한다는 사실 자체가 계약이다. mock 없이
    // 렌더되는 것이 그 증거다(부르면 실제 fetch로 떨어져 터진다).
    expect(() => renderPanel()).not.toThrow();
  });
});
