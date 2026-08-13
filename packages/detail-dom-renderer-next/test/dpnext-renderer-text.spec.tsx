import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DetailDocumentV2 } from "../../detail-document-next/src";
import { DocumentRenderer } from "../src";

const document: DetailDocumentV2 = {
  schema_version: "detail-document-v2",
  document_id: "dpnd_dom_text",
  revision: 1,
  canvas: { width: 750, background: "#faf8f2" },
  sections: [{
    id: "sec_hero",
    type: "section",
    layout: { mode: "stack", gap: 24, padding: [64, 48] },
    children: [{
      id: "txt_title",
      type: "text",
      content: "피부가 편안해지는 순간",
      style: { fontSize: 52, lineHeight: 1.25, color: "#18392b" },
    }],
  }],
  assets: {},
};

describe("dpnext text renderer", () => {
  it("renders semantic DOM without canvas or Konva", () => {
    const { container } = render(<DocumentRenderer document={document} />);
    expect(screen.getByText("피부가 편안해지는 순간")).toBeInTheDocument();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-dpnext-node-id='txt_title']")).toHaveStyle({
      fontSize: "52px",
      color: "rgb(24, 57, 43)",
    });
  });
});
