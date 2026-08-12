// 개인 이미지·GIF 갤러리('내 이미지') 자동 갱신용 초경량 pub/sub.
//
// 생성/업로드가 성공하면 notifyPersonalImagesChanged()를 부르고, 마운트된 '내 이미지'
// 패널이 목록을 다시 불러온다. AI 생성 패널과 '내 이미지' 패널은 Canvas 사이드패널의
// 서로 다른 섹션이라 독립적으로 마운트돼 React context/props로 잇기 어렵다 → 모듈 레벨
// 이벤트로 느슨하게 연결한다.

type Listener = () => void;

const listeners = new Set<Listener>();

/** 갤러리 갱신 신호를 구독한다. 반환된 함수로 구독 해제(패널 언마운트 시 호출). */
export function onPersonalImagesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 개인 이미지·GIF가 새로 생기면(생성/업로드 성공) 호출 → 구독 중인 패널이 리로드. */
export function notifyPersonalImagesChanged(): void {
  // 리스너가 자기 자신을 해제할 수 있으므로 스냅샷을 순회한다.
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // 개별 리스너 오류는 다른 리스너에 영향 주지 않도록 무시.
    }
  }
}
