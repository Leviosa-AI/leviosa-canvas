import { expect, it, vi } from "vitest";

import { loadFontFaces } from "../font-loader";

it("keeps the editor open and warns once when a bundled face does not match", async () => {
  const load = vi.fn().mockResolvedValue([]);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load, check: vi.fn(), ready: Promise.resolve() },
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const loading = loadFontFaces([
    { family: "Playfair Display", weight: 500, sample: "한글" },
  ]);
  document.head.querySelector("link")?.dispatchEvent(new Event("load"));

  await expect(loading).resolves.toBeUndefined();
  expect(load).toHaveBeenCalledWith(
    '500 16px "Playfair Display"',
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  );
  expect(warn).toHaveBeenCalledOnce();
});
