/**
 * 만든 GIF로 원본(텍스트·그룹·이미지·도형)을 **그 자리 그대로** 갈아 끼운다.
 *
 * 예전에는 결과 GIF를 페이지 가운데에 62% 폭으로 새로 얹었다. 그러면 원본은 그대로
 * 남고 GIF는 엉뚱한 크기·자리에 떨어져서, 유저가 매번 지우고 옮기고 크기를 맞춰야 했다.
 *
 * 자리 계산은 **잎 요소들의 합집합 상자**로 한다. 스톡 편집기의 group은 캔버스에서 offset을
 * 주지 않고 자식이 페이지 좌표를 그대로 들고 있어서(canvas/element.js의 group 렌더러는
 * ``<Group>``에 x/y를 안 건다), 그룹 모델에 저장된 x/y/width/height는 실제로 보이는
 * 상자와 어긋날 수 있다. 자식에서 다시 재는 게 유일하게 믿을 수 있는 값이다.
 *
 * 쌓임 순서(z-order)도 원본 자리를 따른다. ``page.addElement``는 페이지 맨 앞(children
 * 끝)에 붙이므로, 그냥 두면 GIF가 항상 모든 요소 위로 튀어나와 원본이 뒤에 깔려 있던
 * 관계가 무너진다. 그래서 넣은 뒤 ``page.setElementZIndex``로 원본이 있던 칸에 되돌린다.
 *
 * 원본이 **그룹 안**에 있었다면 GIF도 그 그룹 안 같은 칸에 넣는다(``layer-move``의
 * 재부모화). 그래야 그룹 안에서의 앞뒤가 지켜지고, 나중에 그룹을 옮길 때 GIF도 따라간다.
 */

import { locate, moveLayer } from "./layer-move";

export type ElementLike = {
  id?: string;
  type?: string;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  rotation?: unknown;
  cropX?: unknown;
  cropY?: unknown;
  cropWidth?: unknown;
  cropHeight?: unknown;
  children?: unknown;
};

export type Box = { x: number; y: number; width: number; height: number };

type PageLike = {
  id?: string;
  computedWidth?: number;
  computedHeight?: number;
  children?: unknown;
  addElement: (opts: Record<string, unknown>) => unknown;
  /** 페이지와 그룹이 공통으로 노출하는 유일한 재정렬 API(index가 클수록 앞). */
  setElementZIndex?: (id: string, index: number) => void;
};

type StoreLike = {
  activePage?: PageLike;
  pages: PageLike[];
  deleteElements?: (ids: string[]) => void;
  selectElements?: (ids: string[]) => void;
};

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 그룹이면 잎(그룹이 아닌 자식)들, 아니면 자기 자신. */
export function leafElements(els: ElementLike[]): ElementLike[] {
  const out: ElementLike[] = [];
  const walk = (el: ElementLike) => {
    const children = Array.isArray(el.children)
      ? (el.children as ElementLike[])
      : null;
    if (el.type === "group" && children && children.length > 0) {
      children.forEach(walk);
      return;
    }
    out.push(el);
  };
  els.forEach(walk);
  return out;
}

/**
 * 요소들이 실제로 차지하는 상자.
 *
 * 회전은 상자 계산에서 무시한다 — 회전한 요소는 회전값을 그대로 GIF에 물려주므로,
 * 회전 전 상자로 재는 게 맞다(회전 후 bbox로 재면 그 위에 회전을 또 걸어 커진다).
 */
export function unionBox(els: ElementLike[]): Box | null {
  const leaves = leafElements(els);
  if (leaves.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const el of leaves) {
    const x = num(el.x);
    const y = num(el.y);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + num(el.width));
    bottom = Math.max(bottom, y + num(el.height));
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/** 상자를 사방으로 ``bleed``만큼 키운다(상자 밖으로 번지는 이펙트용 여백). */
export function expandBox(box: Box, bleed: number): Box {
  const pad = Math.max(0, bleed);
  return {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
}

function pageOf(store: StoreLike, el: ElementLike): PageLike | undefined {
  const hit = (children: unknown): boolean =>
    Array.isArray(children) &&
    (children as ElementLike[]).some(
      (child) => child.id === el.id || hit(child.children),
    );
  return (
    store.pages.find((page) => hit(page.children)) ??
    store.activePage ??
    store.pages[0]
  );
}

function childList(node: PageLike | ElementLike): ElementLike[] {
  return Array.isArray(node.children) ? (node.children as ElementLike[]) : [];
}

function idOf(el: ElementLike | undefined | null): string {
  return String(el?.id ?? "");
}

/**
 * ``el``을 품고 있는 **페이지 직속 자식**의 인덱스. el 자신이 직속이면 그 인덱스다.
 *
 * 그룹 안의 요소는 페이지 children에 없으므로 조상을 타고 올라가 대표를 찾는다.
 */
function topLevelIndexOf(page: PageLike, el: ElementLike): number {
  const target = idOf(el);
  if (!target) return -1;
  const holds = (node: ElementLike): boolean =>
    idOf(node) === target || childList(node).some(holds);
  return childList(page).findIndex(holds);
}

/**
 * 갈아 끼운 뒤 GIF를 원본이 있던 페이지 칸으로 되돌린다.
 *
 * 페이지 직속 원본을 통째로 대체했으면 원본이 비운 칸에 그대로 앉는다. 그룹 안의
 * 자식만 대체한 경우엔 일단 그 그룹 바로 위에 앉히고, 이어서 그룹 안으로 넣는다.
 */
function restoreZIndex(
  page: PageLike,
  gifId: string,
  beforeIds: string[],
  anchorTopIndex: number,
): void {
  if (!page.setElementZIndex || !gifId || anchorTopIndex < 0) return;
  const survivors = new Set(childList(page).map(idOf));
  let target = 0;
  for (let i = 0; i < anchorTopIndex; i += 1) {
    if (survivors.has(beforeIds[i])) target += 1;
  }
  // 그룹은 남고 그 자식만 갈아 끼운 경우: 그룹 바로 위(원본이 그룹 안에서 그려지던 자리).
  if (survivors.has(beforeIds[anchorTopIndex])) target += 1;
  page.setElementZIndex(gifId, target);
}

export type ReplaceOptions = {
  /** 상자 밖으로 번지는 이펙트 여백(px). 텍스트 GIF가 서버에 넘긴 값과 같아야 한다. */
  bleed?: number;
  /** 원본이 사진 하나였다면 그 자르기(crop)를 물려받아 프레이밍을 유지한다. */
  inheritCrop?: boolean;
};

/**
 * ``els``를 지우고 그 자리에 GIF 이미지 요소를 넣는다. 넣은 요소를 돌려준다.
 *
 * 상자를 못 재면(요소가 없거나 좌표가 이상하면) 아무것도 지우지 않고 null을 돌려준다 —
 * 원본을 날린 뒤 대체에 실패하는 게 제일 나쁘다.
 */
export function replaceWithGif(
  store: unknown,
  els: ElementLike[],
  src: string,
  options: ReplaceOptions = {},
): unknown {
  const s = store as StoreLike;
  if (!src || els.length === 0) return null;
  const inner = unionBox(els);
  if (!inner) return null;
  const box = expandBox(inner, options.bleed ?? 0);
  const page = pageOf(s, els[0]) ?? s.activePage ?? s.pages[0];
  if (!page) return null;

  const single = els.length === 1 ? els[0] : null;
  const rotation = num(single?.rotation, 0);
  const crop: Record<string, number> = {};
  if (options.inheritCrop && single?.type === "image") {
    // 스톡 편집기는 이미지를 cover-crop으로 채운다. 원본이 잘려 있었다면 그 자르기를
    // 그대로 물려줘야 프레이밍이 안 바뀐다.
    for (const key of ["cropX", "cropY", "cropWidth", "cropHeight"] as const) {
      const value = single[key];
      if (typeof value === "number" && Number.isFinite(value)) crop[key] = value;
    }
  }

  const ids = els.map((el) => String(el.id ?? "")).filter(Boolean);
  // 원본이 페이지 몇 번째 칸에 있었는지 지우기 전에 재둔다. 여럿을 대체할 때는 가장
  // 앞(위)에 있던 것을 기준으로 삼는다 — 그것들이 덮고 있던 것을 GIF도 덮어야 한다.
  const beforeIds = childList(page).map(idOf);
  const anchorTopIndex = els.reduce(
    (top, el) => Math.max(top, topLevelIndexOf(page, el)),
    -1,
  );
  // 하나짜리 원본이 그룹 안에 있었다면 그 그룹의 같은 칸으로 돌려보낸다.
  const nest = els.length === 1 ? locate(page, idOf(els[0])) : null;
  const nestInto =
    nest?.parent && idOf(nest.parent) !== idOf(els[0])
      ? { parentId: idOf(nest.parent), index: nest.index }
      : null;
  const added = page.addElement({
    type: "image",
    src,
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
    ...(rotation ? { rotation } : {}),
    ...crop,
    // 레이어 트리에서 "image-2" 대신 "GIF"로 보이게 하고, 내보내기가 이 섹션을
    // 애니메이션으로 다루도록 표시한다.
    name: "GIF",
    custom: { detailPageGif: true },
  });
  if (ids.length > 0) s.deleteElements?.(ids);
  const gifId = idOf(added as ElementLike);
  restoreZIndex(page, gifId, beforeIds, anchorTopIndex);
  if (nestInto && gifId) {
    // 그룹이 자식 하나로 사라졌을 수도 있다. 그때는 페이지 칸(위에서 되돌린 자리)이 답.
    moveLayer(s, gifId, nestInto);
  }
  return added;
}
