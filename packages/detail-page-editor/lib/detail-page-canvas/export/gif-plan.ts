/**
 * Pure planning for GIF-aware raster export. When any selected section
 * (Canvas page) contains an animated GIF, the download splits into multiple
 * files inside a ZIP: contiguous still sections are stacked into one PNG, and
 * each GIF section becomes its own ``.gif`` — e.g. sections 1..16 with GIFs at
 * 4, 8, 10 produce ``1-3.png, 4.gif, 5-7.png, 8.gif, 9.png, 10.gif, 11-16.png``.
 *
 * Everything here is DOM-free so the slicing/naming is unit-testable; the canvas
 * encoding glue lives in ``gif-export.ts`` (dynamic-imported, heavy deps).
 */

import type { ExportDocument, ExportElement } from "./document-model";

/**
 * Whether a source URL alone proves the element is animated.
 *
 * **Only GIF can be judged this way.** The default output format is animated
 * WebP now, but ``.webp`` is shared by stills (references, covers, generated
 * photos) — matching on it would tag most of the library as animated. So the
 * authority is ``custom.detailPageGif``, set wherever an animation is inserted
 * (``insert-image.ts``, ``replace-with-gif.ts``); this suffix check only exists
 * to keep pre-existing GIFs and outside URLs working.
 */
export function isGifSrc(src: unknown): boolean {
  if (typeof src !== "string" || !src) return false;
  if (src.startsWith("data:image/gif")) return true;
  // Strip query/hash so presigned S3 URLs (``...x.gif?X-Amz-...``) still match.
  return /\.gif(?:[?#]|$)/i.test(src);
}

function elementIsGif(el: ExportElement): boolean {
  if (el.custom && (el.custom as { detailPageGif?: unknown }).detailPageGif) {
    return true;
  }
  return (el.type === "image" || el.type === "svg") && isGifSrc(el.src);
}

function anyGifChild(children: ExportElement[] | undefined): boolean {
  for (const el of children ?? []) {
    if (elementIsGif(el)) return true;
    if (anyGifChild(el.children)) return true;
  }
  return false;
}

/**
 * For the selected pages (in ``pageIds`` order, or document order when omitted),
 * report whether each contains at least one GIF element. The result is aligned
 * to ``pageIds`` so callers can index the two lists together.
 */
export function detectGifPages(doc: ExportDocument, pageIds?: string[]): boolean[] {
  const pages = doc.pages ?? [];
  if (!pageIds?.length) return pages.map((p) => anyGifChild(p.children));
  const byId = new Map(pages.filter((p) => p.id).map((p) => [p.id, p] as const));
  return pageIds.map((id) => anyGifChild(byId.get(id)?.children));
}

export type ExportUnit =
  | { kind: "png"; pages: number[]; label: string }
  | { kind: "gif"; page: number; label: string };

/** Zero-pad a 1-based section number to the width of the largest number. */
function label(n: number, total: number): string {
  return String(n).padStart(String(total).length, "0");
}

/**
 * Slice an ordered GIF-flag list into export units: runs of contiguous stills
 * become one stacked PNG (``start-end`` or a bare ``n`` for a single page), and
 * each GIF page stands alone. Indices are 0-based into the selected-page list;
 * labels are 1-based and zero-padded for stable filesystem ordering.
 */
export function planGifExport(isGif: boolean[]): ExportUnit[] {
  const total = isGif.length;
  const units: ExportUnit[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const start = run[0] + 1;
    const end = run[run.length - 1] + 1;
    const name = start === end ? label(start, total) : `${label(start, total)}-${label(end, total)}`;
    units.push({ kind: "png", pages: [...run], label: name });
    run = [];
  };
  for (let i = 0; i < isGif.length; i++) {
    if (isGif[i]) {
      flush();
      units.push({ kind: "gif", page: i, label: label(i + 1, total) });
    } else {
      run.push(i);
    }
  }
  flush();
  return units;
}
