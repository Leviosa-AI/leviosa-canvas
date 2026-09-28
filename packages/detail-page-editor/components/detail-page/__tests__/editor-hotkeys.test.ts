// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { afterEach, describe, expect, it, vi } from "vitest";

import { createElement } from "react";
import { fireEvent, render } from "@testing-library/react";
import { createCanvasStore } from "@leviosa-ai/canvas/store";
import { clearClipboard, pasteElements } from "@leviosa-ai/canvas/edit/commands";

import { EditorHotkeys, copySelectedImageToClipboard } from "../editor-hotkeys";
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
  it("keeps the shallowest sibling set — a drilled-into CHILD mixed with top-level loses", () => {
    expect(groupableIds(store(["g1", "g1-c0", "t1"]))).toEqual(["g1", "t1"]);
    expect(groupableIds(store([]))).toEqual([]);
  });

  it("groups siblings that share a parent group, not just page top-level", () => {
    const nested = {
      selectedElementsIds: ["a", "b"],
      pages: [
        {
          id: "p1",
          children: [
            {
              id: "outer",
              type: "group",
              children: [
                { id: "a", type: "text" },
                { id: "b", type: "group", children: [{ id: "b1" }] },
              ],
            },
          ],
        },
      ],
    };
    expect(groupableIds(nested)).toEqual(["a", "b"]);
    expect(groupAction(nested, false)).toEqual({ kind: "group", ids: ["a", "b"] });
    // 그룹 안의 그룹 하나도 ⌘⇧G 로 풀린다.
    expect(groupAction({ ...nested, selectedElementsIds: ["b"] }, true)).toEqual({
      kind: "ungroup",
      ids: ["b"],
    });
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

describe("EditorHotkeys", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearClipboard();
  });

  it("⌘S 는 브라우저 저장 대신 문서를 저장한다", () => {
    const onSave = vi.fn();
    render(createElement(EditorHotkeys, { store: {}, onSave }));
    const event = new KeyboardEvent("keydown", {
      code: "KeyS",
      key: "s",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(onSave).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("이미지 ⌘C 는 엔진 클립보드에도 넣어서 ⌘V 가 방금 복사한 것을 붙인다", () => {
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public items: unknown) {}
      },
    );
    vi.stubGlobal("navigator", {
      clipboard: { write: vi.fn().mockResolvedValue(undefined) },
    });
    const store = createCanvasStore({
      width: 800,
      height: 600,
      pages: [
        {
          id: "p1",
          children: [
            { id: "img", type: "image", src: "https://s3/x.jpg", width: 10, height: 10 },
          ],
        },
      ],
    } as never);
    store.selectElements(["img"]);
    render(createElement(EditorHotkeys, { store }));

    fireEvent.keyDown(document, { code: "KeyC", key: "c", metaKey: true });
    const made = pasteElements(store);

    expect(made).toHaveLength(1);
    expect(store.getElementById(made[0])?.src).toBe("https://s3/x.jpg");
  });
});
