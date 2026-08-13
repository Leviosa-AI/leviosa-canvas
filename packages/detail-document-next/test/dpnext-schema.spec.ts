import { describe, expect, it } from "vitest";

import { DpnextValidationError, canonicalDocument, validateDocument, type DpnextNode } from "../src";

const document = {
  schema_version: "detail-document-v2" as const,
  document_id: "dpnd_renderer",
  revision: 0,
  canvas: { width: 750, background: "#fff" },
  sections: [{
    id: "sec_hero",
    type: "section" as const,
    children: [{ id: "txt_title", type: "text" as const, content: "안녕하세요" }],
  }],
  assets: {},
};

describe("dpnext document schema", () => {
  it("validates and canonicalizes independently of key order", () => {
    validateDocument(document);
    const reordered = { ...document, assets: {}, sections: document.sections };
    expect(canonicalDocument(reordered)).toBe(canonicalDocument(document));
  });

  it("rejects active SVG content", () => {
    const malicious = structuredClone(document);
    malicious.sections[0].children = [{
      id: "svg_bad",
      type: "svg",
      svg: "<svg><script>alert(1)</script></svg>",
    }] as never;
    expect(() => validateDocument(malicious)).toThrow(DpnextValidationError);
  });

  it("rejects external SVG references and CSS URLs", () => {
    const externalSvg = structuredClone(document);
    externalSvg.sections[0].children = [{
      id: "svg_external",
      type: "svg",
      svg: '<svg><image href="https://example.com/tracker.png" /></svg>',
    }] as never;
    expect(() => validateDocument(externalSvg)).toThrow(/DPNEXT-SVG-002/);

    const externalCss = structuredClone(document);
    (externalCss.sections[0].children[0] as DpnextNode).style = {
      backgroundImage: "url(https://example.com/tracker.png)",
    };
    expect(() => validateDocument(externalCss)).toThrow(/DPNEXT-STYLE-002/);
  });
});
