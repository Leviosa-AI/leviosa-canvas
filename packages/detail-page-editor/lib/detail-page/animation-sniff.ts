/**
 * Byte-level animation detection. No dependencies — the upload panel needs the
 * answer without pulling in the heavy decoders.
 *
 * Why bytes: a ``.gif`` suffix used to be proof of animation, but the default
 * output format is animated WebP now and **``.webp`` is shared by still and
 * animated files**. Stills already use it widely (references, covers), so a
 * suffix or MIME check would tag half the library as animated. The RIFF
 * ``ANIM`` chunk is the only real evidence.
 */

/** Container format from the leading bytes, or null if it is neither. */
export function sniffAnimationType(buffer: ArrayBuffer): "gif" | "webp" | null {
  const head = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
  // "GIF"
  if (head.length >= 4 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) {
    return "gif";
  }
  // "RIFF" .... "WEBP"
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

/**
 * Whether a RIFF/WEBP buffer carries an ``ANIM`` chunk.
 *
 * RIFF is a flat list of ``fourcc(4) + size(4, little endian) + payload``, with
 * odd payloads padded to even. Animated files put ``ANIM`` right after ``VP8X``,
 * but we walk rather than assume an order — and always advance at least 8 bytes
 * so a truncated file cannot spin forever.
 */
export function isAnimatedWebp(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 16) return false;
  if (sniffAnimationType(buffer) !== "webp") return false;
  const view = new DataView(buffer);
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const fourcc =
      String.fromCharCode(view.getUint8(offset)) +
      String.fromCharCode(view.getUint8(offset + 1)) +
      String.fromCharCode(view.getUint8(offset + 2)) +
      String.fromCharCode(view.getUint8(offset + 3));
    if (fourcc === "ANIM") return true;
    const size = view.getUint32(offset + 4, true);
    offset += 8 + size + (size % 2);
  }
  return false;
}

/**
 * Whether a GIF buffer holds more than one image descriptor (0x2C).
 *
 * Extension blocks can contain a 0x2C byte too, so this is an approximation —
 * but it only has to answer "more than one frame?", and a false positive just
 * animates a still, which renders as its first frame anyway.
 */
export function isAnimatedGif(buffer: ArrayBuffer): boolean {
  if (sniffAnimationType(buffer) !== "gif") return false;
  const bytes = new Uint8Array(buffer);
  let count = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x2c && ++count > 1) return true;
  }
  return false;
}

/** Whether these bytes are an animation we can play on the canvas. */
export function isAnimatedBuffer(buffer: ArrayBuffer): boolean {
  return isAnimatedWebp(buffer) || isAnimatedGif(buffer);
}

/**
 * Whether an uploaded file is an animation.
 *
 * Only the head is read — enough to reach the ``ANIM`` chunk of a WebP without
 * pulling a large file into memory. GIFs need the whole buffer because the
 * second image descriptor can sit anywhere.
 */
export async function isAnimatedFile(file: File): Promise<boolean> {
  try {
    const head = await file.slice(0, 4096).arrayBuffer();
    const kind = sniffAnimationType(head);
    if (kind === "webp") return isAnimatedWebp(head);
    if (kind === "gif") return isAnimatedGif(await file.arrayBuffer());
    return false;
  } catch {
    return false;
  }
}
