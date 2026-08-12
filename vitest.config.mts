import { defineConfig } from "vitest/config";

/**
 * 패키지 둘은 필요한 환경이 다르다.
 *
 * 엔진(`packages/canvas`)은 앱 프레임워크를 하나도 안 부른다 — 그게 그 패키지가 따로 설
 * 수 있는 이유이고, `test/setup.ts` 가 자라지 않는 것이 그 증거다. 편집기 셸
 * (`packages/detail-page-editor`)은 다르다. i18n 과 react-query 를 peer 로 쓰므로
 * 목이 필요하다.
 *
 * 그래서 setup 을 한 파일에 합치지 않고 프로젝트로 가른다. 합쳤으면 엔진 setup 에
 * i18n 목이 얹혔을 것이고, "엔진은 프레임워크를 안 부른다"는 신호가 그 자리에서
 * 사라진다.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "canvas",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./test/setup.ts"],
          include: ["packages/canvas/**/*.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "detail-page-editor",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./test/setup.ts", "./test/setup-editor.tsx"],
          include: [
            "packages/detail-page-editor/**/*.test.{ts,tsx}",
            "test/detail-page-editor-*.test.ts",
          ],
        },
      },
    ],
    pool: "forks",
  },
});
