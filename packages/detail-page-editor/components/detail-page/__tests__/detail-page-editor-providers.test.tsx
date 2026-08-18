import { screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 편집기가 **자기가 필요한 프로바이더를 스스로 깐다**.
 *
 * 예전에는 안 깔았다. AI 생성 패널이 Radix 툴팁을 쓰는데 프로바이더는 첫 소비자
 * (leviosa-frontend)의 앱 레이아웃에 전역으로 하나 있었고, 그래서 우연히 서 있었다.
 * 그것이 없는 두 번째 소비자(leviosa-agency)에서는 편집기가 뜨는 순간
 * `Tooltip must be used within TooltipProvider` 로 화면이 통째로 죽었다.
 *
 * 슬롯에 툴팁을 하나 꽂아 재는 이유: 프로바이더가 있는지를 직접 물어볼 방법이 없다.
 * 없으면 Radix 가 **던진다** — 그 사실 자체가 검사다.
 */

vi.mock("@leviosa-ai/canvas", () => ({
  SidePanel: () => <div />,
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
  DetailPageProperties: () => <div />,
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
import { Tooltip, TooltipTrigger } from "../../ui/tooltip";
import { renderWithDetailPageHost } from "./host-stub";

const DOCUMENT = {
  id: "doc-1",
  template_id: "tpl-1",
  canvas: { width: 860, height: 1200 },
  canvas_json: { width: 860, height: 1200, pages: [], fonts: [] },
  slot_bindings: {},
} as never;

beforeAll(() => {
  if (!("fonts" in document)) {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
  }
});

/** 편집기 안에 사는 툴팁 한 개. 프로바이더가 없으면 렌더에서 던진다. */
function TooltipInside() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button">툴팁 있는 버튼</button>
      </TooltipTrigger>
    </Tooltip>
  );
}

describe("툴팁 프로바이더", () => {
  it("앱이 안 깔아도 편집기 안에서 툴팁이 선다", () => {
    expect(() =>
      renderWithDetailPageHost(
        <DetailPageEditor
          initialDocument={DOCUMENT}
          productName="세럼"
          onSave={() => Promise.resolve()}
        />,
        { slots: { EditorInspector: () => <TooltipInside /> } },
      ),
    ).not.toThrow();

    expect(screen.getByRole("button", { name: "툴팁 있는 버튼" })).toBeTruthy();
  });
});
