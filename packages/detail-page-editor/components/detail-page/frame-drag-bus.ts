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

/**
 * 지금 끼어들 자리. 판들이 **밀려나며** 만드는 빈칸이라, 이 값은 판을 그리는 쪽이
 * 읽어야 한다 — 위에 겹쳐 그리면 밑에 있는 판을 가릴 뿐이고 «사이가 벌어졌다»가
 * 안 된다.
 */
export type FrameInsert = {
  frameKey: string;
  /** 그 벌 안에서 몇 번째 자리인가. */
  at: number;
  /** 빈칸 높이(화면 px) — 끌고 있는 판의 높이다. */
  height: number;
  /** 넘쳐서 못 놓는 자리인가. */
  full: boolean;
} | null;

let insert: FrameInsert = null;
const listeners = new Set<() => void>();

export function setFrameInsert(next: FrameInsert): void {
  const same =
    insert === next ||
    (insert &&
      next &&
      insert.frameKey === next.frameKey &&
      insert.at === next.at &&
      insert.full === next.full &&
      insert.height === next.height);
  if (same) return;
  insert = next;
  for (const listener of [...listeners]) listener();
}

export function getFrameInsert(): FrameInsert {
  return insert;
}

export function subscribeFrameInsert(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 끌기 층이 자기를 걸어 둔다. */
export function setFrameDragStarter(fn: Starter | null): void {
  starter = fn;
}

/** 손잡이가 부른다. 층이 없으면 아무 일도 안 일어난다. */
export function startFrameDrag(pageId: string, event: React.PointerEvent): void {
  starter?.(pageId, event);
}
