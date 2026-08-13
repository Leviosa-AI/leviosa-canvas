import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DetailDocumentV2 } from "../../detail-document-next/src";
import { CoordinateSpace, EditorSurface, nextSelection, snap } from "../src";

const document: DetailDocumentV2 = {
  schema_version: "detail-document-v2",
  document_id: "dpnd_selection",
  revision: 0,
  canvas: { width: 750 },
  sections: [{
    id: "sec",
    type: "section",
    children: [
      { id: "one", type: "text", content: "one" },
      { id: "two", type: "text", content: "two" },
    ],
  }],
  assets: {},
};

describe("dpnext editor selection", () => {
  it("maps zoomed coordinates and snaps to nearby guides", () => {
    const space = new CoordinateSpace({ zoom: 2, panX: 20, panY: 10, surfaceLeft: 100, surfaceTop: 50 });
    expect(space.clientToDocument(140, 100)).toEqual({ x: 10, y: 20 });
    expect(space.documentToClient(10, 20)).toEqual({ x: 140, y: 100 });
    expect(snap(97, [100])).toBe(100);
    expect(nextSelection(["one"], "two", true)).toEqual(["one", "two"]);
  });

  it("supports single and shift multi-selection over DOM nodes", () => {
    const changed = vi.fn();
    render(<EditorSurface document={document} onSelectionChange={changed} />);
    fireEvent.click(screen.getByText("one"));
    expect(globalThis.document.querySelector("[data-dpnext-selection-overlay]")).not.toBeNull();
    fireEvent.click(screen.getByText("two"), { shiftKey: true });
    expect(changed).toHaveBeenLastCalledWith(["one", "two"]);
    expect(screen.getByLabelText("선택된 레이어")).toHaveTextContent("one,two");
  });
});
