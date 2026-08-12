import { describe, expect, it } from "vitest";

import {
  buildGifTimeline,
  GIF_MAX_FRAMES,
  GIF_MAX_LOOP_MS,
} from "../gif-timeline";

describe("buildGifTimeline", () => {
  it("samples a single source at the fps cap", () => {
    const t = buildGifTimeline([1000], { maxFps: 12, maxFrames: 40 });
    expect(t.loopMs).toBe(1000);
    expect(t.times).toHaveLength(12);
    expect(t.fps).toBeCloseTo(12, 5);
    expect(t.frameDelayMs).toBeCloseTo(1000 / 12, 5);
    expect(t.times[0]).toBe(0);
  });

  it("takes the LCM of mismatched sources so every loop aligns", () => {
    // 400ms and 600ms → LCM 1200ms.
    const t = buildGifTimeline([400, 600], { maxFps: 10, maxFrames: 40 });
    expect(t.loopMs).toBe(1200);
    expect(t.times).toHaveLength(12); // 1.2s * 10fps
  });

  it("reduces fps instead of exceeding the frame cap", () => {
    const t = buildGifTimeline([10_000], { maxFps: 12, maxFrames: 40, maxLoopMs: 10_000 });
    expect(t.times.length).toBeLessThanOrEqual(40);
    expect(t.times).toHaveLength(40);
    // Loop still fully covered — last sample < loop, spacing = loop / count.
    expect(t.frameDelayMs).toBeCloseTo(10_000 / 40, 5);
    expect(t.fps).toBeLessThan(12);
  });

  it("clamps a runaway LCM to the loop cap", () => {
    const t = buildGifTimeline([7, 11, 13, 17], { maxFps: 12 });
    expect(t.loopMs).toBeLessThanOrEqual(GIF_MAX_LOOP_MS);
    expect(t.times.length).toBeLessThanOrEqual(GIF_MAX_FRAMES);
  });

  it("degrades to a single frame when no valid duration", () => {
    const t = buildGifTimeline([0, NaN]);
    expect(t.times).toEqual([0]);
  });
});
