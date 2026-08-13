import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DetailDocumentV2 } from "../../detail-document-next/src";
import { DocumentRenderer } from "../src";

describe("dpnext layout renderer", () => {
  it("renders 800 nodes in one 15,000px document", () => {
    const children = Array.from({ length: 800 }, (_, index) => ({
      id: `txt_${index}`,
      type: "text" as const,
      content: `row ${index}`,
      style: { fontSize: 16 },
    }));
    const document: DetailDocumentV2 = {
      schema_version: "detail-document-v2",
      document_id: "dpnd_dom_perf",
      revision: 1,
      canvas: { width: 750 },
      sections: [{
        id: "sec_long",
        type: "section",
        layout: { mode: "stack", height: 15000 },
        children,
      }],
      assets: {},
    };
    const started = performance.now();
    const { container } = render(<DocumentRenderer document={document} />);
    const elapsed = performance.now() - started;
    expect(container.querySelectorAll("[data-dpnext-node-id]")).toHaveLength(801);
    expect(container.querySelector("[data-dpnext-node-id='sec_long']")).toHaveStyle({ height: "15000px" });
    expect(elapsed).toBeLessThan(5000);
  });
});
