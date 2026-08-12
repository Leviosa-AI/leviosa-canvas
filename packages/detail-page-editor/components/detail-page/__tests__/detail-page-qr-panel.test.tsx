import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockInsert = vi.fn();
const mockRemember = vi.fn();

vi.mock("../../../lib/detail-page/insert-shape", () => ({
  insertShape: (...args: unknown[]) => mockInsert(...args),
}));
vi.mock("../../../lib/detail-page/element-recents", () => ({
  rememberElement: (...args: unknown[]) => mockRemember(...args),
}));

import { DetailPageQrPanel } from "../detail-page-qr-panel";

const STORE = { pages: [] };

const input = () => screen.getByRole("textbox");
const insertButton = () =>
  screen.getByRole("button", { name: "detailPage.qr.insert" });

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("DetailPageQrPanel", () => {
  it("내용이 비면 넣을 수 없다", () => {
    render(<DetailPageQrPanel store={STORE} />);

    expect(insertButton()).toBeDisabled();
    expect(screen.getByText("detailPage.qr.previewEmpty")).toBeInTheDocument();
  });

  it("링크를 넣으면 미리보기가 서고 캔버스에 넣을 수 있다", async () => {
    const user = userEvent.setup();
    render(<DetailPageQrPanel store={STORE} />);

    await user.type(input(), "https://leviosa.ai");
    expect(insertButton()).toBeEnabled();

    await user.click(insertButton());

    expect(mockInsert).toHaveBeenCalledOnce();
    const [store, markup, viewBox] = mockInsert.mock.calls[0];
    expect(store).toBe(STORE);
    expect(markup).toContain("<svg");
    expect(viewBox).toMatch(/^0 0 \d+ \d+$/);
  });

  it("미리보기와 실제 삽입이 같은 마크업이다", async () => {
    const user = userEvent.setup();
    render(<DetailPageQrPanel store={STORE} />);

    await user.type(input(), "https://leviosa.ai");
    const preview = screen.getByRole("img", { name: "detailPage.qr.previewAlt" });
    const previewMarkup = atob(
      (preview.getAttribute("src") ?? "").split(",")[1] ?? "",
    );

    await user.click(insertButton());
    expect(mockInsert.mock.calls[0][1]).toBe(previewMarkup);
  });

  it("최근 목록에 남긴다", async () => {
    const user = userEvent.setup();
    render(<DetailPageQrPanel store={STORE} />);

    await user.type(input(), "https://leviosa.ai");
    await user.click(insertButton());

    expect(mockRemember).toHaveBeenCalledWith(
      expect.objectContaining({ key: "qr:https://leviosa.ai" }),
    );
  });

  it("바코드로 바꾸면 12자리에 검증번호를 채워 보여 준다", async () => {
    const user = userEvent.setup();
    render(<DetailPageQrPanel store={STORE} />);

    await user.click(screen.getByRole("button", { name: "detailPage.qr.kindEan" }));
    await user.type(input(), "400638133393");

    expect(screen.getByText("4006381333931")).toBeInTheDocument();
    expect(insertButton()).toBeEnabled();
  });

  it("검증번호가 틀린 바코드는 막고 이유를 말한다", async () => {
    const user = userEvent.setup();
    render(<DetailPageQrPanel store={STORE} />);

    await user.click(screen.getByRole("button", { name: "detailPage.qr.kindEan" }));
    await user.type(input(), "4006381333932");

    expect(screen.getByText("detailPage.qr.eanInvalid")).toBeInTheDocument();
    expect(insertButton()).toBeDisabled();
  });

  it("고른 색이 코드 마크업에 그대로 박힌다 — 우측 색 컨트롤이 잡을 수 있게", async () => {
    const user = userEvent.setup();
    render(<DetailPageQrPanel store={STORE} />);

    await user.type(input(), "x");
    await user.click(insertButton());

    const markup = mockInsert.mock.calls[0][1] as string;
    expect(markup).toContain('fill="#111111"');
    expect(markup).toContain('fill="#ffffff"');
    expect(markup).not.toContain("currentColor");
  });
});
