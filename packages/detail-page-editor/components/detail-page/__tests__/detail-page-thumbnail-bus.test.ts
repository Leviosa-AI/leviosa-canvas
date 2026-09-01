import { describe, expect, it, vi } from "vitest";

import { detailPageThumbnailBus as bus } from "../detail-page-thumbnail-bus";

describe("detailPageThumbnailBus", () => {
  const scope = {};

  it("stores and returns a thumbnail by page id", () => {
    expect(bus.has(scope, "p-store")).toBe(false);
    bus.set(scope, "p-store", "data:url-1");
    expect(bus.get(scope, "p-store")).toBe("data:url-1");
    expect(bus.has(scope, "p-store")).toBe(true);
  });

  it("does not mix identical page ids from different documents", () => {
    const other = {};
    bus.set(scope, "p01", "data:first");
    bus.set(other, "p01", "data:second");

    expect(bus.get(scope, "p01")).toBe("data:first");
    expect(bus.get(other, "p01")).toBe("data:second");
  });

  it("bumps the version when a new thumbnail lands", () => {
    const before = bus.getVersion();
    bus.set(scope, "p-version", "data:url-2");
    expect(bus.getVersion()).toBe(before + 1);
  });

  it("does not bump the version when setting an identical value", () => {
    bus.set(scope, "p-same", "data:url-3");
    const after = bus.getVersion();
    bus.set(scope, "p-same", "data:url-3");
    expect(bus.getVersion()).toBe(after);
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    bus.set(scope, "p-sub", "data:url-4");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.set(scope, "p-sub", "data:url-5");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
