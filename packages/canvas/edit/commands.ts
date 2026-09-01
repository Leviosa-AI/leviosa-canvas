/**
 * 문서를 고치는 명령들 — 정렬·순서·복제·클립보드.
 *
 * 손버릇(`hotkeys.ts`)도, 우클릭 메뉴도, 우측 패널의 버튼도 결국 여기로 들어온다.
 * 화면을 모르는 순수 문서 조작이라 브라우저 없이도 테스트가 된다.
 */

import type { CanvasElement, CanvasPage, CanvasStore } from "../store";
import { withFreshIds } from "../store";
import type { ElementJson, PageJson } from "../types";
import { createId } from "../types";
import { frameInsertIndex, FRAME_KEY } from "../render/frames";
import { applyInTransaction } from "../render/interaction";
import { elementRect, moveElementTo, unionRect } from "./rect";

// ---------------------------------------------------------------------------
// 정렬
// ---------------------------------------------------------------------------

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

/**
 * 고른 것들을 맞춰 세운다.
 *
 * **하나만 골랐으면 페이지가 기준이고, 여럿이면 고른 것들의 바깥 네모가 기준이다.**
 * 이건 Canvas·Figma·Canva가 모두 같은 손버릇이라 그대로 따른다 — 하나짜리 선택에
 * 자기 자신을 기준으로 맞추면 아무 일도 안 일어나서 고장으로 보인다.
 */
export function alignElements(store: CanvasStore, mode: AlignMode): void {
  const selected = store.selectedElements;
  // 기준 네모는 **고른 것 전부**로 잡고, 실제로 움직이는 것은 안 잠긴 것뿐이다.
  // 잠긴 것을 기준에서까지 빼면 "둘을 골라 왼쪽 맞춤"이 갑자기 페이지 기준으로 바뀐다.
  const els = selected.filter((el) => !el.locked);
  if (!els.length) return;
  const page = store.getPageOfElement(selected[0].id) ?? store.activePage;
  if (!page) return;

  const bounds = unionRect(selected.map((el) => elementRect(el)));
  if (!bounds) return;
  const rects = els.map((el) => elementRect(el));
  const alone = selected.length === 1;
  const pageBox = { x: 0, y: 0, width: page.width, height: page.height };
  const frame = alone ? pageBox : bounds;

  applyInTransaction(store, () => {
    els.forEach((el, i) => {
      const rect = rects[i];
      switch (mode) {
        case "left":
          moveElementTo(el, frame.x, rect.y);
          break;
        case "right":
          moveElementTo(el, frame.x + frame.width - rect.width, rect.y);
          break;
        case "center":
          moveElementTo(
            el,
            frame.x + (frame.width - rect.width) / 2,
            rect.y,
          );
          break;
        case "top":
          moveElementTo(el, rect.x, frame.y);
          break;
        case "bottom":
          moveElementTo(el, rect.x, frame.y + frame.height - rect.height);
          break;
        case "middle":
          moveElementTo(
            el,
            rect.x,
            frame.y + (frame.height - rect.height) / 2,
          );
          break;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 순서
// ---------------------------------------------------------------------------

export type OrderMove = "up" | "down" | "top" | "bottom";

/**
 * 앞뒤 순서를 바꾼다.
 *
 * **부모 안에서** 움직인다는 점이 중요하다. 스톡 편집기의 `page.moveElementsUp`은 페이지
 * 자식만 훑어서 그룹 안 요소에는 아무 일도 안 했다(조용히). 여기서는 각 요소의 부모를
 * 찾아 그 안에서 옮긴다.
 *
 * 위로 올리는 것은 뒤에서부터 처리해야 한다 — 앞에서부터 올리면 먼저 올라간 것이
 * 다음 것에 밀려 제자리로 돌아온다.
 */
export function moveElements(
  store: CanvasStore,
  ids: ReadonlyArray<string>,
  move: OrderMove,
): void {
  const els = ids
    .map((id) => store.getElementById(id))
    .filter((el): el is CanvasElement => el !== null && el.parent !== null);
  if (!els.length) return;
  const ordered = move === "up" || move === "top" ? [...els].reverse() : els;

  applyInTransaction(store, () => {
    for (const el of ordered) {
      const parent = el.parent;
      if (!parent) continue;
      const last = parent.children.length - 1;
      const at = parent.children.indexOf(el);
      const to =
        move === "up"
          ? Math.min(last, at + 1)
          : move === "down"
            ? Math.max(0, at - 1)
            : move === "top"
              ? last
              : 0;
      parent.setElementZIndex(el.id, to);
    }
  });
}

// ---------------------------------------------------------------------------
// 복제
// ---------------------------------------------------------------------------

/**
 * 고른 것들을 제자리 옆에 복제하고 선택을 복제본으로 옮긴다.
 *
 * `offset`은 화면에서 겹쳐 보이지 않게 살짝 밀어 두는 값이다. ⌥끌기 복제는 끌기가
 * 곧 자리를 정하므로 0으로 부른다.
 */
export function duplicateElements(
  store: CanvasStore,
  ids: ReadonlyArray<string>,
  offset = 10,
): string[] {
  const els = ids
    .map((id) => store.getElementById(id))
    .filter((el): el is CanvasElement => el !== null && el.parent !== null);
  if (!els.length) return [];
  const made: string[] = [];
  applyInTransaction(store, () => {
    for (const el of els) {
      const copy = el.clone(
        offset
          ? { x: (el.x ?? 0) + offset, y: (el.y ?? 0) + offset }
          : undefined,
        { skipSelect: true },
      );
      if (copy) made.push(copy.id);
    }
  });
  if (made.length) store.selectElements(made);
  return made;
}

// ---------------------------------------------------------------------------
// 클립보드
// ---------------------------------------------------------------------------

const STORAGE_KEY = "leviosa_canvas_clipboard";

type Clip = { data: ElementJson[]; pageId: string };

let memory: Clip = { data: [], pageId: "" };

/**
 * 붙여넣기 자리는 브라우저 클립보드가 아니라 우리 것이다.
 *
 * 시스템 클립보드에는 요소 트리를 담을 자리가 없다(텍스트뿐이다). 대신 `localStorage`에
 * 같이 적어 두면 **탭이 달라도** 붙는다 — 편집기를 두 개 띄워 놓고 옮기는 일이 실제로
 * 있다. 저장이 막힌 환경(사파리 프라이빗)에서는 조용히 메모리만 쓴다.
 */
function writeClip(clip: Clip): void {
  memory = clip;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clip));
  } catch {
    // 저장이 막혀 있으면 이 탭 안에서만 산다.
  }
}

function readClip(): Clip {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Clip;
      if (Array.isArray(parsed?.data)) return parsed;
    }
  } catch {
    // 못 읽으면 메모리 것을 쓴다.
  }
  return memory;
}

export function isClipboardEmpty(): boolean {
  return readClip().data.length === 0;
}

/** 테스트가 앞선 시험의 찌꺼기를 안 물려받게 하는 자리. */
export function clearClipboard(): void {
  memory = { data: [], pageId: "" };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 지울 수 없으면 메모리만 비운다.
  }
}

export function copyElements(store: CanvasStore): void {
  const els = store.selectedElements;
  if (!els.length) return;
  writeClip({
    data: els.map((el) => el.toJSON()),
    pageId: store.activePage?.id ?? "",
  });
}

export function cutElements(store: CanvasStore): void {
  const els = store.selectedElements;
  if (!els.length) return;
  copyElements(store);
  store.deleteElements(els.map((el) => el.id));
}

/**
 * 붙여넣는다. **같은 페이지면 살짝 어긋나게** 놓는다 — 정확히 겹쳐 놓으면 붙었는지
 * 아닌지 화면으로 알 수가 없다.
 */
export function pasteElements(store: CanvasStore): string[] {
  const page = store.activePage;
  if (!page) return [];
  const clip = readClip();
  if (!clip.data.length) return [];
  const shift = clip.pageId === page.id ? Math.round(store.width / 20) : 0;

  const made: string[] = [];
  applyInTransaction(store, () => {
    for (const json of clip.data) {
      const fresh = withFreshIds(json);
      if (shift) {
        fresh.x = (typeof fresh.x === "number" ? fresh.x : 0) + shift;
        fresh.y = (typeof fresh.y === "number" ? fresh.y : 0) + shift;
      }
      made.push(page.addElement(fresh).id);
    }
  });
  // 다음 붙여넣기는 방금 놓은 자리에서 또 어긋나야 한다(계단처럼 쌓인다).
  writeClip({
    data: made
      .map((id) => store.getElementById(id))
      .filter((el): el is CanvasElement => el !== null)
      .map((el) => el.toJSON()),
    pageId: page.id,
  });
  store.selectElements(made);
  return made;
}

// ---------------------------------------------------------------------------
// 벌 사이로 판 옮기기
// ---------------------------------------------------------------------------

/**
 * 판 한 장을 다른 벌로 **베껴 넣는다.**
 *
 * 원본은 그대로 둔다. 끌어온 쪽은 참고로 열어 둔 벌이고, 거기서 한 장을 빼면 견줄
 * 것이 줄어든다 — 고르는 일이 끝나기 전에 재료를 없애는 셈이다.
 *
 * 판·요소의 id 는 전부 새로 딴다. 문서 안에서 id 는 유일해야 하고, 서버가 저장할 때
 * 그것부터 본다.
 *
 * @param at 그 벌 안에서의 자리(0 이면 맨 앞, 길이와 같으면 맨 뒤).
 * @returns 새로 놓인 판. 원본이 없으면 `null`.
 */
export function copyPageToFrame(
  store: CanvasStore,
  pageId: string,
  frameKey: string,
  at: number,
): CanvasPage | null {
  const source = store.getPageById(pageId);
  if (!source) return null;

  const json = source.toJSON();
  const custom = { ...(json.custom as Record<string, unknown> | undefined) };
  custom[FRAME_KEY] = frameKey;

  const copy: PageJson = {
    ...json,
    id: createId("pg"),
    custom,
    children: (Array.isArray(json.children) ? json.children : []).map((child) =>
      withFreshIds(child as ElementJson),
    ),
  };

  // 자리는 **넣기 전에** 잰다. 넣고 나면 그 판 자신이 셈에 끼어든다.
  const index = frameInsertIndex(store.pages, frameKey, at);
  let made: CanvasPage | null = null;
  applyInTransaction(store, () => {
    made = store.addPage(copy, index);
  });
  // 방금 놓은 자리를 보여 준다 — 끌어다 놓고 어디 갔는지 찾게 하지 않는다.
  if (made) store.selectPage((made as CanvasPage).id);
  return made;
}
