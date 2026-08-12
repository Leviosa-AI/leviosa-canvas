"use client";

/**
 * Tiny cross-component cache for page thumbnails (data URLs), keyed by page id.
 *
 * The stacked workspace owns the live Konva canvases (it renders the real
 * ``<Page>`` components), so it captures thumbnails from the DOM canvas there and
 * publishes them here; the 페이지 side-panel — a sibling React subtree — subscribes
 * and reads them. We can't use ``store.toDataURL`` because this build resolves
 * ``react-konva`` against a different Konva instance than the stock editor's exporter, so
 * the exporter never finds the rendered stage (the editor itself disables
 * download for the same reason — real exports are server-side).
 */

const cache = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

export const detailPageThumbnailBus = {
  get(id: string): string | undefined {
    return cache.get(id);
  },
  set(id: string, dataUrl: string): void {
    if (cache.get(id) === dataUrl) return;
    cache.set(id, dataUrl);
    version += 1;
    listeners.forEach((l) => l());
  },
  has(id: string): boolean {
    return cache.has(id);
  },
  // Monotonic version for useSyncExternalStore — changes whenever a thumbnail lands.
  getVersion(): number {
    return version;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
