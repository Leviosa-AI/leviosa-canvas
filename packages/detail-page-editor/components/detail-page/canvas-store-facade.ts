import type { SelectableElement } from "./detail-page-selection";
import type { StoreLike } from "../../lib/detail-page/spec-group/sync";
import type { CanvasStore } from "@leviosa-ai/canvas/store";

/**
 * 우리 엔진 스토어를 **캔버스 위 층이 보는 얼굴**로 바꾼다 (G4).
 *
 * 표·차트(`spec-group/sync`)와 그 오버레이들은 스토어를 구조적 타입으로만 받는다 —
 * 스톡 SDK 클래스를 부르는 자리가 한 곳도 없다. 그래서 새 엔진을 물리는 일은 이식이
 * 아니라 얼굴 하나 만드는 일이다. 아래 목록이 곧 **"캔버스 위 층이 스토어에서 실제로
 * 쓰는 것 전부"**이고, G7에서 패키지 경계를 그을 때 이 목록이 그대로 계약이 된다.
 *
 * ## 왜 클래스를 그대로 안 넘기는가
 *
 * 두 가지다.
 *
 * 1. **리렌더.** 오버레이는 `observer`(mobx-react-lite)로 싸여 있고 그 안에 `React.memo`가
 *    있다. 우리 스토어는 mobx가 아니라 리스너 + `version`이라 mobx가 추적할 게 없고,
 *    props identity가 그대로면 memo가 리렌더를 막는다. 버전마다 새 얼굴을 만들면
 *    memo가 통과시킨다(`useLegacyStore`).
 * 2. **`null` vs `undefined`.** 계약은 "없으면 `undefined`"인데 우리는 `null`을 준다.
 *    여기 한 줄로 맞춘다.
 *
 * ## 왜 스프레드도 `Object.create`도 아닌가
 *
 * `{ ...store }`는 프로토타입 메서드를 전부 잃는다(우리 메서드는 전부 프로토타입에 있다).
 * `Object.create(store)`는 반대로 위험하다 — 메서드 안의 `this.selectedElementsIds = …`
 * 같은 대입이 **얼굴 쪽에 그림자 속성**을 만들어 진짜 스토어와 조용히 갈라진다.
 * 그래서 필요한 것만 손으로 적는다.
 */
export type LegacyStoreFacade = StoreLike & {
  /** 화면 배율. 줌이 바뀌면 캔버스 위 층이 상자를 다시 잰다. */
  scale: number;
  selectedElementsIds: string[];
  getElementById: (id: string) => SelectableElement | undefined;
};

export function legacyStoreFacade(store: CanvasStore): LegacyStoreFacade {
  return {
    pages: store.pages,
    activePage: store.activePage ?? undefined,
    history: store.history,
    scale: store.scale,
    selectedElementsIds: store.selectedElementsIds,
    getElementById: (id) =>
      (store.getElementById(id) as SelectableElement | null) ?? undefined,
    groupElements: (ids, attrs) => store.groupElements(ids, attrs),
    deleteElements: (ids) => store.deleteElements(ids),
    selectElements: (ids) => store.selectElements(ids),
  };
}
