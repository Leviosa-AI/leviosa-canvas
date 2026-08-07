/**
 * 캔버스 손버릇.
 *
 * Polotno의 `canvas/hotkeys`가 하던 일이다. 키 배치는 그대로 물려받는다 — 이미 쓰던
 * 사람의 손가락을 바꾸는 것이 이 관문의 목적은 아니다.
 *
 * **일부러 안 옮긴 것:** 스톡에는 `T`·`R`·`L`·`O`를 그냥 누르면 "Sample Text"와
 * 회색 네모를 꽂아 넣는 데모용 키가 있었다. 상세페이지를 고치다 캔버스에 초점이 있는
 * 채로 `T`를 누르면 영어 견본 글자가 튀어나온다는 뜻이라, 이건 안 가져온다.
 */

import type { CanvasElement, CanvasStore } from "../store";
import { bool } from "../types";
import { nudge, nudgeStep } from "../render/interaction";
import {
  alignElements,
  copyElements,
  cutElements,
  duplicateElements,
  moveElements,
  pasteElements,
  type AlignMode,
} from "./commands";

/** 글자를 치는 중이면 손버릇이 끼어들지 않는다. */
function isTyping(): boolean {
  const active =
    typeof document === "undefined" ? null : document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    (active as HTMLElement).isContentEditable === true
  );
}

const removable = (el: CanvasElement) =>
  !el.locked && bool(el, "removable", true);

const ALIGN_BY_CODE: Record<string, AlignMode> = {
  KeyA: "left",
  KeyD: "right",
  KeyH: "center",
  KeyW: "top",
  KeyS: "bottom",
  KeyV: "middle",
};

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export type HotkeyOptions = {
  /** 배율을 바꾸는 사람. 안 주면 ⌘+ / ⌘− 는 그냥 넘긴다(작업 영역이 배율을 쥔 경우). */
  setScale?: (scale: number) => void;
};

/**
 * 키 하나를 처리한다. **처리했으면 true** — 부른 쪽이 그걸로 다음 처리를 멈춘다.
 *
 * `store`만 알면 되도록 짰다. 화면 요소를 안 보므로 테스트에서 그냥 부를 수 있다.
 */
export function handleCanvasHotkey(
  event: KeyboardEvent,
  store: CanvasStore,
  options: HotkeyOptions = {},
): boolean {
  if (isTyping()) return false;

  const mod = event.ctrlKey || event.metaKey;
  const shift = event.shiftKey;
  const alt = event.altKey;
  const ids = store.selectedElementsIds;
  const done = () => {
    event.preventDefault();
    return true;
  };

  if (event.key === "Delete" || event.key === "Backspace") {
    const targets = store.selectedElements.filter(removable).map((el) => el.id);
    if (!targets.length) return false;
    store.deleteElements(targets);
    return done();
  }

  if (mod && !alt && (event.key === "z" || event.key === "Z")) {
    if (shift) store.history.redo();
    else store.history.undo();
    return done();
  }
  if (mod && !alt && (event.key === "y" || event.key === "Y")) {
    store.history.redo();
    return done();
  }

  if (mod && event.code === "KeyA") {
    const page = store.activePage;
    if (!page) return false;
    store.selectElements(
      page.children
        .filter((el) => bool(el, "selectable", true))
        .map((el) => el.id),
    );
    return done();
  }

  if (mod && event.code === "KeyC") {
    copyElements(store);
    return done();
  }
  if (mod && event.code === "KeyX") {
    cutElements(store);
    return done();
  }
  if (mod && event.code === "KeyV") {
    pasteElements(store);
    return done();
  }
  if (mod && event.code === "KeyD") {
    duplicateElements(store, ids);
    return done();
  }

  if (mod && event.code === "KeyG") {
    const first = store.selectedElements[0];
    if (first?.isContainer && ids.length === 1) store.ungroupElements([first.id]);
    else if (ids.length > 1) store.groupElements(ids);
    else return false;
    return done();
  }

  const arrow = ARROWS[event.code];
  if (arrow && !mod) {
    if (!ids.length) return false;
    const step = nudgeStep(shift);
    nudge(store, store.selectedElements, arrow[0] * step, arrow[1] * step);
    return done();
  }

  // ⌥ + 방향 글자 = 정렬. Polotno와 같은 배치(A 왼쪽 · D 오른쪽 · W 위 · S 아래).
  if (alt && !mod && ALIGN_BY_CODE[event.code]) {
    if (!ids.length) return false;
    alignElements(store, ALIGN_BY_CODE[event.code]);
    return done();
  }

  // ] 맨 앞으로 · ⌘] 한 칸 앞으로 (여는 괄호는 반대).
  if (event.code === "BracketRight") {
    if (!ids.length) return false;
    moveElements(store, ids, mod ? "up" : "top");
    return done();
  }
  if (event.code === "BracketLeft") {
    if (!ids.length) return false;
    moveElements(store, ids, mod ? "down" : "bottom");
    return done();
  }

  if (mod && (event.code === "Equal" || event.code === "Minus")) {
    const setScale = options.setScale;
    if (!setScale) return false;
    setScale(store.scale + (event.code === "Equal" ? 0.1 : -0.1));
    return done();
  }

  return false;
}
