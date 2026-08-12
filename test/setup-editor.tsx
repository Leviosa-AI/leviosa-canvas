/**
 * 편집기 셸 테스트에만 얹는 것.
 *
 * 엔진과 달리 셸은 앱 프레임워크를 peer 로 쓴다(i18n·react-query). 그 둘은 앱이
 * 꽂아 주는 것이라 테스트에서는 대역이 필요하다 — 진짜를 세우면 테스트가 번역 파일과
 * 캐시 설정에 매이고, 그건 이 패키지가 재려는 것이 아니다.
 */

import type { ReactNode } from "react";
import { vi } from "vitest";

/**
 * `t()` 는 **키를 그대로 돌려준다**.
 *
 * 이렇게 두면 테스트가 "어떤 문구가 떴는가"가 아니라 "어떤 자리가 떴는가"를 잰다.
 * 번역 문구를 고칠 때마다 테스트가 깨지지 않고, 소비자가 자기 번역을 꽂아도 그대로다.
 *
 * `defaultValue` 를 **무시하는 것이 핵심**이다. 진짜 react-i18next 는 인스턴스가 없으면
 * defaultValue 를 돌려주는데, 그러면 같은 버튼이 어떤 자리에선 키로 어떤 자리에선
 * 한국어 문구로 나와 테스트가 자리를 못 잡는다.
 */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.returnObjects) return [key];
      if (opts) {
        return Object.entries(opts).reduce((acc, [k, v]) => {
          if (k === "returnObjects" || k === "defaultValue") return acc;
          return acc.replace(`{{${k}}}`, String(v));
        }, key);
      }
      return key;
    },
    i18n: { changeLanguage: vi.fn(), language: "ko" },
  }),
  I18nextProvider: ({ children }: { children: ReactNode }) => children,
  Trans: ({ children }: { children: ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
