import { describe, expect, it } from "vitest";

import { replaceCanvasPage } from "../replace-page";

/**
 * 재저작한 화면 하나를 문서에 갈아 끼우는 규칙.
 *
 * 지켜야 할 주장 셋: 자리를 지킨다, 남의 화면은 손대지 않는다, 못 찾으면 아무것도
 * 하지 않는다(조용히 덧붙이면 고쳐진 화면과 안 고쳐진 화면이 나란히 남는다).
 */

const DOC = {
  width: 750,
  pages: [
    { id: "brand-open", children: [{ id: "a" }] },
    { id: "point-1", children: [{ id: "b" }] },
    { id: "closing", children: [{ id: "c" }] },
  ],
};

describe("replaceCanvasPage", () => {
  it("keeps the rebuilt section in its original position", () => {
    const next = replaceCanvasPage(DOC, { id: "point-1", children: [{ id: "z" }] });
    expect(next.pages?.map((p) => p.id)).toEqual([
      "brand-open",
      "point-1",
      "closing",
    ]);
    expect(next.pages?.[1]).toEqual({ id: "point-1", children: [{ id: "z" }] });
  });

  it("leaves the other sections byte-identical", () => {
    const next = replaceCanvasPage(DOC, { id: "point-1", children: [] });
    expect(next.pages?.[0]).toBe(DOC.pages[0]);
    expect(next.pages?.[2]).toBe(DOC.pages[2]);
  });

  it("does not mutate the document it was given", () => {
    replaceCanvasPage(DOC, { id: "point-1", children: [] });
    expect(DOC.pages[1]).toEqual({ id: "point-1", children: [{ id: "b" }] });
  });

  it("returns the document untouched when the id is unknown", () => {
    // 덧붙이면 안 된다 — 고쳐진 화면과 안 고쳐진 화면이 나란히 남는다.
    expect(replaceCanvasPage(DOC, { id: "nope", children: [] })).toBe(DOC);
  });

  it("keeps other document keys", () => {
    const next = replaceCanvasPage(DOC, { id: "closing", children: [] });
    expect(next.width).toBe(750);
  });
});
