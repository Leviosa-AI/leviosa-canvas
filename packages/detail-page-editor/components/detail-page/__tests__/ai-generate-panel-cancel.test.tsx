// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiGeneratePanel, type GenerateImageInput } from "../ai-generate-panel";
import { TooltipProvider } from "../../ui/tooltip";
import { withDetailPageHost } from "./host-stub";

const SHORTFALL = { status: 402 };

const render = (ui: ReactElement) =>
  rtlRender(
    withDetailPageHost(<TooltipProvider>{ui}</TooltipProvider>, {
      brand: { getStoredActiveBrandId: () => null },
      api: {
        asInsufficientCreditsError: (err: unknown) =>
          err === SHORTFALL ? ({ message: "short" } as never) : null,
      },
    }),
  );

const store = { pages: [], activePage: undefined };

async function generate() {
  await userEvent.type(
    screen.getByPlaceholderText("detailPage.aiGenerate.promptPlaceholder"),
    "고양이",
  );
  await userEvent.click(
    screen.getByRole("button", { name: /detailPage\.aiGenerate\.(generate|replaceImage)/ }),
  );
}

describe("AiGeneratePanel 취소·오류", () => {
  it("취소하면 생성기에 넘긴 signal 이 끊기고 늦게 온 결과는 넣지 않는다", async () => {
    let seen: GenerateImageInput | undefined;
    let finish: (urls: string[]) => void = () => {};
    const onGenerate = vi.fn(
      (input: GenerateImageInput) =>
        new Promise<string[]>((resolve) => {
          seen = input;
          finish = resolve;
        }),
    );
    const onResult = vi.fn();
    render(<AiGeneratePanel store={store} onGenerate={onGenerate} onResult={onResult} />);

    await generate();
    expect(seen?.signal?.aborted).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "detailPage.aiGenerate.cancel" }));
    expect(seen?.signal?.aborted).toBe(true);
    expect(screen.queryByRole("button", { name: "detailPage.aiGenerate.cancel" })).toBeNull();

    finish(["https://s3/late.jpg"]);
    await new Promise((r) => setTimeout(r, 0));
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.queryByText("detailPage.aiGenerate.generateFailed")).toBeNull();
  });

  it("호스트 판별기가 크레딧 부족이라 하면 부족 안내를 띄운다", async () => {
    const onGenerate = vi.fn(async () => {
      throw SHORTFALL;
    });
    render(<AiGeneratePanel store={store} onGenerate={onGenerate} creditCost={1} creditBalance={100} />);

    await generate();
    expect(
      await screen.findByText("detailPage.aiGenerate.insufficientCredits"),
    ).toBeInTheDocument();
  });

  it("그 밖의 실패는 원문 대신 번역 문구를 띄우고 원문은 콘솔로 보낸다", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onGenerate = vi.fn(async () => {
      throw new Error("Internal Server Error: upstream 500");
    });
    render(<AiGeneratePanel store={store} onGenerate={onGenerate} />);

    await generate();
    await waitFor(() =>
      expect(screen.getByText("detailPage.aiGenerate.generateFailed")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/upstream 500/)).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
