# leviosa-canvas

Leviosa의 자체 편집기 엔진. Polotno를 대체하려고 직접 만들었고, `leviosa-frontend`의
상세페이지 편집기와 `leviosa-agency`가 같은 것을 쓴다.

| 패키지 | 이름 | 상태 |
|---|---|---|
| `packages/canvas` | `@leviosa-ai/canvas` | 엔진. 이 저장소가 정본이다. |
| `packages/detail-page-editor` | `@leviosa-ai/detail-page-editor` | 편집기 셸. 아직 안 옮겼다 — 앱 결합 77건을 먼저 끊는다. |

## 이 저장소가 있는 이유

경계를 **규율이 아니라 구조로** 잡기 위해서다. 엔진이 앱 저장소 안에 있는 동안에는
`@/…` 별칭으로 앱 코드를 집어 오는 일이 언제든 가능했고, 그걸 테스트가 사후에 잡았다.
여기서는 별칭 자체가 없다.

## 하드룰

1. **바깥에서 끌어오는 것은 `konva` · `react` · `react-konva` 셋뿐이다.** 이 목록이
   그대로 peerDependencies다. 여기 새 이름이 늘면 소비자 전부가 그걸 깔아야 한다.
2. **서버를 안 부른다.** `process.env` 0건, API base URL 0건. 네트워크는
   `render/svg-source.ts`의 `fetch(src)` 하나이고, 어느 서버인지는 호출부가 정한다.
3. **빌드가 없다.** TS 소스를 그대로 싣고 소비자가 `transpilePackages`로 옮겨 컴파일한다.
   dist를 만들면 소스맵·타입선언·`"use client"` 보존을 우리가 다 책임져야 하는데 얻는 게 없다.
4. **`exports`는 열거형 서브패스다.** 와일드카드를 쓰면 파일 배치 전부가 공개 계약이
   된다. 새 모듈을 밖에 열려면 매니페스트에 한 줄을 적는다 — 그 한 줄이 의식적 결정이다.

`packages/canvas/__tests__/package-boundary.test.ts`가 1·4를 CI에서 계속 잰다.

## 쓰는 법

```sh
npm i @leviosa-ai/canvas konva react-konva
```

```ts
// next.config.ts
transpilePackages: ["@leviosa-ai/canvas"]
```

```ts
import { configureCanvas } from "@leviosa-ai/canvas";
import { createCanvasStore } from "@leviosa-ai/canvas/store";

configureCanvas({ key: process.env.NEXT_PUBLIC_LEVIOSA_CANVAS_KEY });
```

사용 키는 **보호 수단이 아니라 계량기**다. 없어도 편집기는 똑같이 돌고, 우리 도메인과
localhost에서는 아예 안 묻는다. 자세한 것은 `packages/canvas/license.ts` 머리말.

## 개발

```sh
npm ci
npm test
npm run typecheck
```

소비하는 앱과 같이 고칠 때는 저장소 왕복 대신 로컬로 물린다.

```sh
npm link            # 이 저장소의 packages/canvas 에서
npm link @leviosa-ai/canvas   # 앱에서
```

## 발행

버전 태그를 밀면 GitHub Actions가 올린다. 인증은 Trusted Publishing(OIDC)이라 저장소에
npm 토큰 시크릿이 없다.

```sh
git tag canvas-v0.2.0 && git push origin canvas-v0.2.0
```

**정식 태그 전에 `-rc.N`을 먼저 올린다.** 관문 판정(G0 좌표 규약 · G4 표/차트 · G6 export
패리티)을 재는 테스트 넷은 앱 모듈에 물려 있어 `leviosa-frontend`에 남아 있다. 이 저장소
CI가 초록이어도 거기서 깨질 수 있고, rc가 그걸 발행 전에 잡는 유일한 자리다.

## 문서

설계·관문·발행 계획은 `leviosa-frontend/docs/`에 있다.

- `leviosa-canvas-plan.md` — 왜 만들었나
- `leviosa-canvas-gates.md` — G0~G9 판정 기록
- `leviosa-canvas-release.md` — 발행·이식 순서(이 저장소를 만든 결정이 §1에 있다)
