import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CanvasSelectionTools } from "../canvas-selection-tools";
import { popoverPlacement, toolbarPosition } from "../selection-quick-toolbar";
import { EditorAiProvider } from "../editor-ai-context";
import { withDetailPageHost } from "./host-stub";

/**
 * 고른 것 위에 뜨는 띠.
 *
 * 자리는 Konva 를 재서 잡으므로 jsdom 에서는 그 한 겹만 대역을 세운다 — 나머지(무엇이
 * 뜨는가, 눌렀을 때 무엇이 열리는가)는 진짜 코드를 그대로 돌린다.
 */

vi.mock("../element-rects", async () => {
  const actual = await vi.importActual<typeof import("../element-rects")>(
    "../element-rects",
  );
  return {
    ...actual,
    elementClientRect: () => ({ left: 100, top: 200, right: 300, bottom: 320 }),
    elementScreenBox: () => ({
      left: 100,
      top: 200,
      width: 200,
      height: 120,
      scale: 1,
      rotation: 0,
    }),
  };
});

// 캔버스가 받아 둔 그림 대신 크기만 아는 대역을 준다.
vi.mock("@leviosa-ai/canvas/render/image-cache", () => ({
  loadImage: async () => ({ naturalWidth: 400, naturalHeight: 200 }),
}));

function imageElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "img1",
    type: "image",
    src: "https://s3/a.png",
    x: 0,
    y: 0,
    width: 200,
    height: 120,
    custom: {},
    set: vi.fn(),
    ...overrides,
  };
}

function makeStore(selected: Array<Record<string, unknown>>) {
  return {
    selectedElements: selected,
    selectedElementsIds: selected.map((el) => el.id as string),
    getElementById: (id: string) => selected.find((el) => el.id === id),
    pages: [{ id: "p1", children: selected }],
    deleteElements: vi.fn(),
  };
}

function renderTools(
  store: Record<string, unknown>,
  ai: Record<string, unknown> = {},
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  // clientWidth/Height 는 jsdom 에서 0이므로 자리 계산이 재는 값을 직접 준다.
  Object.defineProperty(host, "clientWidth", { value: 900 });
  Object.defineProperty(host, "clientHeight", { value: 700 });
  const containerRef = createRef<HTMLDivElement>();
  const scrollRef = createRef<HTMLDivElement>();
  (containerRef as { current: HTMLElement | null }).current = host;
  return render(
    withDetailPageHost(
      <EditorAiProvider value={ai}>
        <CanvasSelectionTools
          store={store}
          containerRef={containerRef}
          scrollRef={scrollRef}
        />
      </EditorAiProvider>,
    ),
    { container: host },
  );
}

describe("toolbarPosition", () => {
  it("선택 상자 위에 가운데 정렬로 붙는다", () => {
    const at = toolbarPosition(
      { left: 100, top: 200, right: 300, bottom: 320 },
      { width: 900, height: 700 },
      { width: 160, height: 40 },
    );
    expect(at).toEqual({ left: 120, top: 150 });
  });

  it("위가 좁으면 아래로 뒤집는다", () => {
    const at = toolbarPosition(
      { left: 100, top: 10, right: 300, bottom: 120 },
      { width: 900, height: 700 },
      { width: 160, height: 40 },
    );
    expect(at.top).toBe(130);
  });

  it("작업 영역 밖으로는 안 나간다", () => {
    const at = toolbarPosition(
      { left: 820, top: 300, right: 900, bottom: 400 },
      { width: 900, height: 700 },
      { width: 200, height: 40 },
    );
    expect(at.left).toBe(692);
  });
});

describe("popoverPlacement", () => {
  it("아래가 넉넉하면 아래에 서고, 남은 만큼으로 잘린다", () => {
    expect(popoverPlacement(120, 40, 700)).toEqual({
      side: "below",
      maxHeight: 526,
    });
  });

  // 한 섹션을 통째로 덮는 사진을 고르면 띠가 작업 영역 맨 아래에 붙는다. 그 자리에서
  // 아래로 흘리면 창은 통째로 화면 밖이다 — 이 저장소가 실제로 그랬다.
  it("띠가 바닥에 붙으면 위로 뒤집는다", () => {
    const at = popoverPlacement(652, 40, 700);
    expect(at.side).toBe("above");
    expect(at.maxHeight).toBe(638);
  });

  it("양쪽 다 좁아도 최소 높이는 지킨다 — 넘치는 만큼은 스스로 스크롤한다", () => {
    expect(popoverPlacement(60, 40, 160).maxHeight).toBe(200);
  });
});

describe("CanvasSelectionTools", () => {
  it("사진을 고르면 자르기·프롬프트 편집·더보기가 뜬다", async () => {
    const store = makeStore([imageElement()]);
    renderTools(store);
    await waitFor(() =>
      expect(screen.getByLabelText("detailPage.quickToolbar.crop")).toBeTruthy(),
    );
    expect(screen.getByLabelText("detailPage.quickToolbar.more")).toBeTruthy();
    // 그림 편집은 서버가 아는 문서를 요구하지 않는다 — 그림과 지시가 요청에 다 실려
    // 가고 결과는 브랜드 자산으로 돌아온다. 캐러셀처럼 문서가 없는 편집기의 길이다.
    expect(screen.getByLabelText("detailPage.quickToolbar.promptEdit")).toBeTruthy();
  });

  it("생성 인스턴스가 있으면 프롬프트 편집이 그 자리에서 열린다", async () => {
    const store = makeStore([imageElement({ type: "text", text: "문구" })]);
    renderTools(store, { generatedId: "gen_1" });
    const button = await screen.findByLabelText("detailPage.quickToolbar.promptEdit");

    await userEvent.click(button);
    expect(screen.getByText("detailPage.promptEdit.header")).toBeTruthy();

    // 한 번 더 누르면 닫힌다.
    await userEvent.click(button);
    expect(screen.queryByText("detailPage.promptEdit.header")).toBeNull();
  });

  it("더보기는 우클릭 메뉴와 같은 항목을 낸다", async () => {
    const store = makeStore([imageElement()]);
    renderTools(store);
    await userEvent.click(
      await screen.findByLabelText("detailPage.quickToolbar.more"),
    );
    expect(screen.getByText("detailPage.canvasMenu.duplicate")).toBeTruthy();
    expect(screen.getByText("detailPage.canvasMenu.delete")).toBeTruthy();
  });

  it("자르기를 누르면 자르기 층이 띠를 대신한다", async () => {
    const store = makeStore([imageElement()]);
    const { container } = renderTools(store);
    await userEvent.click(
      await screen.findByLabelText("detailPage.quickToolbar.crop"),
    );

    await waitFor(() =>
      expect(container.querySelector("[data-dp-image-crop]")).toBeTruthy(),
    );
    // 띠는 물러난다 — 자르기 줄이 그 자리에 뜬다.
    expect(screen.queryByLabelText("detailPage.quickToolbar.crop")).toBeNull();
    expect(screen.getByText("detailPage.crop.title")).toBeTruthy();
  });
});
