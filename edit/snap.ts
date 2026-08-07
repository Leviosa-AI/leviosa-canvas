/**
 * 끌 때 옆 요소에 착 붙는 자리 찾기.
 *
 * 재는 자리는 여섯이다 — 세로로 왼쪽·가운데·오른쪽, 가로로 위·가운데·아래. 페이지의
 * 네 변과 한가운데도 같은 자격으로 낀다(가운데 정렬이 제일 자주 쓰인다).
 *
 * 규칙 하나만 지킨다: **가장 가까운 한 줄에만 붙는다.** 축마다 후보를 다 붙이면
 * 요소가 두 군데로 끌려가 덜덜 떨린다.
 */

import type { Rect } from "./rect";

export type Guide = {
  /** `v`는 세로선(x가 같다), `h`는 가로선(y가 같다). */
  orientation: "v" | "h";
  /** 선이 놓이는 좌표(문서 좌표). */
  position: number;
  /** 화면에 그릴 선의 길이 — 나와 상대를 함께 덮는 구간. */
  from: number;
  to: number;
};

export type SnapResult = { dx: number; dy: number; guides: Guide[] };

const NO_SNAP: SnapResult = { dx: 0, dy: 0, guides: [] };

/** 한 축에서 재는 세 자리. */
function edges(from: number, size: number): [number, number, number] {
  return [from, from + size / 2, from + size];
}

/**
 * `moving`을 `targets`(과 페이지 테두리)에 맞춰 얼마나 밀어야 하는지.
 *
 * `tolerance`는 **화면 픽셀이 아니라 문서 좌표**다. 부르는 쪽에서 배율로 나눠 넘긴다 —
 * 축소해 놓고 볼 때 손이 조금 흔들려도 같은 느낌으로 붙어야 한다.
 */
export function snapRect(
  moving: Rect,
  targets: ReadonlyArray<Rect>,
  page: { width: number; height: number },
  tolerance: number,
): SnapResult {
  if (tolerance <= 0) return NO_SNAP;

  const pageRect: Rect = { x: 0, y: 0, width: page.width, height: page.height };
  const all = [...targets, pageRect];

  let best: {
    v?: { delta: number; position: number; from: number; to: number };
    h?: { delta: number; position: number; from: number; to: number };
  } = {};

  const movingV = edges(moving.x, moving.width);
  const movingH = edges(moving.y, moving.height);

  for (const target of all) {
    const targetV = edges(target.x, target.width);
    const targetH = edges(target.y, target.height);

    for (const mine of movingV) {
      for (const theirs of targetV) {
        const delta = theirs - mine;
        if (Math.abs(delta) > tolerance) continue;
        if (best.v && Math.abs(best.v.delta) <= Math.abs(delta)) continue;
        best = {
          ...best,
          v: {
            delta,
            position: theirs,
            from: Math.min(moving.y, target.y),
            to: Math.max(moving.y + moving.height, target.y + target.height),
          },
        };
      }
    }

    for (const mine of movingH) {
      for (const theirs of targetH) {
        const delta = theirs - mine;
        if (Math.abs(delta) > tolerance) continue;
        if (best.h && Math.abs(best.h.delta) <= Math.abs(delta)) continue;
        best = {
          ...best,
          h: {
            delta,
            position: theirs,
            from: Math.min(moving.x, target.x),
            to: Math.max(moving.x + moving.width, target.x + target.width),
          },
        };
      }
    }
  }

  const guides: Guide[] = [];
  if (best.v) {
    guides.push({
      orientation: "v",
      position: best.v.position,
      from: best.v.from,
      to: best.v.to,
    });
  }
  if (best.h) {
    guides.push({
      orientation: "h",
      position: best.h.position,
      from: best.h.from,
      to: best.h.to,
    });
  }
  return { dx: best.v?.delta ?? 0, dy: best.h?.delta ?? 0, guides };
}

/** 마퀴(끌어서 만든 상자)에 걸리는가 — 스치기만 해도 걸린다(Figma와 같다). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** 두 점으로 만든 정규화된 네모(어느 방향으로 끌든 양수 폭·높이). */
export function rectFromPoints(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Rect {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(ax - bx),
    height: Math.abs(ay - by),
  };
}
