import { describe, expect, it } from "vitest";

import { applyPatch, type DetailDocumentV2 } from "../../detail-document-next/src";
import {
  moveBy,
  removeNode,
  replaceAsset,
  replaceSvg,
  replaceText,
  resizeTo,
  rotateTo,
} from "../src";

const document: DetailDocumentV2 = {
  schema_version: "detail-document-v2",
  document_id: "dpnd_commands",
  revision: 0,
  canvas: { width: 750 },
  sections: [{
    id: "sec",
    type: "section",
    children: [
      { id: "txt", type: "text", content: "before" },
      { id: "img", type: "image", assetId: "asset", alt: "product" },
      { id: "svg", type: "svg", svg: "<svg></svg>" },
    ],
  }],
  assets: {
    asset: { kind: "image", uri: "asset://placeholder/a", mimeType: "image/png", sha256: "a".repeat(64) },
    asset2: { kind: "image", uri: "asset://placeholder/b", mimeType: "image/png", sha256: "b".repeat(64) },
  },
};

describe("dpnext editor commands", () => {
  it("always emits detail-document-patch-v1 CAS commands", () => {
    const sha = "c".repeat(64);
    const patches = [
      replaceText(document, sha, "txt", "after"),
      moveBy(document, sha, "txt", 10, 20),
      resizeTo(document, sha, "img", 300, 400),
      rotateTo(document, sha, "img", 15),
      replaceAsset(document, sha, "img", "asset2"),
      replaceSvg(document, sha, "svg", "<svg><path d='M0 0'/></svg>"),
      removeNode(document, sha, "svg"),
    ];
    expect(patches.every((patch) =>
      patch.schema_version === "detail-document-patch-v1"
      && patch.document_id === document.document_id
      && patch.base_sha256 === sha
      && patch.operations.length === 1
    )).toBe(true);
    expect(applyPatch(document, patches[0], sha).sections[0].children?.[0].content).toBe("after");
  });
});
