import { describe, expect, it, vi } from "vitest";

import { detailPageThumbnailBus as bus } from "../detail-page-thumbnail-bus";

describe("detailPageThumbnailBus", () => {
  it("stores and returns a thumbnail by page id", () => {
    expect(bus.has("p-store")).toBe(false);
    bus.set("p-store", "data:url-1");
    expect(bus.get("p-store")).toBe("data:url-1");
    expect(bus.has("p-store")).toBe(true);
  });

  it("bumps the version when a new thumbnail lands", () => {
    const before = bus.getVersion();
    bus.set("p-version", "data:url-2");
    expect(bus.getVersion()).toBe(before + 1);
  });

  it("does not bump the version when setting an identical value", () => {
    bus.set("p-same", "data:url-3");
    const after = bus.getVersion();
    bus.set("p-same", "data:url-3");
    expect(bus.getVersion()).toBe(after);
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    bus.set("p-sub", "data:url-4");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.set("p-sub", "data:url-5");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
