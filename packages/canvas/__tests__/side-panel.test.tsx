/**
 * 좌측 패널 껍데기.
 *
 * 계약은 스톡 편집기의 `SidePanel`과 같다 — 지금 쓰는 12개 섹션을 한 줄도 안 고치고 옮겨
 * 꽂기 위해서다. 그래서 재는 것도 그 계약이다: 탭은 `{active, onClick}`을 받고, 열린
 * 패널 이름은 **스토어**에 산다(캔버스 쪽도 그걸 읽는다).
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SectionTab, SidePanel } from "../shell/side-panel";
import { createCanvasStore } from "../store";

function sections() {
  return [
    {
      name: "pages",
      Tab: (props: Record<string, unknown>) => (
        <SectionTab {...props} name="페이지" />
      ),
      Panel: () => <div data-testid="pages-panel" />,
    },
    {
      name: "text",
      Tab: (props: Record<string, unknown>) => (
        <SectionTab {...props} name="텍스트" />
      ),
      Panel: () => <div data-testid="text-panel" />,
    },
    {
      name: "hidden",
      visibleInList: false,
      Tab: (props: Record<string, unknown>) => (
        <SectionTab {...props} name="숨김" />
      ),
      Panel: () => <div data-testid="hidden-panel" />,
    },
  ];
}

describe("SidePanel", () => {
  it("기본 섹션을 열어 둔 채 시작한다", () => {
    const store = createCanvasStore({ width: 10, height: 10, pages: [] });
    render(
      <SidePanel store={store} sections={sections()} defaultSection="pages" />,
    );
    expect(store.openedSidePanel).toBe("pages");
    expect(screen.getByTestId("pages-panel")).toBeInTheDocument();
  });

  it("탭을 누르면 그 패널이 열린다", async () => {
    const store = createCanvasStore({ width: 10, height: 10, pages: [] });
    render(
      <SidePanel store={store} sections={sections()} defaultSection="pages" />,
    );
    await userEvent.click(screen.getByText("텍스트"));
    expect(store.openedSidePanel).toBe("text");
    expect(screen.getByTestId("text-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("pages-panel")).not.toBeInTheDocument();
  });

  it("열린 탭을 다시 누르면 접힌다", async () => {
    const store = createCanvasStore({ width: 10, height: 10, pages: [] });
    render(
      <SidePanel store={store} sections={sections()} defaultSection="pages" />,
    );
    await userEvent.click(screen.getByText("페이지"));
    expect(store.openedSidePanel).toBe("");
    expect(screen.queryByTestId("pages-panel")).not.toBeInTheDocument();
  });

  it("visibleInList가 false면 레일에 안 보이지만 열 수는 있다", () => {
    const store = createCanvasStore({ width: 10, height: 10, pages: [] });
    render(
      <SidePanel store={store} sections={sections()} defaultSection="hidden" />,
    );
    expect(screen.queryByText("숨김")).not.toBeInTheDocument();
    expect(screen.getByTestId("hidden-panel")).toBeInTheDocument();
  });

  it("스토어에서 연 것도 그대로 따라간다", () => {
    // 캔버스나 다른 UI가 `openSidePanel`을 부르는 길 — 패널이 자기 상태를 들면 끊긴다.
    const store = createCanvasStore({ width: 10, height: 10, pages: [] });
    render(
      <SidePanel store={store} sections={sections()} defaultSection="pages" />,
    );
    act(() => store.openSidePanel("text"));
    expect(screen.getByTestId("text-panel")).toBeInTheDocument();
  });
});
