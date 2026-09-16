# leviosa-canvas

- `README.md`의 하드룰 네 개를 지킨다. 런타임 의존성은 `konva`, `react`, `react-konva` 외에 추가하지 않는다.
- 외부에 공개할 모듈은 `packages/canvas/package.json`의 `exports`에 등록한다.

## 검증

```sh
npm test
npm run typecheck
```

큰 렌더링 변경은 `-rc.N`으로 발행한 뒤 `leviosa-frontend`의 G0·G4·G6 검증과 원본 대조도 실행한다.

## 커밋과 발행

- 커밋 제목: `type(scope): 한국어 설명`
- PR 본문의 마지막 비어 있지 않은 줄: `by Max Kim (Dindb-dong)`
- 발행: `git tag canvas-v<버전> && git push origin canvas-v<버전>`
- `npm publish`는 직접 실행하지 않는다.
