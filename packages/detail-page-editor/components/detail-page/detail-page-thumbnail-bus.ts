"use client";

/**
 * Tiny cross-component cache for page thumbnails (data URLs), keyed by store + page id.
 *
 * The stacked workspace owns the live Konva canvases (it renders the real
 * ``<Page>`` components), so it captures thumbnails from the DOM canvas there and
 * publishes them here; the 페이지 side-panel — a sibling React subtree — subscribes
 * and reads them. We can't use ``store.toDataURL`` because this build resolves
 * ``react-konva`` against a different Konva instance than the stock editor's exporter, so
 * the exporter never finds the rendered stage (the editor itself disables
 * download for the same reason — real exports are server-side).
 */

// 캐러셀마다 `p01`부터 다시 쓰므로 page id만 키로 쓰면 다른 문서의 그림이 섞인다.
// WeakMap이면 편집기를 닫았을 때 그 문서의 data URL도 같이 버려진다.
const cache = new WeakMap<object, Map<string, string>>();
const listeners = new Set<() => void>();
let version = 0;

function entries(scope: object): Map<string, string> {
  const found = cache.get(scope);
  if (found) return found;
  const created = new Map<string, string>();
  cache.set(scope, created);
  return created;
}

export const detailPageThumbnailBus = {
  get(scope: object, id: string): string | undefined {
    return cache.get(scope)?.get(id);
  },
  set(scope: object, id: string, dataUrl: string): void {
    const scoped = entries(scope);
    if (scoped.get(id) === dataUrl) return;
    scoped.set(id, dataUrl);
    version += 1;
    listeners.forEach((l) => l());
  },
  has(scope: object, id: string): boolean {
    return cache.get(scope)?.has(id) ?? false;
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
