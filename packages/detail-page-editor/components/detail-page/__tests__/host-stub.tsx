/**
 * 셸 테스트용 가짜 `DetailPageHost`.
 *
 * 이전에는 테스트마다 `vi.mock("@/lib/sourcing-api", …)` 로 모듈을 통째로 갈아 끼웠다.
 * 그건 셸이 그 모듈을 **직접 부른다**는 전제 위에서만 돌아가는 방법이라, 셸을 패키지로
 * 떼는 순간 전부 못 쓰게 된다(그 경로가 소비자 앱마다 다르다).
 *
 * 여기서는 주입 지점 하나만 바꿔 끼운다. 그래서 이 파일은 앱 모듈을 하나도 안 부른다 —
 * `shell-boundary.test.ts` 가 그것을 잰다.
 *
 * 안 채운 이름은 접근할 때 `vi.fn()` 이 생긴다. 패널이 우리가 안 세운 함수를 부르면
 * "undefined is not a function" 대신 조용한 `vi.fn()` 이 응답하므로, 테스트가 재려던
 * 주장만 남고 배선 잡음은 사라진다.
 */

import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";

import {
  DetailPageHostProvider,
  type DetailPageHost,
} from "../detail-page-host-context";

function autoStub<T extends object>(overrides: Partial<T>): T {
  const made = new Map<string, unknown>();
  return new Proxy({ ...overrides } as Record<string, unknown>, {
    get(target, key) {
      // 심볼(`then` 포함)은 만들지 않는다 — 호스트가 실수로 thenable 이 되면
      // `await host` 가 영원히 안 끝난다.
      if (typeof key !== "string" || key === "then") {
        return (target as Record<string | symbol, unknown>)[key];
      }
      if (key in target) return target[key];
      if (!made.has(key)) made.set(key, vi.fn());
      return made.get(key);
    },
  }) as T;
}

/**
 * 캐시 키. 접근 경로를 그대로 배열로 만든다 —
 * `queryKeys.branding.brandAssets("b1", "gif")` → `["branding","brandAssets","b1","gif"]`.
 *
 * 앱의 진짜 `queryKeys`를 가져오면 이 파일이 앱 모듈을 부르게 되고, 그러면 경계
 * 테스트가 셸에서 새 결합을 본다. 필요한 성질은 "서로 다른 조회가 서로 다른 키를
 * 가진다" 하나뿐이라 경로를 그대로 쓰면 충분하다.
 */
function keyPath(path: string[] = []): never {
  const fn = (...args: unknown[]) => [...path, ...args];
  return new Proxy(fn, {
    get: (_target, key) => (typeof key === "string" ? keyPath([...path, key]) : undefined),
  }) as never;
}

export function stubDetailPageHost(
  overrides: {
    api?: Partial<DetailPageHost["api"]>;
    brand?: Partial<DetailPageHost["brand"]>;
    product?: Partial<DetailPageHost["product"]>;
    toast?: Partial<DetailPageHost["toast"]>;
    queryKeys?: DetailPageHost["queryKeys"];
  } = {},
): DetailPageHost {
  return {
    api: autoStub(overrides.api ?? {}),
    brand: autoStub(overrides.brand ?? {}),
    product: autoStub(overrides.product ?? {}),
    toast: autoStub(overrides.toast ?? {}),
    queryKeys: overrides.queryKeys ?? keyPath(),
  };
}

export function withDetailPageHost(
  children: ReactNode,
  overrides?: Parameters<typeof stubDetailPageHost>[0],
): ReactElement {
  return (
    <DetailPageHostProvider host={stubDetailPageHost(overrides)}>
      {children}
    </DetailPageHostProvider>
  );
}

/**
 * `render` 를 그대로 감싼 것. 반환값도 `render` 와 같되 **`rerender` 도 감싼다** —
 * 안 감싸면 두 번째 렌더에서 프로바이더가 사라져 훅이 던진다. 호스트는 같은 것을
 * 다시 쓴다(매번 새로 만들면 컨텍스트 값이 바뀌어 애먼 리렌더가 섞인다).
 */
export function renderWithDetailPageHost(
  ui: ReactNode,
  overrides?: Parameters<typeof stubDetailPageHost>[0],
) {
  const host = stubDetailPageHost(overrides);
  const wrap = (node: ReactNode) => (
    <DetailPageHostProvider host={host}>{node}</DetailPageHostProvider>
  );
  const result = render(wrap(ui));
  return {
    ...result,
    rerender: (next: ReactNode) => result.rerender(wrap(next)),
  };
}
