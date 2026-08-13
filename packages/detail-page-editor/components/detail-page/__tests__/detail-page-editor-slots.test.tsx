import { screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 영역 슬롯 — 헤더 · 좌측 껍데기 · 인스펙터.
 *
 * 색과 모서리는 토큰이 맡지만, "무엇이 어디에 놓이는가" 는 토큰이 못 바꾼다. 소비자
 * 앱의 디자인 언어가 우리와 다를 때 필요한 것은 그쪽이다. 여기서 재는 것은 하나다 —
 * **슬롯을 꽂으면 기본 것이 사라지고 꽂은 것이 그 자리에 선다**. 기본 것이 같이 남으면
 * 헤더가 두 개인 화면이 된다.
 *
 * 캔버스·인스펙터 같은 무거운 자식은 대역으로 세운다. 여기서 재려는 것은 자리 배치지
 * 그 안의 그림이 아니다.
 */

vi.mock("@leviosa-ai/canvas", () => ({
  SidePanel: () => <div data-testid="default-sidebar" />,
  ZoomButtons: () => <div />,
  SectionTab: () => <button type="button" />,
  configureCanvas: () => {},
}));
vi.mock("../leviosa-canvas-workspace", () => ({
  LeviosaCanvasWorkspace: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("../detail-page-properties-panel", () => ({
  DetailPageProperties: () => <div data-testid="default-inspector" />,
}));
vi.mock("../detail-page-pages-timeline", () => ({
  DetailPagePagesTimeline: () => <div />,
}));
vi.mock("../detail-page-download-dialog", () => ({
  DetailPageDownloadDialog: () => <button type="button">내보내기</button>,
}));
vi.mock("../detail-page-history-buttons", () => ({
  DetailPageHistoryButtons: () => <button type="button">되돌리기</button>,
}));
vi.mock("../find-replace-panel", () => ({ FindReplacePanel: () => <div /> }));
vi.mock("../editor-hotkeys", () => ({ EditorHotkeys: () => <div /> }));
vi.mock("../section-reauthor-controller", () => ({
  SectionReauthorController: () => <div />,
}));
vi.mock("../../../lib/detail-page-canvas/editor-fonts", () => ({
  loadEditorFont: () => Promise.resolve(),
}));

import { DetailPageEditor } from "../detail-page-editor";
import type { DetailPageHostSlots } from "../detail-page-host-context";
import { renderWithDetailPageHost } from "./host-stub";

const DOCUMENT = {
  id: "doc-1",
  template_id: "tpl-1",
  canvas: { width: 860, height: 1200 },
  canvas_json: { width: 860, height: 1200, pages: [], fonts: [] },
  slot_bindings: {},
} as never;

// 편집기는 글꼴이 다 실린 뒤 줄맞춤을 다시 잰다. jsdom 에는 `document.fonts` 가 없어서
// 그 약속이 거절로 새고, 테스트는 통과하면서 오류만 쌓인다.
beforeAll(() => {
  if (!("fonts" in document)) {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
  }
});

function renderEditor(slots: DetailPageHostSlots) {
  return renderWithDetailPageHost(
    <DetailPageEditor
      initialDocument={DOCUMENT}
      productName="세럼"
      onSave={() => Promise.resolve()}
    />,
    { slots },
  );
}

describe("편집기 영역 슬롯", () => {
  it("헤더를 꽂으면 기본 헤더 대신 그것이 선다", () => {
    renderEditor({
      EditorHeader: ({ productName, parts, save }) => (
        <header data-testid="agency-header">
          <span>{productName}</span>
          {parts.history}
          {parts.download}
          <button type="button" onClick={save.run}>
            {save.saving ? "저장 중" : "저장"}
          </button>
        </header>
      ),
    });

    expect(screen.getByTestId("agency-header")).toBeInTheDocument();
    // 이름은 편집기가 채워서 넘긴다 — 앱이 "제목 없음" 규칙을 다시 짤 이유가 없다.
    expect(screen.getByText("세럼")).toBeInTheDocument();
    // 어려운 조각은 만들어서 넘긴다. 이것까지 다시 만들라면 슬롯이 아니라 포크다.
    expect(screen.getByText("되돌리기")).toBeInTheDocument();
    expect(screen.getByText("내보내기")).toBeInTheDocument();
    // 기본 헤더의 저장 버튼(키 문구)은 사라져야 한다 — 남으면 헤더가 둘이다.
    expect(screen.queryByText("editor.save")).not.toBeInTheDocument();
  });

  it("좌측 껍데기를 꽂으면 기본 레일이 사라진다", () => {
    renderEditor({
      EditorSidebar: ({ sections }) => (
        <nav data-testid="agency-rail">{sections.length}</nav>
      ),
    });

    expect(screen.getByTestId("agency-rail")).toBeInTheDocument();
    expect(screen.queryByTestId("default-sidebar")).not.toBeInTheDocument();
    // 섹션 목록은 그대로 넘어간다 — 앱은 배치만 다시 짠다.
    expect(Number(screen.getByTestId("agency-rail").textContent)).toBeGreaterThan(0);
  });

  it("인스펙터는 기본 것을 받아 감쌀 수 있다", () => {
    renderEditor({
      EditorInspector: ({ defaultInspector }) => (
        <aside data-testid="agency-inspector">{defaultInspector}</aside>
      ),
    });

    const wrapper = screen.getByTestId("agency-inspector");
    expect(wrapper).toBeInTheDocument();
    // 속을 그대로 쓰는 것이 보통이라, 받은 것을 그리면 기본 인스펙터가 안에 남는다.
    expect(wrapper).toContainElement(screen.getByTestId("default-inspector"));
  });

  it("안 꽂으면 기본 것이 선다", () => {
    renderEditor({});

    expect(screen.getByTestId("default-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("default-inspector")).toBeInTheDocument();
    expect(screen.getByText("editor.save")).toBeInTheDocument();
  });
});
