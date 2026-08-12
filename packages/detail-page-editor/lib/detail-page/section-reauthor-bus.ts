// 화면 재저작 요청용 초경량 pub/sub.
//
// 요청은 캔버스 옆 페이지 툴바(화면 하나에 붙어 있는 컨트롤)에서 나오고, 실제 일은
// 편집기 최상단(store·generatedId·모달을 쥔 쪽)이 한다. 그 사이에는 Canvas 워크스페이스가
// 있어 props 로 잇기 어렵다 — '내 이미지' 갱신과 같은 방식으로 모듈 레벨에서 느슨하게 잇는다.

type Listener = (pageId: string) => void;

const listeners = new Set<Listener>();
const availabilityWatchers = new Set<() => void>();

function notifyAvailability(): void {
  for (const watcher of [...availabilityWatchers]) {
    try {
      watcher();
    } catch {
      // 구독자 하나가 터져도 나머지는 받는다.
    }
  }
}

/** 재저작 요청을 구독한다. 반환된 함수로 구독 해제. */
export function onSectionReauthorRequested(listener: Listener): () => void {
  listeners.add(listener);
  notifyAvailability();
  return () => {
    listeners.delete(listener);
    notifyAvailability();
  };
}

/** 이 화면을 다시 만들어 달라고 요청한다(``pageId`` = 화면 라벨). */
export function requestSectionReauthor(pageId: string): void {
  for (const listener of [...listeners]) {
    try {
      listener(pageId);
    } catch {
      // 리스너 하나가 터져도 나머지는 받는다.
    }
  }
}

/**
 * 배선 여부 구독(``useSyncExternalStore`` 용).
 *
 * 툴바는 편집기보다 **먼저** 그려질 수 있다. 한 번 읽고 마는 헬퍼로는 배선이 끝난
 * 뒤에도 버튼이 계속 숨어 있게 된다 — 그래서 구독 가능한 형태로 낸다.
 */
export function subscribeSectionReauthorAvailability(
  watcher: () => void,
): () => void {
  availabilityWatchers.add(watcher);
  return () => {
    availabilityWatchers.delete(watcher);
  };
}

/** 지금 재저작이 배선돼 있는지. 미배선이면 툴바 버튼을 띄우지 않는다(막다른 길 방지). */
export function isSectionReauthorWired(): boolean {
  return listeners.size > 0;
}
