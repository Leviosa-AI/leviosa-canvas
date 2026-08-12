import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { BubbleTailOverlay } from "../bubble-tail-overlay";
import type { BubbleParams } from "../../../lib/detail-page-canvas/bubble-path";

/**
 * ``selectedElementsDeep`` builds a NEW array on every render. Putting that array
 * in the effect's dependency list ran the effect on every render, and the effect's
 * ``setHandles(next)`` (also a new array) triggered the next render — an infinite
 * loop that React kills with "Maximum update depth exceeded", taking the whole
 * editor canvas down with it.
 */

const PARAMS: BubbleParams = {
  w: 200,
  h: 100,
  r: 24,
  pad: 20,
  fill: "#FCF5EC",
  stroke: "#F0955A",
  strokeWidth: 4,
  tip: [212, 99],
  base: [26, 26],
  notch: 9,
};

function makeStore() {
  const bubble = {
    id: "b1",
    type: "svg",
    x: 10,
    y: 20,
    width: PARAMS.w + 2 * PARAMS.pad,
    height: PARAMS.h + 2 * PARAMS.pad,
    src: "data:image/svg+xml;base64,OLD",
    custom: { bubble: PARAMS },
    set: vi.fn(),
  };
  return {
    bubble,
    store: {
      selectedElements: [bubble],
      selectedElementsIds: ["b1"],
      getElementById: (id: string) => (id === "b1" ? bubble : undefined),
      scale: 1,
    },
  };
}

describe("BubbleTailOverlay — 렌더 루프", () => {
  it("선택된 말풍선이 있어도 무한 리렌더에 빠지지 않는다", () => {
    const { store } = makeStore();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const containerRef = createRef<HTMLElement>() as { current: HTMLElement | null };
    containerRef.current = host;

    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a));

    // 루프가 있으면 React가 "Maximum update depth exceeded"로 여기서 터진다.
    expect(() => render(<BubbleTailOverlay store={store} containerRef={containerRef} />)).not.toThrow();

    spy.mockRestore();
    expect(
      errors.filter((e) => String(e).includes("Maximum update depth exceeded")),
    ).toEqual([]);
  });
});
