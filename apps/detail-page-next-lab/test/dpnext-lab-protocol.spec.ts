import { describe, expect, it } from "vitest";

import { fixture } from "../src/fixture";
import { DPNEXT_LAB_PROTOCOL, isDpnextLabParentMessage } from "../src/protocol";

describe("dpnext lab message protocol", () => {
  it("accepts only the versioned load-document envelope", () => {
    expect(isDpnextLabParentMessage({
      protocol: DPNEXT_LAB_PROTOCOL,
      type: "load-document",
      document: fixture,
      assetUrls: { asset_product: "data:image/png;base64,AA==" },
    })).toBe(true);
    expect(isDpnextLabParentMessage({
      protocol: "legacy-canvas-message",
      type: "load-document",
      document: fixture,
    })).toBe(false);
    expect(isDpnextLabParentMessage({
      protocol: DPNEXT_LAB_PROTOCOL,
      type: "patch",
      document: fixture,
    })).toBe(false);
  });
});
