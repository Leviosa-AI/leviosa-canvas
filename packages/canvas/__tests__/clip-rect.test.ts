import { describe, expect, it, vi } from "vitest";

import { readClipRect, roundedRectPath } from "../paint/clip-rect";

describe("readClipRect", () => {
  it("reads a valid clipToRect from an element's custom payload", () => {
    expect(
      readClipRect({
        custom: { clipToRect: { x: 48, y: 345, width: 654, height: 180, radius: 24 } },
      }),
    ).toEqual({ x: 48, y: 345, width: 654, height: 180, radius: 24 });
  });

  it("defaults x/y/radius when omitted", () => {
    expect(readClipRect({ custom: { clipToRect: { width: 100, height: 80 } } })).toEqual(
      { x: 0, y: 0, width: 100, height: 80, radius: 0 },
    );
  });

  it("returns null when clipToRect is missing or zero-sized", () => {
    expect(readClipRect({ custom: {} })).toBeNull();
    expect(readClipRect({})).toBeNull();
    expect(readClipRect(null)).toBeNull();
    expect(
      readClipRect({ custom: { clipToRect: { width: 0, height: 80 } } }),
    ).toBeNull();
  });
});

describe("roundedRectPath", () => {
  it("traces a closed rounded rectangle clamped to half the smallest side", () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
    };

    roundedRectPath(ctx, 10, 20, 200, 100, 999);

    // radius clamped to min(width/2, height/2) = 50.
    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledWith(60, 20); // x + r
    expect(ctx.arcTo).toHaveBeenCalledTimes(4);
    expect(ctx.arcTo).toHaveBeenNthCalledWith(1, 210, 20, 210, 120, 50);
    expect(ctx.closePath).toHaveBeenCalledOnce();
  });
});
