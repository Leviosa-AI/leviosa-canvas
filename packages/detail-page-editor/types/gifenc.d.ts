// Minimal typings for gifenc (ships no declarations). Covers only the surface
// the detail-page GIF exporter uses: quantize → applyPalette → GIFEncoder.
declare module "gifenc" {
  type PixelBuffer = Uint8Array | Uint8ClampedArray;
  type Palette = number[][];
  type PixelFormat = "rgb565" | "rgb444" | "rgba4444";

  export function quantize(
    rgba: PixelBuffer,
    maxColors: number,
    options?: {
      format?: PixelFormat;
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaThreshold?: number;
      clearAlphaColor?: number;
    },
  ): Palette;

  export function applyPalette(
    rgba: PixelBuffer,
    palette: Palette,
    format?: PixelFormat,
  ): Uint8Array;

  export interface GifEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: Palette;
        delay?: number;
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
        first?: boolean;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: {
    auto?: boolean;
    initialCapacity?: number;
  }): GifEncoderInstance;
}
