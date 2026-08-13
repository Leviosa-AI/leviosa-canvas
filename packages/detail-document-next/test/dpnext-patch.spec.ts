import { describe, expect, it } from "vitest";

import { DpnextRevisionConflict, applyPatch, type DetailDocumentV2 } from "../src";

const source: DetailDocumentV2 = {
  schema_version: "detail-document-v2",
  document_id: "dpnd_patch",
  revision: 2,
  canvas: { width: 750 },
  sections: [{
    id: "sec",
    type: "section",
    children: [{ id: "txt", type: "text", content: "before" }],
  }],
  assets: {},
};

describe("dpnext patch", () => {
  it("uses revision and SHA compare-and-set", () => {
    const patched = applyPatch(source, {
      schema_version: "detail-document-patch-v1",
      document_id: "dpnd_patch",
      base_revision: 2,
      base_sha256: "a".repeat(64),
      operations: [{ op: "replace_text", node_id: "txt", value: "after" }],
    }, "a".repeat(64));
    expect(patched.revision).toBe(3);
    expect(patched.sections[0].children?.[0].content).toBe("after");
    expect(source.sections[0].children?.[0].content).toBe("before");
  });

  it("rejects a stale base", () => {
    expect(() => applyPatch(source, {
      schema_version: "detail-document-patch-v1",
      document_id: "dpnd_patch",
      base_revision: 1,
      base_sha256: "a".repeat(64),
      operations: [],
    }, "a".repeat(64))).toThrow(DpnextRevisionConflict);
  });

  it("rejects unsupported operations without advancing the source revision", () => {
    expect(() => applyPatch(source, {
      schema_version: "detail-document-patch-v1",
      document_id: "dpnd_patch",
      base_revision: 2,
      base_sha256: "a".repeat(64),
      operations: [{ op: "execute_script" } as never],
    }, "a".repeat(64))).toThrow(/unsupported patch operation/);
    expect(source.revision).toBe(2);
  });
});
