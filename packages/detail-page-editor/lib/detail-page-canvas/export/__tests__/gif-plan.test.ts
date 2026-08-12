import { describe, expect, it } from "vitest";

import type { ExportDocument } from "../document-model";
import { detectGifPages, isGifSrc, planGifExport } from "../gif-plan";

describe("isGifSrc", () => {
  it("matches .gif urls including presigned query strings", () => {
    expect(isGifSrc("https://s3/x/y.gif")).toBe(true);
    expect(isGifSrc("https://s3/x/y.GIF?X-Amz-Signature=abc")).toBe(true);
    expect(isGifSrc("https://s3/x/y.gif#frag")).toBe(true);
    expect(isGifSrc("data:image/gif;base64,AAAA")).toBe(true);
  });

  it("rejects non-gif sources", () => {
    expect(isGifSrc("https://s3/x/y.png")).toBe(false);
    expect(isGifSrc("x.gifsomething.jpg")).toBe(false);
    expect(isGifSrc("")).toBe(false);
    expect(isGifSrc(undefined)).toBe(false);
  });
});

describe("planGifExport", () => {
  it("slices the worked example (16 sections, gifs at 4,8,10)", () => {
    const isGif = Array.from({ length: 16 }, (_, i) => i === 3 || i === 7 || i === 9);
    const labels = planGifExport(isGif).map((u) =>
      u.kind === "gif" ? `${u.label}.gif` : `${u.label}.png`,
    );
    // 1..16 → padded to width 2 for stable filesystem ordering.
    expect(labels).toEqual([
      "01-03.png",
      "04.gif",
      "05-07.png",
      "08.gif",
      "09.png",
      "10.gif",
      "11-16.png",
    ]);
  });

  it("single still page uses a bare number, no range", () => {
    const units = planGifExport([false, true, false]);
    expect(units).toEqual([
      { kind: "png", pages: [0], label: "1" },
      { kind: "gif", page: 1, label: "2" },
      { kind: "png", pages: [2], label: "3" },
    ]);
  });

  it("all stills collapse into one stacked run", () => {
    expect(planGifExport([false, false, false])).toEqual([
      { kind: "png", pages: [0, 1, 2], label: "1-3" },
    ]);
  });

  it("adjacent gifs each stand alone", () => {
    const units = planGifExport([true, true]);
    expect(units).toEqual([
      { kind: "gif", page: 0, label: "1" },
      { kind: "gif", page: 1, label: "2" },
    ]);
  });
});

describe("detectGifPages", () => {
  const doc: ExportDocument = {
    pages: [
      { id: "a", children: [{ type: "text", text: "hi" }] },
      { id: "b", children: [{ type: "image", src: "https://s3/anim.gif?sig=1" }] },
      {
        id: "c",
        children: [{ type: "group", children: [{ type: "image", src: "https://s3/still.png" }] }],
      },
      {
        id: "d",
        children: [{ type: "image", src: "x.png", custom: { detailPageGif: true } }],
      },
    ],
  };

  it("flags pages whose (possibly nested) children contain a gif or gif tag", () => {
    expect(detectGifPages(doc)).toEqual([false, true, false, true]);
  });

  it("honors pageIds order and selection", () => {
    expect(detectGifPages(doc, ["d", "a", "b"])).toEqual([true, false, true]);
  });
});
