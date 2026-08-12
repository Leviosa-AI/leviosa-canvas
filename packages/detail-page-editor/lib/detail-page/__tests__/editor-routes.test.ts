import { describe, expect, it } from "vitest";

import { isDetailPageEditorPath } from "../editor-routes";

describe("isDetailPageEditorPath", () => {
  it.each([
    "/branding/detail-page-generator/editor",
    "/branding/detail-page-generator/editor?generated_id=generated-1",
    "/dev-canvas",
    "/dev-canvas?fx=cremolab",
  ])("uses full-screen editor chrome for %s", (pathname) => {
    expect(isDetailPageEditorPath(pathname)).toBe(true);
  });

  it("keeps ordinary app routes on the standard shell chrome", () => {
    expect(isDetailPageEditorPath("/branding")).toBe(false);
  });
});
