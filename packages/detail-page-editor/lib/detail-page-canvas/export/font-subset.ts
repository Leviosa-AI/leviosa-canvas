import {
  getDetailPageFont,
  resolveDetailPageFontStyle,
  type DetailPageFont,
  type DetailPageFontStyle,
} from "../font-catalog";

import {
  selectPages,
  type ExportDocument,
  type ExportElement,
} from "./document-model";
import {
  pdfFontKey,
  type PdfEmbeddedFont,
  type PdfFontSpec,
} from "./pdf/resources";
import {
  isItalic,
  normalizeFontWeight,
  transformText,
} from "./text-layout";

type CatalogFontUsage = {
  font: DetailPageFont;
  source: DetailPageFontStyle;
  spec: PdfFontSpec;
  chars: Set<string>;
};

export type CatalogFontPostScriptName = {
  spec: PdfFontSpec;
  name: string;
};

type FontkitModule = typeof import("fontkit");
type FontkitFont = ReturnType<FontkitModule["create"]>;

export class FontEmbeddingError extends Error {
  readonly code = "FONT_EMBEDDING_FAILED";

  constructor(
    readonly family: string,
    message: string,
  ) {
    super(message);
    this.name = "FontEmbeddingError";
  }
}

const fontFilePromises = new Map<string, Promise<Uint8Array>>();
let fontkitPromise: Promise<FontkitModule> | null = null;

function loadFontkit(): Promise<FontkitModule> {
  fontkitPromise ??= import("fontkit");
  return fontkitPromise;
}

function fetchFontFile(url: string): Promise<Uint8Array> {
  const cached = fontFilePromises.get(url);
  if (cached) return cached;
  const pending = fetch(url, { mode: "cors", credentials: "omit" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`font request failed (${response.status})`);
      }
      return new Uint8Array(await response.arrayBuffer());
    })
    .catch((error) => {
      fontFilePromises.delete(url);
      throw error;
    });
  fontFilePromises.set(url, pending);
  return pending;
}

async function decodeWebFont(
  bytes: Uint8Array,
  format: DetailPageFontStyle["format"],
): Promise<Uint8Array> {
  if (format === "woff2") {
    const { default: decompress } = await import("woff2-encoder/decompress");
    return decompress(bytes);
  }
  return bytes;
}

function normalizeColorFont(font: FontkitFont): FontkitFont {
  const tables = font.directory?.tables;
  if (!tables?.COLR && !tables?.CPAL) return font;
  // PDF text fill supplies the colour. Removing COLR/CPAL makes Fontkit expose
  // Mona12's underlying monochrome TrueType outlines instead of a COLR wrapper
  // that its subset encoder cannot serialize.
  delete tables.COLR;
  delete tables.CPAL;
  font._glyphs = [];
  return font;
}

function collectCatalogFontUsage(
  doc: ExportDocument,
  pageIds?: string[],
): CatalogFontUsage[] {
  const usage = new Map<string, CatalogFontUsage>();
  const walk = (elements?: ExportElement[]) => {
    for (const element of elements ?? []) {
      if (element.visible === false) continue;
      if (element.type === "text") {
        const family = String(element.fontFamily || "");
        const font = getDetailPageFont(family);
        if (font) {
          const italic = isItalic(element);
          const source = resolveDetailPageFontStyle(
            font,
            normalizeFontWeight(element),
            italic ? "italic" : "normal",
          );
          const spec: PdfFontSpec = {
            family,
            weight: source.weight,
            italic: source.style === "italic",
          };
          const key = pdfFontKey(spec);
          const entry = usage.get(key) ?? {
            font,
            source,
            spec,
            chars: new Set<string>(),
          };
          for (const char of Array.from(transformText(element))) {
            entry.chars.add(char);
          }
          usage.set(key, entry);
        }
      }
      walk(element.children);
    }
  };
  for (const page of selectPages(doc, pageIds)) walk(page.children);
  return [...usage.values()];
}

async function openCatalogFont(usage: CatalogFontUsage): Promise<FontkitFont> {
  try {
    const [fontkit, sourceBytes] = await Promise.all([
      loadFontkit(),
      fetchFontFile(usage.source.url),
    ]);
    return normalizeColorFont(
      fontkit.create(
        await decodeWebFont(sourceBytes, usage.source.format),
      ),
    );
  } catch (error) {
    throw new FontEmbeddingError(
      usage.font.label,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function assertEmbeddingAllowed(usage: CatalogFontUsage, font: FontkitFont) {
  const rights = font["OS/2"]?.fsType;
  if (rights?.noEmbedding || rights?.bitmapOnly) {
    throw new FontEmbeddingError(
      usage.font.label,
      "font metadata prohibits embedding",
    );
  }
  if (rights?.noSubsetting) {
    throw new FontEmbeddingError(
      usage.font.label,
      "font metadata prohibits subsetting",
    );
  }
}

async function subsetCatalogFont(
  usage: CatalogFontUsage,
): Promise<PdfEmbeddedFont> {
  const font = await openCatalogFont(usage);
  assertEmbeddingAllowed(usage, font);

  try {
    const subset = font.createSubset();
    const glyphs: PdfEmbeddedFont["glyphs"] = [];
    for (const char of usage.chars) {
      const codePoint = char.codePointAt(0);
      if (codePoint == null) continue;
      const glyph = font.glyphForCodePoint(codePoint);
      const id = subset.includeGlyph(glyph);
      glyphs.push({
        char,
        unicode: char,
        id,
        width: Math.round(
          (glyph.advanceWidth / Math.max(1, font.unitsPerEm)) * 1000,
        ),
      });
    }

    return {
      spec: usage.spec,
      data: subset.encode(),
      format: font["CFF "] ? "cff" : "truetype",
      postscriptName:
        String(font.postscriptName || "").trim() ||
        `${usage.font.family}-${usage.source.weight}`,
      unitsPerEm: font.unitsPerEm,
      ascent: font.ascent,
      descent: font.descent,
      capHeight: font.capHeight || font.ascent,
      italicAngle: font.italicAngle || 0,
      bbox: [
        font.bbox.minX,
        font.bbox.minY,
        font.bbox.maxX,
        font.bbox.maxY,
      ],
      glyphs,
    };
  } catch (error) {
    if (error instanceof FontEmbeddingError) throw error;
    throw new FontEmbeddingError(
      usage.font.label,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Generate one PDF-ready subset for every catalog face used by the export. */
export async function buildCatalogFontSubsets(
  doc: ExportDocument,
  pageIds?: string[],
): Promise<PdfEmbeddedFont[]> {
  return Promise.all(
    collectCatalogFontUsage(doc, pageIds).map(subsetCatalogFont),
  );
}

/**
 * PSD cannot contain a font program, but the type layer can reference the
 * source font's real PostScript name while its raster cache preserves pixels.
 */
export async function loadCatalogPostScriptNames(
  doc: ExportDocument,
  pageIds?: string[],
): Promise<CatalogFontPostScriptName[]> {
  const usages = collectCatalogFontUsage(doc, pageIds);
  const names = await Promise.all(
    usages.map(async (usage) => {
      try {
        const font = await openCatalogFont(usage);
        const name = String(font.postscriptName || "").trim();
        return name ? { spec: usage.spec, name } : null;
      } catch {
        return null;
      }
    }),
  );
  return names.filter(
    (entry): entry is CatalogFontPostScriptName => entry !== null,
  );
}
