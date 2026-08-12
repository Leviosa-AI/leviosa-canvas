import { beforeEach, describe, expect, it, vi } from "vitest";

import { create } from "fontkit";

import {
  buildCatalogFontSubsets,
  loadCatalogPostScriptNames,
} from "../font-subset";
import type { ExportDocument } from "../document-model";

vi.mock("fontkit", () => ({ create: vi.fn() }));
vi.mock("woff2-encoder/decompress", () => ({
  default: vi.fn(async (bytes: Uint8Array) => bytes),
}));

const createFont = vi.mocked(create);

const documentFixture: ExportDocument = {
  width: 300,
  height: 200,
  pages: [
    {
      id: "selected",
      children: [
        {
          type: "text",
          text: "가A가",
          fontFamily: "Paperozi",
          fontWeight: 600,
        },
      ],
    },
    {
      id: "ignored",
      children: [
        {
          type: "text",
          text: "나",
          fontFamily: "Presentation",
          fontWeight: 400,
        },
      ],
    },
  ],
};

function fakeFont(
  fsType: Record<string, boolean> = {},
): ReturnType<typeof create> {
  const subsetIds = new Map<number, number>([[0, 0]]);
  return {
    postscriptName: "Paperlogy-6SemiBold",
    unitsPerEm: 1000,
    ascent: 880,
    descent: -120,
    capHeight: 700,
    italicAngle: 0,
    bbox: { minX: -100, minY: -250, maxX: 1100, maxY: 900 },
    glyphForCodePoint: (codePoint: number) => ({
      id: codePoint,
      advanceWidth: codePoint === 65 ? 500 : 1000,
    }),
    createSubset: () => ({
      includeGlyph: (glyph) => {
        const original = typeof glyph === "number" ? glyph : glyph.id;
        if (!subsetIds.has(original)) subsetIds.set(original, subsetIds.size);
        return subsetIds.get(original) ?? 0;
      },
      encode: () => new Uint8Array([0, 1, 0, 0]),
    }),
    "OS/2": { fsType },
  };
}

describe("catalog font subsetting", () => {
  beforeEach(() => {
    createFont.mockReset();
    createFont.mockReturnValue(fakeFont());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([119, 79, 70, 50]))),
    );
  });

  it("loads only selected catalog faces and subsets unique used glyphs", async () => {
    const subsets = await buildCatalogFontSubsets(documentFixture, ["selected"]);

    expect(subsets).toHaveLength(1);
    expect(subsets[0]).toMatchObject({
      spec: { family: "Paperozi", weight: 600, italic: false },
      postscriptName: "Paperlogy-6SemiBold",
      format: "truetype",
    });
    expect(subsets[0].glyphs).toEqual([
      { char: "가", unicode: "가", id: 1, width: 1000 },
      { char: "A", unicode: "A", id: 2, width: 500 },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "Paperlogy-6SemiBold.woff2",
    );
  });

  it("reads the source font's PostScript name for PSD type layers", async () => {
    await expect(
      loadCatalogPostScriptNames(documentFixture, ["selected"]),
    ).resolves.toEqual([
      {
        spec: { family: "Paperozi", weight: 600, italic: false },
        name: "Paperlogy-6SemiBold",
      },
    ]);
  });

  it("rejects fonts whose metadata prohibits editable embedding", async () => {
    createFont.mockReturnValue(fakeFont({ noEmbedding: true }));

    await expect(
      buildCatalogFontSubsets(documentFixture, ["selected"]),
    ).rejects.toMatchObject({
      code: "FONT_EMBEDDING_FAILED",
      family: "페이퍼로지",
    });
  });
});
