"use client";

/**
 * 편집기 컴포넌트가 스토어 변경에 다시 그려지게 하는 자리 (G7-b).
 *
 * 편집기의 패널·오버레이는 거의 다 이 `observer`로 싸여 있다. 이름은 mobx에서 왔지만
 * 이제 mobx가 아니다 — 우리 엔진 스토어는 리스너 + `version` 숫자이므로(하드룰: 새
 * 런타임 의존성 0) 구독해서 버전을 읽으면 그만이다. 스톡 편집기가 사라지면서 관측할 mobx
 * 값도 같이 사라졌고, `mobx-react-lite`는 그때 함께 걷어냈다. 남은 것은 그것이 얹어
 * 주던 `memo` 한 겹이라 여기서 직접 씌운다.
 *
 * **한 겹 안에서 구독과 렌더를 같이 한다.** 감싼 컴포넌트를 자식 엘리먼트로 그리면
 * (`<Component {...props}/>`) 구독한 쪽과 읽는 쪽이 갈라진다. 그래서 자식으로 두지 않고
 * **그 자리에서 함수로 부른다**. 훅 목록이 [우리 것, …컴포넌트 것]으로 매번 같은
 * 순서라 규칙에도 맞다.
 *
 * 밖에서 신호를 주는 방법(props에 버전을 얹기)은 안 쓴다 — `memo`를 뚫으려고 컴포넌트가
 * 모르는 prop을 끼워 넣게 되고, 그게 DOM 속성으로 새면 조용한 경고가 된다.
 *
 * 왜 얼굴(`canvas-store-facade`)을 새로 만들어 내려보내지 않는가 — 그 방법도 되지만
 * 스토어의 정체성이 매번 바뀌어서, `[store]`를 의존성으로 둔 effect가 글자 한 자마다
 * 다시 붙는다(리스너 재등록, 타이머 재시작). 스토어는 그대로 두고 신호만 보낸다.
 */

import {
  createContext,
  memo,
  useContext,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";

import type { CanvasStore } from "@leviosa-ai/canvas/store";

/** 이 편집기가 그리고 있는 스토어. 하네스처럼 안 꽂는 자리도 있어 `null`을 받는다. */
export const CanvasStoreContext = createContext<CanvasStore | null>(null);

/** 스토어가 없을 때 쓰는 붙박이 구독 — 매번 새 함수를 만들면 재구독이 돈다. */
const NO_SUBSCRIBE = () => () => {};

export function useCanvasStoreVersion(): number {
  const store = useContext(CanvasStoreContext);
  return useSyncExternalStore(
    store?.subscribe ?? NO_SUBSCRIBE,
    () => store?.version ?? 0,
    () => 0,
  );
}

/**
 * 함수 컴포넌트만 받는다(`memo`·`forwardRef`로 이미 싸인 것은 그 자리에서 부를 수
 * 없다). 편집기의 `observer(function …)` 자리들이 전부 여기 해당하고, 아닌 것을
 * 넘기면 타입 단계에서 걸린다 — 조용히 다른 길로 새는 것보다 낫다.
 */
export function observer<P extends object>(
  Component: (props: P) => ReactNode,
): ComponentType<P> {
  function Reactive(props: P) {
    useCanvasStoreVersion();
    // 자식 엘리먼트로 두지 않고 그 자리에서 부른다(위 주석).
    return Component(props);
  }
  Reactive.displayName = `canvasObserver(${Component.name || "Anonymous"})`;
  // `memo`는 mobx `observer`가 얹어 주던 것이다. 빼면 부모가 다시 그려질 때마다
  // 패널 전부가 따라 그려진다 — 구독이 이미 필요한 때를 알려 주므로 그건 순손해다.
  return memo(Reactive) as ComponentType<P>;
}
