"use client";

import { useEffect } from "react";

import { safeRedo, safeUndo, type HistoryStore } from "./editor-history";
import {
  runCanvasMenuAction,
  type CanvasMenuStore,
  type MenuElement,
} from "../../lib/detail-page/canvas-menu";
import { groupAction, type GroupStore } from "../../lib/detail-page/group-action";

/**
 * Takes over the Canvas hotkeys that are broken for a document made of groups,
 * and adds the ones it never had.
 *
 * ⌘G / ⌘⇧G — the stock editor's own handler ungroups the FIRST selected element whenever it
 * happens to be a group, so shift-selecting two groups never nests them. The right
 * dispatch lives in ``lib/detail-page/group-action.ts`` (the right-click menu needs
 * the same call); here ⌘G groups whatever is selected and ⌘⇧G ungroups.
 *
 * ⌘⌥C / ⌘⌥V — 서식 복사·붙이기(``format-painter.ts``).
 *
 * ⌘Z / ⌘⇧Z / ⌘Y — see editor-history.ts: an undo with a live selection over the
 * elements being restored crashes MST. Route both through the safe wrappers.
 */

type HotkeyStore = HistoryStore &
  GroupStore &
  CanvasMenuStore & {
    activePage?: { children?: Array<{ id: string; type?: string }> };
    // ⌘C의 OS 클립보드 복사는 src까지 읽는다 — 메뉴가 보는 것보다 한 칸 넓다.
    selectedElements?: Array<MenuElement & { src?: string }>;
  };

function loadCrossOriginImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 프리사인 S3/프록시 픽셀이 캔버스를 tainting하지 않도록 CORS 익명 요청(데이터
    // URI는 불필요). export 경로와 같은 규약.
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

/** 선택된 이미지/SVG 요소의 원본 픽셀을 PNG Blob으로 렌더한다(OS 클립보드용). */
async function elementToPngBlob(src: string): Promise<Blob> {
  const img = await loadCrossOriginImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, img.naturalWidth);
  canvas.height = Math.max(1, img.naturalHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("toBlob failed");
  return blob;
}

/**
 * ⌘C(macOS) / Ctrl+C(Windows·Linux): 선택된 이미지(또는 svg 도형) 하나를 OS
 * 클립보드에 PNG Blob으로 복사해 다른 앱(슬랙/포토샵 등)에 붙여넣을 수 있게 한다.
 * Canvas 기본 복사는 편집기 내부 복제용이라 OS 클립보드로 안 나간다 — 이미지 선택
 * 시에만 가로채 blob으로 내보낸다. 플랫폼 판별은 호출부의 ``metaKey || ctrlKey``.
 *
 * async blob 생성이 사용자 제스처 창을 넘길 수 있으므로 ClipboardItem에 Blob이 아닌
 * **Promise를 넘겨** 브라우저가 제스처를 유지한 채 기다리게 한다.
 * 처리하면 true(→ 기본 동작 차단), 대상이 아니면 false.
 */
export function copySelectedImageToClipboard(store: {
  selectedElements?: Array<{ type?: string; src?: string }>;
}): boolean {
  const sel = store.selectedElements ?? [];
  if (sel.length !== 1) return false;
  const el = sel[0];
  const src = el?.src;
  if (!src || (el.type !== "image" && el.type !== "svg")) return false;
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  navigator.clipboard
    .write([new ClipboardItem({ "image/png": elementToPngBlob(src) })])
    .catch((err) => {
      // taint(CORS 미허용)나 권한 거부 시 조용히 로그만 — 크래시 방지.
      console.warn("[detail-page] 이미지 클립보드 복사 실패:", err);
    });
  return true;
}

/** Typing in a field is not a canvas shortcut. Same guard the stock editor's handler uses. */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true
  );
}

export function EditorHotkeys({ store }: { store: unknown }) {
  useEffect(() => {
    const s = store as HotkeyStore;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // ⌘⌥C / ⌘⌥V — 서식 복사·붙이기. Canva의 "서식 붓"인데, 다음 클릭 하나를 가로채는
      // 모드는 안 만든다: 드릴인·드래그·다중선택과 전부 충돌하고, 두 동작으로 나누면
      // 다중 선택에 한 번에 붙일 수 있어 오히려 빠르다.
      if (e.altKey && (e.code === "KeyC" || e.code === "KeyV") && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        runCanvasMenuAction(
          s,
          e.code === "KeyC" ? "copyFormat" : "pasteFormat",
        );
        return;
      }

      if (e.code === "KeyC" && !e.shiftKey && !e.altKey) {
        // ⌘C(Mac)·Ctrl+C(Win/Linux) 모두 여기로 온다 — 위의 mod가 metaKey||ctrlKey.
        // 이미지/도형이 선택돼 있으면 OS 클립보드로 복사(가로챔). 그 외(텍스트 선택 등)는
        // 기본/Canvas 동작에 맡긴다.
        if (copySelectedImageToClipboard(s)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (e.code === "KeyG") {
        const action = groupAction(s, e.shiftKey);
        // Always swallow ⌘G — leaving it to the stock editor's handler would ungroup the
        // first selected group even when the user asked to nest two.
        e.preventDefault();
        e.stopPropagation();
        if (!action) return;
        if (action.kind === "group") s.groupElements?.(action.ids);
        else s.ungroupElements?.(action.ids);
        return;
      }

      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const redo = key === "y" || e.shiftKey;
      e.preventDefault();
      e.stopPropagation();
      if (redo) safeRedo(s);
      else safeUndo(s);
    };

    // Capture on the document: the stock editor's handleHotkey listens here too, and this
    // has to win before it reaches the workspace.
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [store]);

  return null;
}
