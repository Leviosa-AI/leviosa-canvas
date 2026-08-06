/**
 * Konva가 집어 준 도형에서 **문서 요소 경로**를 뽑는다(바깥 → 안).
 *
 * 우리는 요소마다 자기 Group에 요소 id를 박아 두므로, 조상들을 훑으며 스토어에 있는
 * id만 주우면 경로가 그대로 나온다. Polotno에서는 그룹에 id가 없어서 잎에서부터 좌표로
 * 거꾸로 되짚어야 했다(`element-rects.ts`가 그 일을 하던 파일이다).
 */

import type { CanvasStore } from "../store";

/** 필요한 만큼만 — 진짜 `Konva.Node`를 안 물어도 테스트할 수 있게. */
export type HitNode = {
  id(): string;
  getParent(): HitNode | null;
  getClassName?(): string;
};

/** 트랜스포머 손잡이를 눌렀는가 — 손잡이 클릭은 선택 변경이 아니다. */
export function isTransformerPart(node: HitNode | null): boolean {
  let current: HitNode | null = node;
  while (current) {
    if (current.getClassName?.() === "Transformer") return true;
    current = current.getParent();
  }
  return false;
}

/** 도형에서 위로 훑어 모은 요소 id들. 바깥이 앞이다. */
export function elementPath(node: HitNode | null, store: CanvasStore): string[] {
  const path: string[] = [];
  let current: HitNode | null = node;
  while (current) {
    const id = current.id();
    if (id && store.getElementById(id)) path.unshift(id);
    current = current.getParent();
  }
  return path;
}
