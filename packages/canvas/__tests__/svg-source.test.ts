import { describe, expect, it } from "vitest";

import {
  decodeSvgSrc,
  encodeSvgSrc,
  ensureSvgNamespace,
  normalizeColor,
  readColorReplace,
  replaceSvgColors,
  svgSourceFor,
} from "../render/svg-source";

describe("normalizeColor", () => {
  it("같은 색을 같은 표기로 모은다", () => {
    expect(normalizeColor("#ABC")).toBe("#aabbcc");
    expect(normalizeColor("#AABBCC")).toBe("#aabbcc");
    expect(normalizeColor("rgb(170, 187, 204)")).toBe("#aabbcc");
    expect(normalizeColor("rgba(170,187,204,0.5)")).toBe("#aabbcc");
  });

  it("못 알아보는 값은 소문자 원문으로 둔다", () => {
    expect(normalizeColor(" None ")).toBe("none");
    expect(normalizeColor("url(#grad)")).toBe("url(#grad)");
  });
});

describe("replaceSvgColors", () => {
  const map = readColorReplace({ "#3B3733": "#c2410c" });

  it("표기가 달라도 같은 색이면 바꾼다", () => {
    const svg =
      '<svg><path fill="rgb(59, 55, 51)"/><rect stroke="#3b3733"/><circle fill="#F00"/></svg>';
    const out = replaceSvgColors(svg, map);
    expect(out).toContain('fill="#c2410c"');
    expect(out).toContain('stroke="#c2410c"');
    // 대상이 아닌 색은 그대로.
    expect(out).toContain('fill="#F00"');
  });

  it("style 속성 안의 색도 바꾼다", () => {
    const svg = '<svg><path style="fill:#3B3733;stroke-width:2"/></svg>';
    expect(replaceSvgColors(svg, map)).toContain("fill:#c2410c");
  });

  it("색이 아닌 값은 안 건드린다", () => {
    const svg = '<svg><path fill="none" stroke="url(#g)"/></svg>';
    expect(replaceSvgColors(svg, map)).toBe(svg);
  });

  it("바꿀 것이 없으면 원문 그대로", () => {
    const svg = '<svg><path fill="#3B3733"/></svg>';
    expect(replaceSvgColors(svg, new Map())).toBe(svg);
  });
});

describe("ensureSvgNamespace", () => {
  it("없으면 채운다 — 없으면 브라우저가 이미지로 못 읽는다", () => {
    expect(ensureSvgNamespace('<svg width="10"><path/></svg>')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10"><path/></svg>',
    );
  });

  it("있으면 두 번 넣지 않는다", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>';
    expect(ensureSvgNamespace(svg)).toBe(svg);
  });
});

describe("decodeSvgSrc / encodeSvgSrc", () => {
  it("base64를 오가며 한글이 안 깨진다", () => {
    const markup = '<svg xmlns="http://www.w3.org/2000/svg"><text>수분</text></svg>';
    expect(decodeSvgSrc(encodeSvgSrc(markup))).toBe(markup);
  });

  it("퍼센트 인코딩도 읽는다", () => {
    const src = `data:image/svg+xml,${encodeURIComponent("<svg><path/></svg>")}`;
    expect(decodeSvgSrc(src)).toBe("<svg><path/></svg>");
  });

  it("data URI가 아니면 null", () => {
    expect(decodeSvgSrc("https://example.test/a.svg")).toBeNull();
  });
});

describe("svgSourceFor", () => {
  const markup = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#3b3733"/></svg>';

  it("바꿀 것이 없으면 원본 문자열을 그대로 돌려준다 (이미지 캐시 유지)", () => {
    const src = encodeSvgSrc(markup);
    expect(svgSourceFor({ src })).toBe(src);
  });

  it("colorsReplace를 먹인 새 src를 만든다", () => {
    const src = encodeSvgSrc(markup);
    const next = svgSourceFor({ src, colorsReplace: { "#3B3733": "#c2410c" } })!;
    expect(next).not.toBe(src);
    expect(decodeSvgSrc(next)).toContain('fill="#c2410c"');
  });

  it("xmlns 없는 마크업은 채워서 돌려준다", () => {
    const src = encodeSvgSrc("<svg><path/></svg>");
    expect(decodeSvgSrc(svgSourceFor({ src })!)).toContain("xmlns=");
  });

  it("원격 주소는 손대지 않는다", () => {
    expect(svgSourceFor({ src: "https://example.test/a.svg" })).toBe(
      "https://example.test/a.svg",
    );
    expect(svgSourceFor({})).toBeNull();
  });
});
