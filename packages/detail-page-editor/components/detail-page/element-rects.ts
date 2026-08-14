import Konva from "konva";

/**
 * Client-space geometry for a Canvas element, read from the Konva node it
 * actually renders as (so zoom, scroll and the stacked workspace's per-page slots
 * are all baked in — nothing here re-derives layout math).
 *
 * A GROUP is measured from its children, not from a node lookup: Canvas does not
 * reliably stamp the element id onto the Konva.Group it creates, so `#<groupId>`
 * resolves to nothing. Unioning the leaf rects gives the same box and works either
 * way.
 */

export type ClientRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type RectElement = {
  id: string;
  type?: string;
  children?: RectElement[];
};

/** The rect of ONE element's own Konva node, in client (viewport) coordinates. */
export function konvaClientRect(id: string): ClientRect | null {
  for (const stage of Konva.stages) {
    const node = stage.findOne(`#${id}`);
    if (!node) continue;
    const box = node.getClientRect(); // stage px, zoom included
    if (!box.width || !box.height) return null;
    const s = stage.container().getBoundingClientRect();
    return {
      left: s.left + box.x,
      top: s.top + box.y,
      right: s.left + box.x + box.width,
      bottom: s.top + box.y + box.height,
    };
  }
  return null;
}

/**
 * 요소 **상자**의 화면 자리. `konvaClientRect`가 그려진 잉크를 재는 것과 다르다 — 누끼
 * 사진처럼 상자 안에 작게 앉은 그림은 잉크와 상자가 다르고, 자르기는 상자 좌표계에서
 * 셈하므로 상자를 그대로 받아야 한다.
 *
 * 엔진은 요소마다 자기 Group을 만들고 거기에 요소 id를 박는다(`ElementFrame`). 그래서
 * 여기서는 그 Group의 절대 변환을 그대로 읽는다 — 배율·스크롤·페이지 자리가 전부 들어
 * 있어 다시 셈할 것이 없다.
 */
export type ScreenBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** 화면 배율(문서 px → 화면 px). */
  scale: number;
  /** 도(°). 상자의 왼쪽 위를 축으로 돈다 — CSS `transform-origin: 0 0`과 같다. */
  rotation: number;
};

export function elementScreenBox(id: string): ScreenBox | null {
  for (const stage of Konva.stages) {
    const node = stage.findOne(`#${id}`);
    if (!node) continue;
    const origin = node.getAbsolutePosition();
    const scale = node.getAbsoluteScale();
    const host = stage.container().getBoundingClientRect();
    const width = node.width() * scale.x;
    const height = node.height() * scale.y;
    if (!width || !height) return null;
    return {
      left: host.left + origin.x,
      top: host.top + origin.y,
      width,
      height,
      scale: scale.x || 1,
      rotation: node.getAbsoluteRotation(),
    };
  }
  return null;
}

export function unionRect(rects: ReadonlyArray<ClientRect | null>): ClientRect | null {
  let out: ClientRect | null = null;
  for (const r of rects) {
    if (!r) continue;
    out = out
      ? {
          left: Math.min(out.left, r.left),
          top: Math.min(out.top, r.top),
          right: Math.max(out.right, r.right),
          bottom: Math.max(out.bottom, r.bottom),
        }
      : r;
  }
  return out;
}

/** Every leaf under `el` — the elements that really have a Konva node. */
export function leafIds(el: RectElement): string[] {
  const kids = el.children;
  if (!kids?.length) return [el.id];
  return kids.flatMap(leafIds);
}

/** The box of any element, group or not, in client coordinates. */
export function elementClientRect(
  el: RectElement,
  rectOf: (id: string) => ClientRect | null = konvaClientRect,
): ClientRect | null {
  return unionRect(leafIds(el).map(rectOf));
}

export function pointInRect(
  r: ClientRect | null,
  p: { x: number; y: number },
): boolean {
  if (!r) return false;
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}
