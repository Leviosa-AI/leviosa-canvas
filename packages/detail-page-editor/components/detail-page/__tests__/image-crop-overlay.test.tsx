import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ImageCropOverlay } from "../image-crop-overlay";

/**
 * 자르기 층.
 *
 * 셈은 `lib/detail-page/image-crop` 이 다 재므로 여기서는 **손짓이 문서에 닿는 길**만
 * 본다: 적용해야 값이 적히고, 취소하면 한 글자도 안 적힌다.
 */

vi.mock("../element-rects", async () => {
  const actual = await vi.importActual<typeof import("../element-rects")>(
    "../element-rects",
  );
  return {
    ...actual,
    elementScreenBox: () => ({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      scale: 1,
      rotation: 0,
    }),
  };
});

vi.mock("@leviosa-ai/canvas/render/image-cache", () => ({
  loadImage: async () => ({ naturalWidth: 400, naturalHeight: 200 }),
}));

function renderOverlay() {
  const el = {
    id: "img1",
    type: "image",
    src: "https://s3/a.png",
    x: 10,
    y: 20,
    width: 200,
    height: 200,
    set: vi.fn(),
  };
  const onClose = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const containerRef = createRef<HTMLDivElement>();
  (containerRef as { current: HTMLElement | null }).current = host;
  const view = render(
    <ImageCropOverlay el={el} containerRef={containerRef} onClose={onClose} />,
    { container: host },
  );
  return { el, onClose, ...view };
}

describe("ImageCropOverlay", () => {
  it("적용하면 자른 자리를 비율로 적고 상자를 그 자리로 옮긴다", async () => {
    const { el, onClose } = renderOverlay();
    const apply = await screen.findByLabelText("detailPage.crop.apply");

    await userEvent.click(apply);

    // 처음 상태는 "지금 보이는 자리" 그대로다 — 열자마자 적용해도 그림이 안 변한다.
    expect(el.set).toHaveBeenCalledTimes(1);
    const patch = el.set.mock.calls[0][0] as Record<string, number>;
    expect(patch).toMatchObject({ x: 10, y: 20, width: 200, height: 200 });
    expect(patch.cropWidth).toBeCloseTo(0.5, 5);
    expect(patch.cropHeight).toBeCloseTo(1, 5);
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("취소는 문서를 안 건드린다", async () => {
    const { el, onClose } = renderOverlay();
    await userEvent.click(await screen.findByText("detailPage.crop.cancel"));
    expect(el.set).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("Esc 로도 나간다", async () => {
    const { el, onClose } = renderOverlay();
    await screen.findByLabelText("detailPage.crop.apply");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(el.set).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("비율을 고르면 그 비율로 잘린다", async () => {
    const { el } = renderOverlay();
    await userEvent.click(await screen.findByLabelText("detailPage.crop.ratio"));
    await userEvent.click(screen.getByText("detailPage.crop.presets.square"));
    await userEvent.click(screen.getByLabelText("detailPage.crop.apply"));

    const patch = el.set.mock.calls[0][0] as Record<string, number>;
    expect(patch.width).toBe(patch.height);
  });

  it("원본 전체로 되돌리면 사진을 다 쓴다", async () => {
    const { el } = renderOverlay();
    await userEvent.click(await screen.findByLabelText("detailPage.crop.reset"));
    await userEvent.click(screen.getByLabelText("detailPage.crop.apply"));

    const patch = el.set.mock.calls[0][0] as Record<string, number>;
    expect(patch.cropWidth).toBeCloseTo(1, 5);
    expect(patch.cropHeight).toBeCloseTo(1, 5);
    // 400×200 원본을 다 쓰면 상자도 그 비율이 된다.
    expect(patch.width / patch.height).toBeCloseTo(2, 5);
  });

  it("확대 슬라이더는 가운데를 지키며 좁힌다", async () => {
    const { el } = renderOverlay();
    const zoom = await screen.findByLabelText("detailPage.crop.zoom");
    fireEvent.change(zoom, { target: { value: "2" } });
    await userEvent.click(screen.getByLabelText("detailPage.crop.apply"));

    const patch = el.set.mock.calls[0][0] as Record<string, number>;
    expect(patch.width).toBe(100);
    expect(patch.height).toBe(100);
  });

  it("자르는 동안 바깥을 누르면 적용하고 나간다", async () => {
    const { el, onClose, container } = renderOverlay();
    await screen.findByLabelText("detailPage.crop.apply");
    const backdrop = container.querySelector("[data-dp-crop-backdrop]")!;
    fireEvent.pointerDown(backdrop);

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
    expect(el.set).toHaveBeenCalledTimes(1);
  });
});
