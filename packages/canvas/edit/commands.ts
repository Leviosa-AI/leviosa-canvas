// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
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
import { loadImage } from "../render/image-cache";
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

/**
 * 클립보드에는 **페이지 좌표**로 적는다. 그룹 안에서 복사해 밖(또는 다른 그룹)에
 * 붙여도 눈에 보이던 자리에 놓이게 — 붙일 때 들어갈 컨테이너 기준으로 되돌린다.
 */
export function copyElements(store: CanvasStore): void {
  const els = store.selectedElements;
  if (!els.length) return;
  writeClip({
    data: els.map((el) => ({ ...el.toJSON(), ...el.absolutePosition })),
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
 * 붙일 자리 — 들어가 있는 그룹(`scopeId`)이 이 페이지에 있으면 그 안, 아니면 페이지.
 * `origin`은 그 컨테이너의 페이지 좌표 원점이다(페이지면 0,0).
 */
function pasteTarget(
  store: CanvasStore,
  page: CanvasPage,
  scopeId?: string | null,
): { into: CanvasPage | CanvasElement; origin: { x: number; y: number } } {
  const scope = scopeId ? store.getElementById(scopeId) : null;
  if (scope?.isContainer && store.getPageOfElement(scope.id) === page) {
    // ponytail: 돌린 그룹 안에는 회전을 안 풀고 x/y만 뺀다 — 돌린 그룹에 붙이는 일이 흔해지면 역회전을 넣는다.
    return { into: scope, origin: scope.absolutePosition };
  }
  return { into: page, origin: { x: 0, y: 0 } };
}

/**
 * 붙여넣는다. **같은 페이지면 살짝 어긋나게** 놓는다 — 정확히 겹쳐 놓으면 붙었는지
 * 아닌지 화면으로 알 수가 없다.
 *
 * `scopeId`를 주면(더블클릭으로 들어간 그룹) 그 그룹 안에 붙인다.
 */
export function pasteElements(
  store: CanvasStore,
  scopeId?: string | null,
): string[] {
  const page = store.activePage;
  if (!page) return [];
  const clip = readClip();
  if (!clip.data.length) return [];
  const shift = clip.pageId === page.id ? Math.round(store.width / 20) : 0;
  const { into, origin } = pasteTarget(store, page, scopeId);

  const made: string[] = [];
  applyInTransaction(store, () => {
    for (const json of clip.data) {
      const fresh = withFreshIds(json);
      fresh.x = (typeof fresh.x === "number" ? fresh.x : 0) + shift - origin.x;
      fresh.y = (typeof fresh.y === "number" ? fresh.y : 0) + shift - origin.y;
      const el = into.addElement(fresh);
      if (el) made.push(el.id);
    }
  });
  // 다음 붙여넣기는 방금 놓은 자리에서 또 어긋나야 한다(계단처럼 쌓인다).
  writeClip({
    data: made
      .map((id) => store.getElementById(id))
      .filter((el): el is CanvasElement => el !== null)
      .map((el) => ({ ...el.toJSON(), ...el.absolutePosition })),
    pageId: page.id,
  });
  store.selectElements(made);
  return made;
}

/**
 * 바깥(OS 클립보드·파일)에서 온 것을 붙인다 — 그림 파일은 `image`, 글자는 `text`.
 *
 * 셸이 `window`의 `paste` 이벤트에서 `clipboardData.files`·`getData("text/plain")`을
 * 꺼내 부른다. 그림 주소는 `URL.createObjectURL`이라 **이 탭에서만 산다** — 저장하기
 * 전에 셸이 올려서 `src`를 갈아 끼워야 한다.
 *
 * 그림은 원래 크기로 놓되 페이지의 80%를 넘으면 줄이고, 페이지 가운데에 둔다.
 */
export async function pasteExternal(
  store: CanvasStore,
  input: { files?: ArrayLike<File>; text?: string },
  scopeId?: string | null,
): Promise<string[]> {
  const page = store.activePage;
  if (!page) return [];
  const images = Array.from(input.files ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
  // 그림을 복사하면 브라우저가 파일 이름·주소를 글자로도 같이 싣는다 — 그림이 있으면 글자는 버린다.
  const text = images.length ? "" : (input.text ?? "").trim();
  if (!images.length && !text) return [];

  const W = page.width;
  const H = page.height;
  const sized = await Promise.all(
    images.map(async (file) => {
      const src = URL.createObjectURL(file);
      const img = await loadImage(src);
      const w = img?.naturalWidth || 300;
      const h = img?.naturalHeight || 300;
      const k = Math.min(1, (W * 0.8) / w, (H * 0.8) / h);
      return { src, width: w * k, height: h * k };
    }),
  );

  const { into, origin } = pasteTarget(store, page, scopeId);
  const jsons: ElementJson[] = sized.map((one) => ({
    type: "image",
    src: one.src,
    x: (W - one.width) / 2 - origin.x,
    y: (H - one.height) / 2 - origin.y,
    width: one.width,
    height: one.height,
  }));
  if (text) {
    const fontSize = 32;
    const width = W * 0.6;
    const height = fontSize * 1.4 * text.split("\n").length;
    jsons.push({
      type: "text",
      text,
      fontSize,
      x: (W - width) / 2 - origin.x,
      y: (H - height) / 2 - origin.y,
      width,
      height,
    });
  }

  const made: string[] = [];
  applyInTransaction(store, () => {
    for (const json of jsons) {
      const el = into.addElement(json);
      if (el) made.push(el.id);
    }
  });
  store.selectElements(made);
  return made;
}

// ---------------------------------------------------------------------------
// 뒤집기·잠금·숨김
// ---------------------------------------------------------------------------

/** 고른 것을 좌우(`flipX`)·상하(`flipY`)로 뒤집는다. 잠긴 것은 건너뛴다. */
export function flipElements(store: CanvasStore, axis: "x" | "y"): boolean {
  const els = store.selectedElements.filter((el) => !el.locked);
  if (!els.length) return false;
  const key = axis === "x" ? "flipX" : "flipY";
  applyInTransaction(store, () => {
    for (const el of els) el.set({ [key]: el[key] !== true });
  });
  return true;
}

/**
 * 고른 것 중 **하나라도 안 잠겼으면 전부 잠그고**, 전부 잠겼으면 전부 푼다.
 * 섞인 선택에서 하나씩 뒤집으면 누를 때마다 상태가 엇갈려 손이 헷갈린다.
 */
export function toggleLock(store: CanvasStore): boolean {
  const els = store.selectedElements;
  if (!els.length) return false;
  const locked = els.some((el) => !el.locked);
  applyInTransaction(store, () => {
    for (const el of els) el.set({ locked });
  });
  return true;
}

/** 숨김도 같은 규칙 — 하나라도 보이면 전부 숨기고, 전부 숨었으면 전부 보인다. */
export function toggleVisible(store: CanvasStore): boolean {
  const els = store.selectedElements;
  if (!els.length) return false;
  const visible = els.every((el) => el.visible === false);
  applyInTransaction(store, () => {
    for (const el of els) el.set({ visible });
  });
  return true;
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
export function movePageToFrame(
  store: CanvasStore,
  pageId: string,
  frameKey: string,
  at: number,
  /** 원본을 남긴다(⌥ 끌기). 기본은 옮기기다. */
  clone = false,
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
    if (!clone) store.deletePages([pageId]);
  });
  // 방금 놓은 자리를 보여 준다 — 끌어다 놓고 어디 갔는지 찾게 하지 않는다.
  if (made) store.selectPage((made as CanvasPage).id);
  return made;
}
