/**
 * Byte-level animation detection.
 *
 * The point of this module is that ``.webp`` no longer implies anything: the
 * default output format is animated WebP, but stills use the same suffix and
 * MIME. Getting this wrong in either direction is bad — a still tagged animated
 * makes the editor look for frames that do not exist, and an animation left
 * untagged silently exports as a stack of PNGs.
 */

import { describe, expect, it } from "vitest";

import {
  isAnimatedBuffer,
  isAnimatedFile,
  isAnimatedGif,
  isAnimatedWebp,
  sniffAnimationType,
} from "../animation-sniff";

/** Minimal RIFF/WEBP container holding the given chunks. */
function webp(chunks: Array<{ id: string; size: number }>): ArrayBuffer {
  const body = chunks.reduce((n, c) => n + 8 + c.size + (c.size % 2), 0);
  const buffer = new ArrayBuffer(12 + body);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 4 + body, true);
  write(8, "WEBP");
  let offset = 12;
  for (const chunk of chunks) {
    write(offset, chunk.id);
    view.setUint32(offset + 4, chunk.size, true);
    offset += 8 + chunk.size + (chunk.size % 2);
  }
  return buffer;
}

function gif(descriptors: number): ArrayBuffer {
  const bytes = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0];
  for (let i = 0; i < descriptors; i++) bytes.push(0x2c, 0, 0, 0, 0);
  return new Uint8Array(bytes).buffer;
}

describe("sniffAnimationType", () => {
  it("reads the container from the magic bytes", () => {
    expect(sniffAnimationType(gif(1))).toBe("gif");
    expect(sniffAnimationType(webp([{ id: "VP8 ", size: 4 }]))).toBe("webp");
  });

  it("returns null for other formats and truncated buffers", () => {
    expect(sniffAnimationType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBe(null);
    expect(sniffAnimationType(new ArrayBuffer(0))).toBe(null);
    expect(sniffAnimationType(new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer)).toBe(null);
  });
});

describe("isAnimatedWebp", () => {
  it("requires an ANIM chunk — a still webp is not animated", () => {
    expect(isAnimatedWebp(webp([{ id: "VP8 ", size: 16 }]))).toBe(false);
    expect(isAnimatedWebp(webp([{ id: "VP8X", size: 10 }, { id: "ANIM", size: 6 }]))).toBe(
      true,
    );
  });

  it("walks past odd-sized chunks (RIFF pads them)", () => {
    // A 5-byte chunk occupies 6; mis-handling the pad desynchronises the walk
    // and ANIM is never found.
    expect(
      isAnimatedWebp(webp([{ id: "VP8X", size: 5 }, { id: "ANIM", size: 6 }])),
    ).toBe(true);
  });

  it("terminates on a truncated or zero-sized chunk stream", () => {
    const buffer = webp([{ id: "VP8X", size: 10 }]);
    // Zero out the chunk size so a naive walk would never advance.
    new DataView(buffer).setUint32(16, 0, true);
    expect(isAnimatedWebp(buffer)).toBe(false);
  });

  it("rejects non-webp buffers", () => {
    expect(isAnimatedWebp(gif(3))).toBe(false);
  });
});

describe("isAnimatedGif", () => {
  it("needs more than one image descriptor", () => {
    expect(isAnimatedGif(gif(1))).toBe(false);
    expect(isAnimatedGif(gif(4))).toBe(true);
  });

  it("rejects non-gif buffers", () => {
    expect(isAnimatedGif(webp([{ id: "ANIM", size: 6 }]))).toBe(false);
  });
});

describe("isAnimatedBuffer", () => {
  it("accepts either container", () => {
    expect(isAnimatedBuffer(webp([{ id: "ANIM", size: 6 }]))).toBe(true);
    expect(isAnimatedBuffer(gif(3))).toBe(true);
    expect(isAnimatedBuffer(webp([{ id: "VP8 ", size: 8 }]))).toBe(false);
  });
});

describe("isAnimatedFile", () => {
  const asFile = (buffer: ArrayBuffer, type: string) =>
    new File([buffer], "upload", { type });

  it("tags an animated webp upload even though the MIME says nothing", async () => {
    const animated = webp([{ id: "VP8X", size: 10 }, { id: "ANIM", size: 6 }]);
    expect(await isAnimatedFile(asFile(animated, "image/webp"))).toBe(true);
  });

  it("leaves a still webp untagged (same MIME, same suffix)", async () => {
    const still = webp([{ id: "VP8 ", size: 32 }]);
    expect(await isAnimatedFile(asFile(still, "image/webp"))).toBe(false);
  });

  it("still recognises animated gifs", async () => {
    expect(await isAnimatedFile(asFile(gif(5), "image/gif"))).toBe(true);
    expect(await isAnimatedFile(asFile(gif(1), "image/gif"))).toBe(false);
  });

  it("returns false for unrelated uploads instead of throwing", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
    expect(await isAnimatedFile(asFile(png, "image/png"))).toBe(false);
  });
});
