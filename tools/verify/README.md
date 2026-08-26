# 렌더 결과 검사

상세페이지 디자인 자산은 레포에 넣지 않는다. 글자가 많은 문서 폴더를 로컬 경로로 넘긴다.
캐러셀 검사는 `packages/decompose/tests/fixtures/`의 8장을 그대로 쓴다.

```sh
tools/verify/verify snapshot <문서 폴더> --out before/
tools/verify/verify diff before/ after/
```

첫 명령은 실제 편집기 Stage에서 실측 JSON과 스크린샷을 만든다. 캐러셀 8장은 기록된
원본 대비 기준보다 0.1%p 나빠지면 실패한다. 두 번째 명령은 줄 수, 박스 크기, 픽셀
0.1% 초과분만 출력하며 차이 이미지는 `after/diff/`에 남긴다.
