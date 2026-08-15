import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransformOverlay } from "../src";

describe("dpnext pointer transform overlay", () => {
  it("emits zoom-aware move and resize patches from pointer gestures", () => {
    const move = vi.fn();
    const resize = vi.fn();
    HTMLElement.prototype.setPointerCapture ??= () => {};
    HTMLElement.prototype.releasePointerCapture ??= () => {};

    render(
      <TransformOverlay
        rect={{ left: 10, top: 20, width: 100, height: 80 }}
        zoom={2}
        onMove={move}
        onResize={resize}
      />,
    );

    const frame = screen.getByRole("button", { name: "선택 레이어 이동" });
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 20, clientY: 30 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 40, clientY: 50 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 40, clientY: 50 });
    expect(move).toHaveBeenCalledWith(10, 10);

    const handle = screen.getByRole("button", { name: "선택 레이어 크기 조절" });
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 30, clientY: 20 });
    fireEvent.pointerUp(handle, { pointerId: 2, clientX: 30, clientY: 20 });
    expect(resize).toHaveBeenCalledWith(115, 90);
  });
});
