import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPageProperties } from "../detail-page-properties-panel";
import { encodeSvgDataUri } from "../../../lib/detail-page-canvas/export/svg";

// 패널은 이제 소싱 서버를 `DetailPageHost` 로만 만난다 — 가짜 호스트를 꽂고 렌더한다.
import { renderWithDetailPageHost as render } from "./host-stub";


/**
 * `colorsReplace`는 렌더러·서식 복사·굽는 길이 오래 읽고 있었지만 **쓰는 UI가 없었다.**
 * 그래서 도형·아이콘을 넣으면 소스 색 그대로 박제됐다. 이 구획이 그 반쪽이다.
 */

function svgElement(markup: string, colorsReplace?: Record<string, string>) {
  return {
    id: "s1",
    type: "svg",
    opacity: 1,
    src: encodeSvgDataUri(markup),
    ...(colorsReplace ? { colorsReplace } : {}),
    set: vi.fn(),
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

/** `ColorInput`은 색을 `title`에 단 버튼 하나로 접힌다(팝오버는 포털). */
const swatches = () =>
  screen
    .queryAllByRole("button")
    .filter((node) => /^#|^currentcolor$/i.test(node.getAttribute("title") ?? ""));

/** 팝오버를 열고 hex 칸에 값을 넣어 확정한다. */
async function pickHex(
  user: ReturnType<typeof userEvent.setup>,
  swatch: HTMLElement,
  hex: string,
) {
  await user.click(swatch);
  const field = screen.getByPlaceholderText("#000000");
  await user.clear(field);
  await user.type(field, `${hex}{Enter}`);
}

afterEach(() => vi.restoreAllMocks());

describe("SVG 색 구획", () => {
  it("마크업에 쓰인 색마다 스와치를 세운다", () => {
    const el = svgElement(
      `<svg viewBox="0 0 24 24"><rect fill="#ff0000"/><circle stroke="#00ff00"/></svg>`,
    );
    render(<DetailPageProperties store={makeStore([el])} />);

    expect(screen.getByText("detailPage.properties.shapeColors")).toBeInTheDocument();
    expect(swatches().map((node) => node.getAttribute("title"))).toEqual([
      "#ff0000",
      "#00ff00",
    ]);
  });

  it("색을 바꾸면 colorsReplace 에 쓴다 — 렌더러가 이미 읽는 계약이다", async () => {
    const user = userEvent.setup();
    const el = svgElement(`<svg viewBox="0 0 24 24"><rect fill="#ff0000"/></svg>`);
    render(<DetailPageProperties store={makeStore([el])} />);

    await pickHex(user, swatches()[0], "#0000ff");

    expect(el.set).toHaveBeenCalledWith({
      colorsReplace: { "#ff0000": "#0000ff" },
    });
  });

  it("이미 바뀐 색은 바뀐 값을 보여 준다", () => {
    const el = svgElement(`<svg viewBox="0 0 24 24"><rect fill="#ff0000"/></svg>`, {
      "#ff0000": "#0000ff",
    });
    render(<DetailPageProperties store={makeStore([el])} />);

    expect(swatches()[0].getAttribute("title")).toBe("#0000ff");
  });

  it("표기가 달라도 같은 색이면 스와치가 하나다", () => {
    const el = svgElement(
      `<svg viewBox="0 0 24 24"><a fill="#f00"/><b fill="#FF0000"/><c fill="rgb(255,0,0)"/></svg>`,
    );
    render(<DetailPageProperties store={makeStore([el])} />);

    expect(swatches()).toHaveLength(1);
  });

  it("되돌리기는 바뀐 것이 있을 때만 나오고 치환을 통째로 비운다", async () => {
    const user = userEvent.setup();
    const plain = svgElement(`<svg viewBox="0 0 24 24"><rect fill="#ff0000"/></svg>`);
    const { unmount } = render(<DetailPageProperties store={makeStore([plain])} />);
    expect(
      screen.queryByRole("button", { name: "detailPage.properties.shapeColorsReset" }),
    ).toBeNull();
    unmount();

    const changed = svgElement(
      `<svg viewBox="0 0 24 24"><rect fill="#ff0000"/></svg>`,
      { "#ff0000": "#0000ff" },
    );
    render(<DetailPageProperties store={makeStore([changed])} />);

    await user.click(
      screen.getByRole("button", { name: "detailPage.properties.shapeColorsReset" }),
    );
    expect(changed.set).toHaveBeenCalledWith({ colorsReplace: {} });
  });

  it("색이 없는 마크업에는 구획을 안 세운다", () => {
    const el = svgElement(`<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>`);
    render(<DetailPageProperties store={makeStore([el])} />);

    expect(screen.queryByText("detailPage.properties.shapeColors")).toBeNull();
  });

  it("아이콘의 currentColor 도 스와치로 잡는다", () => {
    const el = svgElement(
      `<svg viewBox="0 0 24 24"><g stroke="currentColor"><path d="M1 1"/></g></svg>`,
    );
    render(<DetailPageProperties store={makeStore([el])} />);

    expect(screen.getByText("detailPage.properties.shapeColors")).toBeInTheDocument();
  });
});
