import { describe, expect, it } from "vitest";

import type { DetailDocumentV2 } from "../../detail-document-next/src";
import { exportDocumentHtml } from "../src";

describe("dpnext DOM export", () => {
  it("uses the same renderer contract for preview and export", () => {
    const document: DetailDocumentV2 = {
      schema_version: "detail-document-v2",
      document_id: "dpnd_export",
      revision: 1,
      canvas: { width: 750 },
      sections: [{ id: "sec", type: "section", children: [{ id: "txt", type: "text", content: "export me" }] }],
      assets: {},
    };
    const html = exportDocumentHtml(document, () => "data:image/png;base64,");
    expect(html).toContain('data-dpnext-document-id="dpnd_export"');
    expect(html).toContain('data-dpnext-node-id="txt"');
    expect(html).toContain("export me");
    expect(html).not.toContain("<canvas");
  });
});
