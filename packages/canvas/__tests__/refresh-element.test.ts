import { describe, expect, it } from "vitest";

import { CanvasStore } from "../store";

/**
 * 끌기를 무를 때 쓰는 자리. 문서는 그대로 두고 화면만 문서에 맞춘다 —
 * 히스토리에 남으면 ⌘Z 한 번이 «아무것도 안 한 걸음»을 지우는 데 쓰인다.
 */
describe("refreshElement", () => {
  const store = () =>
    new CanvasStore({
      pages: [{ id: "p", children: [{ id: "e", type: "text", text: "x" }] }],
    });

  it("요소를 다시 그리게 하고 문서는 안 바꾼다", () => {
    const s = store();
    const before = JSON.stringify(s.toJSON());
    const version = s.getElementById("e")!.version;

    s.refreshElement("e");

    expect(s.getElementById("e")!.version).toBe(version + 1);
    expect(JSON.stringify(s.toJSON())).toBe(before);
  });

  it("되돌릴 걸음을 만들지 않는다", () => {
    const s = store();
    s.refreshElement("e");
    expect(s.history.canUndo).toBe(false);
  });

  it("없는 요소는 조용히 넘어간다", () => {
    const s = store();
    expect(() => s.refreshElement("nope")).not.toThrow();
  });
});
