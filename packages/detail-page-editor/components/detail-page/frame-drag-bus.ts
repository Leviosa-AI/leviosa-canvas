/**
 * 손잡이와 끌기 층을 잇는 한 줄.
 *
 * 손잡이는 **판 상자 안**에 그려진다(엔진의 판 위 슬롯). 끌리는 동안 보이는 것들은
 * 모든 판 **위**에 뜬 층이 그린다. 둘은 트리에서 멀리 떨어져 있는데, 그 사이로
 * props 를 나르자고 여러 겹을 뚫는 것보다 이 한 줄이 싸다 — 이 저장소가 썸네일과
 * 화면 다시 만들기를 잇는 방식과 같다.
 */

type Starter = (pageId: string, event: React.PointerEvent) => void;

let starter: Starter | null = null;

/** 끌기 층이 자기를 걸어 둔다. */
export function setFrameDragStarter(fn: Starter | null): void {
  starter = fn;
}

/** 손잡이가 부른다. 층이 없으면 아무 일도 안 일어난다. */
export function startFrameDrag(pageId: string, event: React.PointerEvent): void {
  starter?.(pageId, event);
}
