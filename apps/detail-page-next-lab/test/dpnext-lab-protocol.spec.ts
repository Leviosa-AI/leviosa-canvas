import { describe, expect, it } from "vitest";

import { replaceText } from "../../../packages/detail-dom-editor-next/src";
import { fixture } from "../src/fixture";
import {
  DPNEXT_LAB_PROTOCOL,
  DPNEXT_LAB_PROTOCOL_VERSION,
  isDpnextLabChildMessage,
  isDpnextLabParentMessage,
} from "../src/protocol";

describe("dpnext lab message protocol", () => {
  const sessionNonce = "0123456789abcdef0123456789abcdef";

  it("accepts only the versioned nonce-bound load-document envelope", () => {
    expect(isDpnextLabParentMessage({
      protocol: DPNEXT_LAB_PROTOCOL,
      version: DPNEXT_LAB_PROTOCOL_VERSION,
      sessionNonce,
      type: "load-document",
      document: fixture,
      assetUrls: { asset_product: "data:image/png;base64,AA==" },
    }, sessionNonce)).toBe(true);
    expect(isDpnextLabParentMessage({
      protocol: "legacy-canvas-message",
      version: DPNEXT_LAB_PROTOCOL_VERSION,
      sessionNonce,
      type: "load-document",
      document: fixture,
    }, sessionNonce)).toBe(false);
    expect(isDpnextLabParentMessage({
      protocol: DPNEXT_LAB_PROTOCOL,
      version: DPNEXT_LAB_PROTOCOL_VERSION,
      sessionNonce: "different-nonce-value",
      type: "load-document",
      document: fixture,
    }, sessionNonce)).toBe(false);
    expect(isDpnextLabParentMessage({
      protocol: DPNEXT_LAB_PROTOCOL,
      version: DPNEXT_LAB_PROTOCOL_VERSION,
      sessionNonce,
      type: "patch",
      document: fixture,
    }, sessionNonce)).toBe(false);
  });

  it("runtime-validates child patch, selection, and error messages", () => {
    const sha = "c".repeat(64);
    expect(isDpnextLabChildMessage({
      protocol: DPNEXT_LAB_PROTOCOL,
      version: DPNEXT_LAB_PROTOCOL_VERSION,
      sessionNonce,
      type: "selection",
      nodeIds: ["txt_title"],
    }, sessionNonce)).toBe(true);
    expect(isDpnextLabChildMessage({
      protocol: DPNEXT_LAB_PROTOCOL,
      version: DPNEXT_LAB_PROTOCOL_VERSION,
      sessionNonce,
      type: "patch",
      nodeIds: ["txt_title"],
      patch: replaceText(fixture, sha, "txt_title", "수정"),
    }, sessionNonce)).toBe(true);
    expect(isDpnextLabChildMessage({
      protocol: DPNEXT_LAB_PROTOCOL,
      version: DPNEXT_LAB_PROTOCOL_VERSION,
      sessionNonce,
      type: "error",
      message: "invalid document",
    }, sessionNonce)).toBe(true);
    expect(isDpnextLabChildMessage({
      protocol: DPNEXT_LAB_PROTOCOL,
      version: DPNEXT_LAB_PROTOCOL_VERSION,
      sessionNonce,
      type: "selection",
      nodeIds: [""],
    }, sessionNonce)).toBe(false);
  });
});
