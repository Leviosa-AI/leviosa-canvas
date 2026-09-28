// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { describe, expect, it } from "vitest";

import { replaceText } from "../../../packages/detail-dom-editor-next/src";
import { fixture } from "../src/fixture";
import {
  allowedParentOrigins,
  DPNEXT_LAB_PROTOCOL,
  DPNEXT_LAB_PROTOCOL_VERSION,
  isDpnextLabChildMessage,
  isDpnextLabParentMessage,
  trustedDpnextMessage,
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

  const envelope = { protocol: DPNEXT_LAB_PROTOCOL, version: DPNEXT_LAB_PROTOCOL_VERSION, sessionNonce };

  it("requires an expected nonce instead of accepting any envelope", () => {
    const message = { ...envelope, type: "load-document", document: fixture };
    expect(isDpnextLabParentMessage(message, "")).toBe(false);
    expect(isDpnextLabChildMessage({ ...envelope, type: "ready" }, "")).toBe(false);
    expect(isDpnextLabParentMessage({ ...message, sessionNonce: undefined }, sessionNonce)).toBe(false);
  });

  it("accepts save-request from the parent and a typed dirty report from the child", () => {
    expect(isDpnextLabParentMessage({ ...envelope, type: "save-request" }, sessionNonce)).toBe(true);
    expect(isDpnextLabChildMessage({
      ...envelope, type: "dirty", dirty: true, revision: 3, sha256: "c".repeat(64),
    }, sessionNonce)).toBe(true);
    expect(isDpnextLabChildMessage({ ...envelope, type: "dirty", dirty: "yes", revision: 3, sha256: "" }, sessionNonce)).toBe(false);
  });

  it("trusts only parent origins from the allow-list", () => {
    const origins = allowedParentOrigins(
      new URLSearchParams("parentOrigins=https://studio.example, *,not a url,https://admin.example/path"),
      "http://localhost:5173",
    );
    expect(origins).toEqual(["https://studio.example"]);
    expect(allowedParentOrigins(new URLSearchParams(""), "http://localhost:5173")).toEqual(["http://localhost:5173"]);

    const data = { ...envelope, type: "save-request" };
    const expected = { source: window, origins, sessionNonce };
    expect(trustedDpnextMessage(new MessageEvent("message", { data, origin: "https://studio.example", source: window }), expected))
      .toEqual(data);
    expect(trustedDpnextMessage(new MessageEvent("message", { data, origin: "https://evil.example", source: window }), expected))
      .toBeNull();
  });
});
