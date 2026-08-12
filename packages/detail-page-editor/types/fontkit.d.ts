declare module "fontkit" {
  export type FontkitGlyph = {
    id: number;
    advanceWidth: number;
  };

  export type FontkitSubset = {
    includeGlyph(glyph: FontkitGlyph | number): number;
    encode(): Uint8Array;
  };

  export type FontkitFont = {
    postscriptName?: string | null;
    unitsPerEm: number;
    ascent: number;
    descent: number;
    capHeight: number;
    italicAngle: number;
    bbox: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
    glyphForCodePoint(codePoint: number): FontkitGlyph;
    createSubset(): FontkitSubset;
    directory?: { tables: Record<string, unknown> };
    _glyphs?: unknown[];
    readonly ["OS/2"]?: {
      fsType?: {
        noEmbedding?: boolean;
        viewOnly?: boolean;
        editable?: boolean;
        noSubsetting?: boolean;
        bitmapOnly?: boolean;
      };
    };
    readonly ["CFF "]?: unknown;
  };

  export function create(buffer: Uint8Array): FontkitFont;
}
