# AGENTS.md

## 이 저장소의 전제

`README.md`의 하드룰 네 개가 이 저장소의 존재 이유다. 특히 **바깥 의존을 늘리지 말 것** —
`konva`·`react`·`react-konva` 말고 무엇이든 import하면 `package-boundary.test.ts`가 죽는다.
그 테스트를 고쳐서 통과시키는 것은 거의 언제나 틀린 답이다.

## 새 모듈을 밖에 열 때

`packages/canvas/package.json`의 `exports`에 한 줄을 적는다. 안 적으면 소비자가
`Cannot find module`을 본다 — 그리고 그건 우리 CI가 아니라 **소비자 앱 빌드**에서 터진다.

## 테스트

```sh
npm test          # vitest, jsdom
npm run typecheck
```

Konva가 jsdom에서 글자를 재려면 `canvas`(node-gyp) devDependency가 필요하다. 런타임
의존이 아니라 테스트 환경 의존이다 — 하드룰 1과 안 부딪힌다.

**여기 없는 테스트가 있다.** 관문 판정 넷(G0 좌표 규약 · G4 표/차트 · G6 export 패리티)과
원본 대조는 앱 모듈을 부르므로 `leviosa-frontend`에 남아 있다. 엔진을 크게 고쳤으면
이 저장소 CI 초록만 믿지 말고 `-rc.N`으로 올려 거기서 돌린다.

## 커밋·PR

- 커밋 제목은 한국어, `type(scope): 무엇을 했다` 꼴.
- PR 본문 마지막 비어 있지 않은 줄에 `by Max Kim (Dindb-dong)` 한 번.

## 발행

`git tag canvas-v<버전> && git push origin canvas-v<버전>`. 워크플로가 typecheck·test·
버전-태그 일치를 확인하고 OIDC로 올린다. 손으로 `npm publish` 하지 않는다(첫 발행 한
번만 예외였다).
