import { describe, expect, it } from "vitest";

import {
  applyCurrentColor,
  effectiveColor,
  extractSvgColors,
} from "../svg-colors";

describe("extractSvgColors", () => {
  it("속성에 달린 색을 등장 순서대로 뽑는다", () => {
    const markup = `<svg><rect fill="#ff0000"/><circle stroke="#00ff00"/></svg>`;
    expect(extractSvgColors(markup)).toEqual(["#ff0000", "#00ff00"]);
  });

  it("표기가 달라도 같은 색이면 하나로 본다", () => {
    const markup = `<svg><a fill="#f00"/><b fill="#FF0000"/><c fill="rgb(255,0,0)"/></svg>`;
    expect(extractSvgColors(markup)).toEqual(["#ff0000"]);
  });

  it("style 안에 있는 것도 본다", () => {
    const markup = `<svg><path style="fill:#123456;stroke:#654321"/></svg>`;
    expect(extractSvgColors(markup)).toEqual(["#123456", "#654321"]);
  });

  it("색이 아닌 값은 스와치로 내지 않는다", () => {
    const markup =
      `<svg><a fill="none"/><b stroke="transparent"/><c fill="url(#grad)"/><d fill="#abcdef"/></svg>`;
    expect(extractSvgColors(markup)).toEqual(["#abcdef"]);
  });

  it("currentColor 는 색으로 센다 — 삽입 때 구체 색이 된다", () => {
    const markup = `<svg><path stroke="currentColor"/></svg>`;
    expect(extractSvgColors(markup)).toEqual(["currentcolor"]);
  });

  it("색이 없거나 빈 마크업이면 빈 배열", () => {
    expect(extractSvgColors("")).toEqual([]);
    expect(extractSvgColors("<svg><path d='M0 0'/></svg>")).toEqual([]);
  });

  it("실제 아이콘 마크업에서 색 하나를 본다", () => {
    // 제공처 실측 body(Lucide truck).
    const markup =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<g fill="none" stroke="currentColor" stroke-width="2">` +
      `<path d="M14 18V6a2 2 0 0 0-2-2H4"/><circle cx="17" cy="18" r="2"/></g></svg>`;
    expect(extractSvgColors(markup)).toEqual(["currentcolor"]);
  });
});

describe("applyCurrentColor", () => {
  it("모노크롬 세트의 currentColor 를 구체 색으로 박는다", () => {
    const markup = `<svg><g stroke="currentColor" fill="currentColor"/></svg>`;
    expect(applyCurrentColor(markup, "#0055ff")).toBe(
      `<svg><g stroke="#0055ff" fill="#0055ff"/></svg>`,
    );
  });

  it("대소문자를 가리지 않는다", () => {
    expect(applyCurrentColor(`<a fill="currentcolor"/>`, "#111")).toBe(
      `<a fill="#111"/>`,
    );
  });

  it("currentColor 가 없으면 그대로 둔다", () => {
    const markup = `<svg><path fill="#123456"/></svg>`;
    expect(applyCurrentColor(markup, "#000")).toBe(markup);
  });
});

describe("effectiveColor", () => {
  it("치환된 값이 있으면 그것을 보여 준다", () => {
    const replaced = new Map([["#ff0000", "#0000ff"]]);
    expect(effectiveColor("#f00", replaced)).toBe("#0000ff");
  });

  it("없으면 원래 색을 보여 준다", () => {
    expect(effectiveColor("#ff0000", new Map())).toBe("#ff0000");
  });
});
