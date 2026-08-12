import { describe, expect, it } from "vitest";

import { insertShape } from "../insert-shape";
import {
  decodeSvgDataUri,
  encodeSvgDataUri,
} from "../../detail-page-canvas/export/svg";

const SVG = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5z"/></svg>';

type Added = Record<string, unknown>;

function fakeStore() {
  const added: Added[] = [];
  const page = {
    computedWidth: 800,
    computedHeight: 1000,
    addElement: (opts: Added) => added.push(opts),
  };
  return { store: { activePage: page, pages: [page] }, added };
}

describe("encodeSvgDataUri / decodeSvgDataUri", () => {
  it("round-trips vector markup (ASCII path data)", () => {
    const uri = encodeSvgDataUri(SVG);
    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(decodeSvgDataUri(uri)).toBe(SVG);
  });
});

describe("insertShape", () => {
  it("adds an svg element centered with viewBox aspect preserved", () => {
    const { store, added } = fakeStore();
    insertShape(store, SVG, "0 0 24 24");
    expect(added).toHaveLength(1);
    const el = added[0];
    expect(el.type).toBe("svg");
    // 정사각 viewBox → 정사각 크기, 페이지 폭의 18%(=144)로 상한 미만.
    expect(el.width).toBe(144);
    expect(el.height).toBe(144);
    // 가운데 배치.
    expect(el.x).toBe((800 - 144) / 2);
    // src는 디코드 가능한 원본 마크업.
    expect(decodeSvgDataUri(String(el.src))).toBe(SVG);
  });

  it("preserves non-square aspect ratio from viewBox", () => {
    const { store, added } = fakeStore();
    insertShape(store, SVG, "0 0 100 50");
    const el = added[0];
    expect(el.width).toBe(144);
    expect(el.height).toBe(72); // 2:1
  });

  it("caps width at 200px on wide pages", () => {
    const added: Added[] = [];
    const page = {
      computedWidth: 4000,
      computedHeight: 1000,
      addElement: (opts: Added) => added.push(opts),
    };
    insertShape({ activePage: page, pages: [page] }, SVG, "0 0 24 24");
    expect(added[0].width).toBe(200);
  });

  it("no-ops on empty markup or missing page", () => {
    const { store, added } = fakeStore();
    insertShape(store, "", "0 0 24 24");
    insertShape({ pages: [] }, SVG, "0 0 24 24");
    expect(added).toHaveLength(0);
  });
});
