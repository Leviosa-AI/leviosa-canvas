import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiGeneratePanel } from "../ai-generate-panel";
import { TooltipProvider } from "../../ui/tooltip";
import { withDetailPageHost } from "./host-stub";

/**
 * 그림으로 지시하기 진입점(우측 선택 이미지 편집).
 *
 * 지켜야 할 주장 넷.
 *
 * 1. **밑그림이 없으면 진입점도 없다.** 좌측 자유 생성에는 가리킬 그림이 없다.
 * 2. **GIF 모드에서는 숨는다.** 그 이미지가 첫 프레임으로 그대로 쓰이므로 마킹이
 *    결과에 남는다.
 * 3. **그릴 수 없는 이미지면 열지 않는다.** 교차 출처면 합성이 SecurityError 로
 *    터지는데, 그 실패는 유저가 다 그리고 제출을 누른 다음에야 드러난다.
 * 4. **마킹본은 원본과 함께 생성기로 간다.**
 */

const render = (ui: ReactElement) =>
  rtlRender(withDetailPageHost(<TooltipProvider>{ui}</TooltipProvider>));

const store = { pages: [], activePage: undefined };

vi.mock("../../../lib/detail-page/image-data-uri", () => ({
  toDrawableDataUri: vi.fn(),
}));

import { toDrawableDataUri } from "../../../lib/detail-page/image-data-uri";

const mockedResolve = vi.mocked(toDrawableDataUri);

beforeEach(() => {
  vi.clearAllMocks();
  mockedResolve.mockResolvedValue("data:image/png;base64,BASE");
});

const OPEN = "detailPage.annotate.open";

describe("그림으로 지시 진입점", () => {
  it("밑그림이 없으면 뜨지 않는다", () => {
    render(<AiGeneratePanel store={store} onGenerate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: OPEN })).toBeNull();
  });

  it("선택 이미지가 있으면 뜬다", () => {
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={vi.fn()}
        hasImplicitReference
        implicitReferenceSrc="https://cdn/x.png"
        annotateBaseSrc="https://cdn/x.png"
      />,
    );
    expect(screen.getByRole("button", { name: OPEN })).toBeTruthy();
  });

  it("GIF 모드에서는 숨는다", () => {
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={vi.fn()}
        onGenerateGif={vi.fn()}
        initialMode="gif"
        hasImplicitReference
        implicitReferenceSrc="https://cdn/x.png"
        annotateBaseSrc="https://cdn/x.png"
      />,
    );
    expect(screen.queryByRole("button", { name: OPEN })).toBeNull();
  });

  it("그릴 수 없는 이미지면 캔버스를 열지 않고 이유를 말한다", async () => {
    mockedResolve.mockResolvedValue(null);
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={vi.fn()}
        hasImplicitReference
        implicitReferenceSrc="https://cdn/x.png"
        annotateBaseSrc="https://cdn/x.png"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: OPEN }));
    expect(
      await screen.findByText("detailPage.annotate.baseUnavailable"),
    ).toBeTruthy();
    expect(
      screen.queryByPlaceholderText("detailPage.annotate.placeholder"),
    ).toBeNull();
  });

  it("표시한 마킹본과 글을 생성기로 함께 보낸다", async () => {
    const onGenerate = vi.fn(async () => ["https://s3/new.png"]);
    const onResult = vi.fn();
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={onGenerate}
        onResult={onResult}
        hasImplicitReference
        implicitReferenceSrc="https://cdn/x.png"
        annotateBaseSrc="https://cdn/x.png"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: OPEN }));
    await userEvent.type(
      await screen.findByPlaceholderText("detailPage.annotate.placeholder"),
      "여기만 비워 주세요",
    );
    // 패널의 생성 버튼과 모달의 제출 버튼은 라벨이 같다 — 모달 안에서 고른다.
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "detailPage.aiGenerate.replaceImage",
      }),
    );

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "여기만 비워 주세요" }),
    );
    expect(onResult).toHaveBeenCalledWith("https://s3/new.png");
  });
});
