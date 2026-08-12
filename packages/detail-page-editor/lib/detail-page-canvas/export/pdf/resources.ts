import { parseColor } from "../color";
import { fmt, PdfBuilder, pdfString, type PdfRef } from "./writer";

/**
 * The page-resource side of the PDF (.ai) exporter: fonts, gradients, alpha
 * states and images are collected while the content stream is written, then
 * emitted as one shared ``/Resources`` dictionary.
 */

export type RgbColor = [number, number, number];

/**
 * A colour PDF can actually paint with. PDF has no alpha in its colour
 * operators — transparency lives in a separate graphics state — so the two are
 * split here. A fully transparent colour returns null and paints nothing: our
 * documents use ``rgba(0,0,0,0)`` for "no fill", and taking only its RGB would
 * flood the shape with opaque black.
 */
export type Paint = { color: RgbColor; alpha: number };

export function parsePaint(value: unknown): Paint | null {
  const parsed = parseColor(value);
  if (!parsed || parsed.a <= 0) return null;
  return {
    color: [parsed.r / 255, parsed.g / 255, parsed.b / 255],
    alpha: parsed.a,
  };
}

/** Colour operator operands: ``rg`` (fill) / ``RG`` (stroke). */
export const rgbOps = (color: RgbColor) => color.map(fmt).join(" ");

export type ShadingStop = { offset: number; color: RgbColor };

export type ShadingSpec =
  | { kind: "axial"; x0: number; y0: number; x1: number; y1: number; stops: ShadingStop[] }
  | { kind: "radial"; cx: number; cy: number; r: number; stops: ShadingStop[] };

export type PdfFontSpec = { family: string; weight: number; italic: boolean };

export type PdfEmbeddedGlyph = {
  /** Glyph/CID in the encoded subset. */
  id: number;
  /** Advance width normalized to 1000 units for the PDF /W array. */
  width: number;
  /** Original Unicode scalar represented by this glyph. */
  unicode: string;
};

export type PdfEmbeddedFont = {
  spec: PdfFontSpec;
  data: Uint8Array;
  format: "truetype" | "cff";
  postscriptName: string;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  capHeight: number;
  italicAngle: number;
  bbox: [number, number, number, number];
  /** Character to subset glyph mapping. */
  glyphs: Array<PdfEmbeddedGlyph & { char: string }>;
};

/**
 * A decoded bitmap ready to embed. ``jpeg`` goes in untouched (DCTDecode);
 * ``rgb`` is raw 8-bit RGB the writer deflates. ``alpha`` becomes the soft
 * mask, which is what keeps a transparent cut-out or a rounded corner from
 * turning into a white box.
 */
export type AiBitmap = {
  width: number;
  height: number;
  format: "jpeg" | "rgb";
  data: Uint8Array;
  alpha?: Uint8Array;
};

const WEIGHT_NAMES: Array<[number, string]> = [
  [150, "Thin"],
  [250, "ExtraLight"],
  [350, "Light"],
  [450, "Regular"],
  [550, "Medium"],
  [650, "SemiBold"],
  [750, "Bold"],
  [850, "ExtraBold"],
  [Infinity, "Black"],
];

/**
 * PostScript-style name Illustrator will look for, e.g. ``Pretendard-Bold``.
 * The font is not embedded, so this name is the whole of what Illustrator has
 * to find (or substitute) — same contract as the PSD exporter's layer fonts.
 */
export function pdfFontName(spec: PdfFontSpec): string {
  const family = (spec.family || "Pretendard").replace(/\s+/g, "");
  const weight = WEIGHT_NAMES.find(([max]) => spec.weight < max)?.[1] ?? "Regular";
  const italic = spec.italic ? "Italic" : "";
  if (weight === "Regular" && italic) return `${family}-Italic`;
  return `${family}-${weight}${italic}`;
}

export function pdfFontKey(spec: PdfFontSpec): string {
  return `${spec.family}\u0000${spec.weight}\u0000${spec.italic ? "italic" : "normal"}`;
}

function safePdfName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "") || "EmbeddedFont";
}

function subsetFontName(resource: string, postscriptName: string): string {
  let hash = 0;
  for (const char of resource) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  const prefix = hash.toString(26).toUpperCase().replace(/[^A-Z]/g, "A").padEnd(6, "A").slice(0, 6);
  return `${prefix}+${safePdfName(postscriptName)}`;
}

function normalizedMetric(value: number, unitsPerEm: number): number {
  return Math.round((value / Math.max(1, unitsPerEm)) * 1000);
}

function toUnicodeCMap(fontName: string, glyphs: PdfEmbeddedFont["glyphs"]): Uint8Array {
  const byId = new Map<number, string>();
  for (const glyph of glyphs) {
    if (!byId.has(glyph.id)) byId.set(glyph.id, glyph.unicode);
  }
  const entries = [...byId]
    .filter(([id]) => id >= 0 && id <= 0xffff)
    .sort(([a], [b]) => a - b);
  const lines = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    `/CMapName /${safePdfName(fontName)}-UCS def`,
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
  ];
  for (let at = 0; at < entries.length; at += 100) {
    const chunk = entries.slice(at, at + 100);
    lines.push(`${chunk.length} beginbfchar`);
    for (const [id, unicode] of chunk) {
      lines.push(
        `<${id.toString(16).padStart(4, "0").toUpperCase()}> <${[...unicode]
          .map((char) => {
            const code = char.codePointAt(0) ?? 0;
            if (code <= 0xffff) return code.toString(16).padStart(4, "0").toUpperCase();
            const scalar = code - 0x10000;
            const high = 0xd800 + (scalar >> 10);
            const low = 0xdc00 + (scalar & 0x3ff);
            return (
              high.toString(16).padStart(4, "0") +
              low.toString(16).padStart(4, "0")
            ).toUpperCase();
          })
          .join("")}>`,
      );
    }
    lines.push("endbfchar");
  }
  lines.push("endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end");
  return new TextEncoder().encode(lines.join("\n"));
}

/** Normalize stops to cover [0, 1]; PDF functions have no "extend" of their own. */
function normalizeStops(stops: ShadingStop[]): ShadingStop[] {
  const sorted = [...stops]
    .map((s) => ({ offset: Math.min(1, Math.max(0, s.offset)), color: s.color }))
    .sort((a, b) => a.offset - b.offset);
  if (!sorted.length) return [{ offset: 0, color: [0, 0, 0] }];
  if (sorted[0].offset > 0) sorted.unshift({ offset: 0, color: sorted[0].color });
  const last = sorted[sorted.length - 1];
  if (last.offset < 1) sorted.push({ offset: 1, color: last.color });
  return sorted;
}

const color3 = (c: RgbColor) => `[${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])}]`;

/** A stitching function over the stops: PDF's way of writing a colour ramp. */
function shadingFunction(builder: PdfBuilder, stops: ShadingStop[]): PdfRef {
  const points = normalizeStops(stops);
  if (points.length === 2) {
    return builder.add(
      `<< /FunctionType 2 /Domain [0 1] /C0 ${color3(points[0].color)} ` +
        `/C1 ${color3(points[1].color)} /N 1 >>`,
    );
  }
  const segments: PdfRef[] = [];
  const bounds: number[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    segments.push(
      builder.add(
        `<< /FunctionType 2 /Domain [0 1] /C0 ${color3(points[i].color)} ` +
          `/C1 ${color3(points[i + 1].color)} /N 1 >>`,
      ),
    );
    if (i > 0) bounds.push(points[i].offset);
  }
  return builder.add(
    `<< /FunctionType 3 /Domain [0 1] ` +
      `/Functions [${segments.map((r) => `${r} 0 R`).join(" ")}] ` +
      `/Bounds [${bounds.map(fmt).join(" ")}] ` +
      `/Encode [${segments.map(() => "0 1").join(" ")}] >>`,
  );
}

export class ResourcePool {
  private fontRes = new Map<
    string,
    { spec: PdfFontSpec; embedded?: PdfEmbeddedFont }
  >();
  private embeddedFonts = new Map<string, PdfEmbeddedFont>();
  private embeddedGlyphs = new Map<
    string,
    Map<string, PdfEmbeddedFont["glyphs"][number]>
  >();
  private shadingRes = new Map<string, ShadingSpec>();
  private alphaRes = new Map<string, [number, number]>();
  private imageRes = new Map<AiBitmap, string>();

  constructor(embeddedFonts: PdfEmbeddedFont[] = []) {
    for (const font of embeddedFonts) {
      const key = pdfFontKey(font.spec);
      this.embeddedFonts.set(key, font);
      this.embeddedGlyphs.set(
        key,
        new Map(font.glyphs.map((glyph) => [glyph.char, glyph])),
      );
    }
  }

  private embeddedFontFor(spec: PdfFontSpec): PdfEmbeddedFont | undefined {
    const exact = this.embeddedFonts.get(pdfFontKey(spec));
    if (exact) return exact;
    const sameFamily = [...this.embeddedFonts.values()].filter(
      (font) => font.spec.family === spec.family,
    );
    const sameFace = sameFamily.filter(
      (font) =>
        font.spec.italic === spec.italic,
    );
    const candidates = sameFace.length ? sameFace : sameFamily;
    return candidates.reduce<PdfEmbeddedFont | undefined>(
      (best, font) =>
        !best ||
        Math.abs(font.spec.weight - spec.weight) <
          Math.abs(best.spec.weight - spec.weight)
          ? font
          : best,
      undefined,
    );
  }

  font(spec: PdfFontSpec): string {
    const embedded = this.embeddedFontFor(spec);
    const name = embedded?.postscriptName || pdfFontName(spec);
    const res = `F${name}`.replace(/[^A-Za-z0-9]/g, "");
    if (!this.fontRes.has(res)) this.fontRes.set(res, { spec, embedded });
    return res;
  }

  textGlyph(resource: string, char: string): { hex: string; width: number } | null {
    const record = this.fontRes.get(resource);
    if (!record?.embedded) return null;
    const glyph = this.embeddedGlyphs
      .get(pdfFontKey(record.embedded.spec))
      ?.get(char);
    if (!glyph) return { hex: "0000", width: 1000 };
    return {
      hex: glyph.id.toString(16).padStart(4, "0").toUpperCase(),
      width: glyph.width,
    };
  }

  syntheticItalic(resource: string): boolean {
    const record = this.fontRes.get(resource);
    return Boolean(
      record?.embedded && record.spec.italic && !record.embedded.spec.italic,
    );
  }

  shading(spec: ShadingSpec): string {
    const key = JSON.stringify(spec);
    for (const [res, existing] of this.shadingRes) {
      if (JSON.stringify(existing) === key) return res;
    }
    const res = `Sh${this.shadingRes.size + 1}`;
    this.shadingRes.set(res, spec);
    return res;
  }

  /** Constant fill/stroke alpha as an ExtGState. */
  alpha(fill: number, stroke: number = fill): string {
    const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
    const [ca, CA] = [clamp(fill), clamp(stroke)];
    const res = `GS${String(ca).replace(".", "")}x${String(CA).replace(".", "")}`;
    if (!this.alphaRes.has(res)) this.alphaRes.set(res, [ca, CA]);
    return res;
  }

  image(bitmap: AiBitmap): string {
    const existing = this.imageRes.get(bitmap);
    if (existing) return existing;
    const res = `Im${this.imageRes.size + 1}`;
    this.imageRes.set(bitmap, res);
    return res;
  }

  /**
   * Write every collected resource and return the ``/Resources`` dict body.
   * ``deflate`` is optional: without it, raw bitmaps go in uncompressed (valid
   * PDF, just larger) so the builder still works outside a browser.
   */
  async write(
    builder: PdfBuilder,
    deflate?: (data: Uint8Array) => Promise<Uint8Array>,
  ): Promise<string> {
    const fonts: string[] = [];
    for (const [res, { spec, embedded }] of this.fontRes) {
      if (embedded) {
        const name = subsetFontName(res, embedded.postscriptName);
        const fontFile =
          embedded.format === "truetype"
            ? builder.addStream(`/Length1 ${embedded.data.length}`, embedded.data)
            : builder.addStream("/Subtype /CIDFontType0C", embedded.data);
        const units = Math.max(1, embedded.unitsPerEm);
        const bbox = embedded.bbox.map((value) => normalizedMetric(value, units));
        const descriptor = builder.add(
          `<< /Type /FontDescriptor /FontName /${name} ` +
            `/Flags ${32 + (spec.italic ? 64 : 0)} ` +
            `/FontBBox [${bbox.join(" ")}] ` +
            `/ItalicAngle ${fmt(embedded.italicAngle)} ` +
            `/Ascent ${normalizedMetric(embedded.ascent, units)} ` +
            `/Descent ${normalizedMetric(embedded.descent, units)} ` +
            `/CapHeight ${normalizedMetric(embedded.capHeight, units)} ` +
            `/StemV ${spec.weight >= 600 ? 120 : 80} ` +
            `/${embedded.format === "truetype" ? "FontFile2" : "FontFile3"} ${fontFile} 0 R >>`,
        );
        const widthsById = new Map<number, number>();
        for (const glyph of embedded.glyphs) {
          if (!widthsById.has(glyph.id)) widthsById.set(glyph.id, glyph.width);
        }
        const widths = [...widthsById]
          .sort(([a], [b]) => a - b)
          .map(([id, width]) => `${id} [${fmt(width)}]`)
          .join(" ");
        const descendant = builder.add(
          `<< /Type /Font /Subtype /${
            embedded.format === "truetype" ? "CIDFontType2" : "CIDFontType0"
          } /BaseFont /${name} ` +
            `/CIDSystemInfo << /Registry ${pdfString("Adobe")} /Ordering ${pdfString("Identity")} ` +
            `/Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 1000 ` +
            `${widths ? `/W [${widths}] ` : ""}` +
            `${embedded.format === "truetype" ? "/CIDToGIDMap /Identity " : ""}>>`,
        );
        const toUnicode = builder.addStream("", toUnicodeCMap(name, embedded.glyphs));
        const font = builder.add(
          `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H ` +
            `/DescendantFonts [${descendant} 0 R] /ToUnicode ${toUnicode} 0 R >>`,
        );
        fonts.push(`/${res} ${font} 0 R`);
        continue;
      }
      const name = pdfFontName(spec);
      // Non-embedded CID font. /UniKS-UCS2-H is a CMap every PDF reader ships
      // (Adobe-Korea1): it maps the UTF-16BE code points we write straight to
      // the glyphs of whichever Korean font the reader substitutes — which is
      // how the text survives without the font binary. Widths come from the
      // TJ adjustments in text-ops.ts, not from /W.
      const descriptor =
        `<< /Type /FontDescriptor /FontName /${name} /Flags 4 ` +
        `/FontBBox [-100 -250 1100 900] /ItalicAngle ${spec.italic ? -12 : 0} ` +
        `/Ascent 880 /Descent -120 /CapHeight 700 /StemV ${spec.weight >= 600 ? 120 : 80} >>`;
      const descendant = builder.add(
        `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /${name} ` +
          `/CIDSystemInfo << /Registry ${pdfString("Adobe")} /Ordering ${pdfString("Korea1")} ` +
          `/Supplement 2 >> /FontDescriptor ${descriptor} /DW 1000 >>`,
      );
      const font = builder.add(
        `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /UniKS-UCS2-H ` +
          `/DescendantFonts [${descendant} 0 R] >>`,
      );
      fonts.push(`/${res} ${font} 0 R`);
    }

    const shadings: string[] = [];
    for (const [res, spec] of this.shadingRes) {
      const fn = shadingFunction(builder, spec.stops);
      const coords =
        spec.kind === "axial"
          ? `/ShadingType 2 /Coords [${fmt(spec.x0)} ${fmt(spec.y0)} ${fmt(spec.x1)} ${fmt(spec.y1)}]`
          : `/ShadingType 3 /Coords [${fmt(spec.cx)} ${fmt(spec.cy)} 0 ${fmt(spec.cx)} ${fmt(spec.cy)} ${fmt(spec.r)}]`;
      const ref = builder.add(
        `<< ${coords} /ColorSpace /DeviceRGB /Function ${fn} 0 R /Extend [true true] >>`,
      );
      shadings.push(`/${res} ${ref} 0 R`);
    }

    const gstates: string[] = [];
    for (const [res, [ca, CA]] of this.alphaRes) {
      const ref = builder.add(`<< /Type /ExtGState /ca ${fmt(ca)} /CA ${fmt(CA)} >>`);
      gstates.push(`/${res} ${ref} 0 R`);
    }

    const images: string[] = [];
    for (const [bitmap, res] of this.imageRes) {
      let smask = "";
      if (bitmap.alpha) {
        const maskRef = builder.alloc();
        const masked = deflate ? await deflate(bitmap.alpha) : bitmap.alpha;
        builder.addStream(
          `/Type /XObject /Subtype /Image /Width ${bitmap.width} /Height ${bitmap.height} ` +
            `/ColorSpace /DeviceGray /BitsPerComponent 8` +
            (deflate ? " /Filter /FlateDecode" : ""),
          masked,
          maskRef,
        );
        smask = ` /SMask ${maskRef} 0 R`;
      }
      const isJpeg = bitmap.format === "jpeg";
      const data = isJpeg || !deflate ? bitmap.data : await deflate(bitmap.data);
      const filter = isJpeg ? " /Filter /DCTDecode" : deflate ? " /Filter /FlateDecode" : "";
      const ref = builder.addStream(
        `/Type /XObject /Subtype /Image /Width ${bitmap.width} /Height ${bitmap.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8${filter}${smask}`,
        data,
      );
      images.push(`/${res} ${ref} 0 R`);
    }

    const dict = [
      "/ProcSet [/PDF /Text /ImageC]",
      fonts.length ? `/Font << ${fonts.join(" ")} >>` : "",
      shadings.length ? `/Shading << ${shadings.join(" ")} >>` : "",
      gstates.length ? `/ExtGState << ${gstates.join(" ")} >>` : "",
      images.length ? `/XObject << ${images.join(" ")} >>` : "",
    ].filter(Boolean);
    return `<< ${dict.join(" ")} >>`;
  }
}
