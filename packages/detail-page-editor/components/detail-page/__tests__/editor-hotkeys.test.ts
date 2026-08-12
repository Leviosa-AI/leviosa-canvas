import { afterEach, describe, expect, it, vi } from "vitest";

import { copySelectedImageToClipboard } from "../editor-hotkeys";
import { groupAction, groupableIds } from "../../../lib/detail-page/group-action";

/**
 * the stock editor's own ⌘G reads only ``selectedElements[0]`` and ungroups it when it is a
 * group — so shift-selecting two groups and pressing ⌘G silently ungroups the first
 * one instead of nesting them. Ours dispatches on the whole selection.
 */
function store(selected: string[]) {
  return {
    selectedElementsIds: selected,
    history: { undo: () => {}, redo: () => {} },
    pages: [
      {
        id: "p1",
        children: [
          { id: "g1", type: "group" },
          { id: "g2", type: "group" },
          { id: "t1", type: "text" },
        ],
      },
    ],
  };
}

describe("groupableIds", () => {
  it("keeps only top-level siblings — a drilled-into group CHILD is not groupable", () => {
    expect(groupableIds(store(["g1", "g1-c0", "t1"]))).toEqual(["g1", "t1"]);
    expect(groupableIds(store([]))).toEqual([]);
  });
});

describe("groupAction", () => {
  it("GROUPS two selected groups instead of ungrouping the first", () => {
    expect(groupAction(store(["g1", "g2"]), false)).toEqual({
      kind: "group",
      ids: ["g1", "g2"],
    });
  });

  it("groups a mixed selection", () => {
    expect(groupAction(store(["g1", "t1"]), false)).toEqual({
      kind: "group",
      ids: ["g1", "t1"],
    });
  });

  it("keeps ⌘G on a lone group as the ungroup toggle people already learned", () => {
    expect(groupAction(store(["g1"]), false)).toEqual({
      kind: "ungroup",
      ids: ["g1"],
    });
  });

  it("⌘⇧G always ungroups every selected group", () => {
    expect(groupAction(store(["g1", "g2"]), true)).toEqual({
      kind: "ungroup",
      ids: ["g1", "g2"],
    });
    // Nothing to ungroup in a group-less selection.
    expect(groupAction(store(["t1"]), true)).toBeNull();
  });

  it("does nothing for a lone non-group or an empty selection", () => {
    expect(groupAction(store(["t1"]), false)).toBeNull();
    expect(groupAction(store([]), false)).toBeNull();
  });
});

describe("copySelectedImageToClipboard", () => {
  const write = vi.fn().mockResolvedValue(undefined);

  afterEach(() => {
    vi.unstubAllGlobals();
    write.mockClear();
  });

  function withClipboard() {
    vi.stubGlobal(
      "ClipboardItem",
      class {
        items: unknown;
        constructor(items: unknown) {
          this.items = items;
        }
      },
    );
    vi.stubGlobal("navigator", { clipboard: { write } });
  }

  const sel = (elements: Array<{ type?: string; src?: string }>) => ({
    selectedElements: elements,
  });

  it("copies a single selected image and swallows the shortcut", () => {
    withClipboard();
    expect(
      copySelectedImageToClipboard(sel([{ type: "image", src: "https://s3/x.jpg" }])),
    ).toBe(true);
    expect(write).toHaveBeenCalledOnce();
  });

  it("also handles a selected svg shape", () => {
    withClipboard();
    expect(
      copySelectedImageToClipboard(sel([{ type: "svg", src: "data:image/svg+xml,<svg/>" }])),
    ).toBe(true);
  });

  it("ignores text, empty, multi-select, and src-less selections", () => {
    withClipboard();
    expect(copySelectedImageToClipboard(sel([{ type: "text" }]))).toBe(false);
    expect(copySelectedImageToClipboard(sel([]))).toBe(false);
    expect(
      copySelectedImageToClipboard(
        sel([
          { type: "image", src: "a" },
          { type: "image", src: "b" },
        ]),
      ),
    ).toBe(false);
    expect(copySelectedImageToClipboard(sel([{ type: "image" }]))).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("no-ops (returns false) when the Clipboard API is unavailable", () => {
    vi.stubGlobal("ClipboardItem", undefined);
    vi.stubGlobal("navigator", {});
    expect(
      copySelectedImageToClipboard(sel([{ type: "image", src: "https://s3/x.jpg" }])),
    ).toBe(false);
  });
});
