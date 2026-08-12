import { describe, expect, it, vi } from "vitest";

import { AI_MAX_DIMENSION, buildAiPdf } from "../ai";
import type { ExportDocument, ExportElement } from "../document-model";
import type { AiBitmap, PdfEmbeddedFont } from "../pdf/resources";
import { utf16Hex } from "../pdf/writer";

/**
 * The exporter is driven with no ``deflate`` hook, so content streams stay
 * plain text and the assertions can read the operators the file really holds.
 */
const decode = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

/** Deterministic stand-in for canvas measureText: half an em per character. */
const measure = (el: ExportElement, text: string) =>
  text.length * (Number(el.fontSize) || 16) * 0.5;

const svgDataUri = (markup: string) =>
  `data:image/svg+xml,${encodeURIComponent(markup)}`;

const STAR = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ff0000">' +
    '<path d="M12 2l3 6.5 7 .8-5.2 4.8z"></path></svg>',
);

function bitmap(alpha = false): AiBitmap {
  return {
    width: 2,
    height: 2,
    format: "rgb",
    data: new Uint8Array(2 * 2 * 3).fill(200),
    ...(alpha ? { alpha: new Uint8Array([0, 128, 255, 255]) } : {}),
  };
}

const loadBitmap = vi.fn(async () => bitmap(true));

function build(doc: ExportDocument, merged = true) {
  return buildAiPdf(doc, { measure, loadBitmap, merged }).then(decode);
}

const textElement: ExportElement = {
  id: "headline",
  type: "text",
  x: 40,
  y: 100,
  width: 300,
  height: 40,
  text: "촉촉한 세럼",
  fontSize: 32,
  fontWeight: 700,
  fontFamily: "Pretendard",
  fill: "#111111",
};

const doc: ExportDocument = {
  width: 750,
  height: 1000,
  pages: [
    {
      id: "p1",
      background: "#ffffff",
      children: [
        { id: "card", type: "figure", x: 20, y: 20, width: 200, height: 80, fill: "#ff0000", cornerRadius: 12 },
        textElement,
        { id: "icon", type: "svg", x: 300, y: 300, width: 24, height: 24, src: STAR },
        { id: "photo", type: "image", x: 0, y: 400, width: 750, height: 500, src: "https://cdn/x.png" },
      ],
    },
    { id: "p2", background: "#000000", children: [] },
  ],
};

describe("buildAiPdf", () => {
  it("writes a structurally complete PDF (an .ai is a PDF underneath)", async () => {
    const pdf = await build(doc);
    expect(pdf.startsWith("%PDF-1.7")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toMatch(/xref\n0 \d+\n0000000000 65535 f/);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("stacks the selected pages onto one artboard when merged", async () => {
    const pdf = await build(doc);
    expect(pdf).toContain("/Count 1");
    // 750 wide, both pages tall.
    expect(pdf).toContain("/MediaBox [0 0 750 2000]");
    // The page CTM is flipped so elements keep their y-down coordinates.
    expect(pdf).toContain("1 0 0 -1 0 2000 cm");
  });

  it("gives each page its own artboard when not merged", async () => {
    const pdf = await build(doc, false);
    expect(pdf).toContain("/Count 2");
    expect(pdf.match(/\/MediaBox \[0 0 750 1000\]/g)).toHaveLength(2);
  });

  it("exports only the requested pages", async () => {
    const pdf = await buildAiPdf(doc, {
      measure,
      loadBitmap,
      merged: true,
      pageIds: ["p2"],
    }).then(decode);
    expect(pdf).toContain("/MediaBox [0 0 750 1000]");
    expect(pdf).not.toContain(utf16Hex("촉촉한 세럼"));
  });

  it("keeps text editable: a Korean-CMap CID font, not outlines or pixels", async () => {
    const pdf = await build(doc);
    expect(pdf).toContain("/Subtype /Type0");
    expect(pdf).toContain("/Encoding /UniKS-UCS2-H");
    expect(pdf).toContain("/Ordering (Korea1)");
    // Weight 700 becomes the PostScript name Illustrator looks for.
    expect(pdf).toContain("/BaseFont /Pretendard-Bold");
    expect(pdf).toContain(`<${utf16Hex("촉")}>`);
    expect(pdf).toContain("] TJ");
  });

  it("embeds a catalog font subset with glyph widths and Unicode mapping", async () => {
    const embedded: PdfEmbeddedFont = {
      spec: { family: "Paperozi", weight: 700, italic: false },
      data: new Uint8Array([0, 1, 0, 0, 70, 79, 78, 84]),
      format: "truetype",
      postscriptName: "Paperlogy-7Bold",
      unitsPerEm: 1000,
      ascent: 880,
      descent: -120,
      capHeight: 700,
      italicAngle: 0,
      bbox: [-100, -250, 1100, 900],
      glyphs: [
        { char: "촉", unicode: "촉", id: 1, width: 1000 },
        { char: "촉", unicode: "촉", id: 1, width: 1000 },
      ],
    };
    const pdf = await buildAiPdf(
      {
        width: 200,
        height: 100,
        pages: [
          {
            id: "p",
            children: [
              {
                ...textElement,
                text: "촉",
                fontFamily: "Paperozi",
                fontStyle: "italic",
              },
            ],
          },
        ],
      },
      {
        measure,
        loadBitmap,
        merged: true,
        embeddedFonts: [embedded],
      },
    ).then(decode);

    expect(pdf).toContain("/FontFile2");
    expect(pdf).toContain("/Subtype /CIDFontType2");
    expect(pdf).toContain("/Encoding /Identity-H");
    expect(pdf).toContain("/ToUnicode");
    expect(pdf).toContain("/BaseFont /");
    expect(pdf).toContain("+Paperlogy-7Bold");
    expect(pdf).toContain("<0001> <CD09>");
    expect(pdf).toContain("<0001>");
    expect(pdf).toContain("1 0 0.213 -1");
    expect(pdf).not.toContain("/Encoding /UniKS-UCS2-H");
  });

  it("corrects every glyph's advance, since no font is embedded to supply widths", async () => {
    const pdf = await build(doc);
    const tj = pdf.match(/\[<[0-9A-F]{4}>[^\]]*\] TJ/)?.[0] ?? "";
    // The stub measures half an em, so each glyph asks to be pulled back 500/1000.
    expect(tj).toContain("500");
  });

  it("draws figures as vector paths with the fill colour", async () => {
    const pdf = await build(doc);
    expect(pdf).toContain("1 0 0 rg");
    // A 12px corner radius means curves, not a bare `re`.
    expect(pdf).toMatch(/\d+ \d+ [\d.]+ [\d.]+ [\d.]+ [\d.]+ c/);
    expect(pdf).toMatch(/\nf\n/);
  });

  it("vectorizes inline SVG icons instead of embedding them as pictures", async () => {
    const pdf = await build(doc);
    // The icon's viewBox (24) is mapped onto its 24px box: scale 1, at (300, 300).
    expect(pdf).toContain("1 0 0 1 300 300 cm");
    expect(pdf).toContain("12 2 m");
    // Only the photo needs an XObject; the icon is paths.
    expect(pdf.match(/\/Subtype \/Image/g)).toHaveLength(2); // photo + its soft mask
  });

  it("carries image transparency as a soft mask", async () => {
    const pdf = await build(doc);
    expect(pdf).toContain("/SMask");
    expect(pdf).toContain("/ColorSpace /DeviceGray");
    // Placed with a negated height: image rows run bottom-up under the flipped CTM.
    expect(pdf).toContain("750 0 0 -500 0 900 cm");
  });

  it("paints a gradient background as a shading, not a flat fill", async () => {
    const pdf = await build({
      width: 100,
      height: 100,
      pages: [{ id: "g", background: "linear-gradient(180deg, #ff0000, #0000ff)", children: [] }],
    });
    expect(pdf).toContain("/ShadingType 2");
    expect(pdf).toContain("/FunctionType 2");
    expect(pdf).toContain(" sh\n");
  });

  it("leaves a fully transparent fill unpainted", async () => {
    // The decomposer writes a bordered, hollow card as rgba(0,0,0,0) + stroke.
    // Reading only its RGB would flood the card with opaque black — and it did.
    const pdf = await build({
      width: 100,
      height: 100,
      pages: [
        {
          id: "t",
          children: [
            {
              type: "figure",
              x: 0,
              y: 0,
              width: 50,
              height: 20,
              fill: "rgba(0,0,0,0)",
              stroke: "rgb(35, 48, 35)",
              strokeWidth: 2,
            },
          ],
        },
      ],
    });
    expect(pdf).not.toContain("0 0 0 rg");
    // Stroked only: `S`, never `B` (fill+stroke) or `f`.
    expect(pdf).toMatch(/\nS\n/);
    expect(pdf).not.toMatch(/\n[Bf]\n/);
  });

  it("keeps a semi-transparent fill translucent", async () => {
    const pdf = await build({
      width: 100,
      height: 100,
      pages: [
        {
          id: "t",
          children: [
            { type: "figure", x: 0, y: 0, width: 50, height: 20, fill: "rgba(0, 0, 0, 0.4)" },
          ],
        },
      ],
    });
    expect(pdf).toContain("/ca 0.4");
  });

  it("applies group and element opacity through an ExtGState", async () => {
    const pdf = await build({
      width: 100,
      height: 100,
      pages: [
        {
          id: "o",
          children: [
            {
              type: "group",
              opacity: 0.5,
              children: [{ type: "figure", x: 0, y: 0, width: 10, height: 10, fill: "#000" }],
            },
          ],
        },
      ],
    });
    expect(pdf).toContain("/ca 0.5");
    expect(pdf).toContain(" gs\n");
  });

  it("skips hidden elements", async () => {
    const pdf = await build({
      width: 100,
      height: 100,
      pages: [{ id: "h", children: [{ ...textElement, visible: false }] }],
    });
    expect(pdf).not.toContain(utf16Hex("촉"));
  });

  it("refuses an empty document rather than writing a broken file", async () => {
    await expect(buildAiPdf({ pages: [] }, { measure, loadBitmap, merged: true })).rejects.toThrow();
  });

  it("caps at Illustrator's artboard limit", () => {
    expect(AI_MAX_DIMENSION).toBe(16383);
  });
});
