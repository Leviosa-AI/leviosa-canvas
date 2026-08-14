import { describe, expect, it, vi } from "vitest";

import { measureDocumentDom } from "../src";

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return new DOMRect(x, y, width, height);
}

describe("dpnext DOM renderer measurement", () => {
  it("returns section-relative boxes and computed typography with stable node ids", () => {
    document.body.innerHTML = `
      <main data-dpnext-document-id="dpnd_measure" data-dpnext-revision="3">
        <section data-dpnext-node-id="sec_hero" data-dpnext-node-type="section">
          <div data-dpnext-node-id="txt_title" data-dpnext-node-type="text">헤드라인</div>
        </section>
      </main>`;
    const root = document.querySelector<HTMLElement>("main")!;
    const section = document.querySelector<HTMLElement>("section")!;
    const text = document.querySelector<HTMLElement>('[data-dpnext-node-type="text"]')!;
    root.getBoundingClientRect = () => rect(10, 20, 750, 1200);
    section.getBoundingClientRect = () => rect(10, 120, 750, 500);
    text.getBoundingClientRect = () => rect(50, 170, 600, 80);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      fontFamily: "Pretendard",
      fontSize: "48px",
      fontWeight: "800",
      lineHeight: "62px",
      color: "rgb(17, 17, 17)",
    } as CSSStyleDeclaration);

    const measured = measureDocumentDom(root, 2);

    expect(measured.schemaVersion).toBe("dpnext-dom-measurement-v1");
    expect(measured.documentRect).toEqual({ x: 0, y: 0, width: 750, height: 1200 });
    expect(measured.sections[0]).toEqual({
      sectionId: "sec_hero",
      rect: { x: 0, y: 100, width: 750, height: 500 },
      textNodeIds: ["txt_title"],
    });
    expect(measured.textNodes[0]).toMatchObject({
      nodeId: "txt_title",
      sectionId: "sec_hero",
      fontSize: 48,
      lineHeight: 62,
      color: "rgb(17, 17, 17)",
    });
  });
});
