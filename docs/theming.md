# 편집기를 다른 디자인으로 갈아입히기

편집기 크롬(헤더·좌측 레일·패널·인스펙터)은 소비자 앱이 자기 디자인으로 바꿀 수 있다.
바꾸는 방법이 세 층이고, **아래로 갈수록 자유롭고 손이 많이 간다**. 위에서부터 필요한
만큼만 쓰면 된다.

기본값은 지금까지의 회색 편집기 그대로다. 아무것도 안 하면 화면은 안 바뀐다.

## 1층 — 토큰: 색 · 모서리 · 굵기

앱의 `globals.css` 에서 한 줄 불러온다.

```css
@import "tailwindcss";
@import "@leviosa-ai/detail-page-editor/tokens.css";
```

이러면 `dpe-*` 유틸리티가 생기고, 값만 덮으면 편집기 전체가 따라온다. 편집기 뿌리에만
먹이려면 `[data-dpe-root]` 로 좁힌다 — 앱의 다른 화면은 안 건드린다.

```css
[data-dpe-root] {
  --color-dpe-surface: #faf8f5;   /* 패널·헤더 바탕 */
  --color-dpe-ink-200: #e0dbd4;   /* 테두리 */
  --color-dpe-ink-500: #8a8578;   /* 흐린 글자 */
  --color-dpe-ink-900: #1a1a1a;   /* 진한 글자·강조 배경 */
  --radius-dpe-md: 0px;           /* 각진 톤 */
  font-family: var(--font-serif); /* 글꼴은 물려받는다 — 토큰이 따로 없다 */
}
```

토큰 갈래는 쓰임으로 나뉜다: `ink`(회색 램프) · `surface` · `on-accent` · `scrim` ·
`danger` · `warn` · `ok` · `select` · `active` · `ai`. 전체 목록과 기본값은
[`packages/detail-page-editor/styles/tokens.css`](../packages/detail-page-editor/styles/tokens.css).

**좌측 레일도 같이 물리려면** 한 줄 더 부른다. 레일은 캔버스 엔진이 그리고 그쪽은
Tailwind 를 안 써서, 자기 변수(`--lc-*`)를 편집기 토큰에 이어 주는 다리가 따로 있다.

```css
@import "@leviosa-ai/detail-page-editor/canvas-bridge.css";
```

## 2층 — 딱지: 토큰으로 안 되는 것

간격·테두리 유무·그림자처럼 값 하나로 안 끝나는 것은 `data-dpe-part` 를 CSS 로 잡는다.

```css
[data-dpe-part="header"] { border-bottom: none; box-shadow: 0 1px 0 #0001; }
[data-dpe-part="inspector"] { padding-inline: 8px; }
[data-dpe-part="asset-card"] { border-radius: 0; }
```

지금 있는 딱지: `header` · `workspace` · `inspector` · `panel-header` · `asset-card`,
그리고 엔진 쪽 `[data-lc-part]` 의 `side-panel` · `rail` · `rail-tab` · `panel` · `zoom`.
필요한 자리가 없으면 딱지를 늘리는 편이 낫다 — 클래스 이름을 노리는 CSS 는 다음 배포에
깨진다.

## 3층 — 슬롯: 영역을 통째로 갈아 끼우기

"무엇이 어디에 놓이는가" 는 CSS 로 못 바꾼다. 그럴 때는 호스트에 컴포넌트를 꽂는다.

```tsx
<DetailPageHostProvider
  value={{
    ...host,
    slots: {
      EditorHeader: AgencyEditorHeader,
      EditorSidebar: AgencyRail,
      EditorInspector: AgencyInspector,
    },
  }}
>
```

꽂으면 기본 것은 사라진다. 어려운 조각은 편집기가 만들어서 넘긴다 — 그것까지 다시
만들라고 하면 슬롯이 아니라 포크가 된다.

```tsx
function AgencyEditorHeader({ productName, onBack, save, parts }) {
  return (
    <header className="flex h-16 items-center gap-3 px-6">
      {onBack ? <button onClick={onBack}>←</button> : null}
      <h1 className="font-serif text-lg">{productName}</h1>
      <div className="flex-1" />
      {parts.history}
      {parts.download}
      {parts.actions}
      <button onClick={save.run} disabled={save.saving}>
        {save.saving ? "저장 중" : "저장"}
      </button>
    </header>
  );
}
```

인스펙터는 감싸 쓰는 경우가 더 많아서 기본 것을 `defaultInspector` 로 같이 넘긴다 —
자기 크롬만 두르고 속은 그대로 두면 된다. 좌측 껍데기는 섹션 목록(탭·패널 컴포넌트)을
그대로 받으므로 배치만 다시 짜면 된다.

## 지키는 규칙 하나

편집기 소스에는 `border-neutral-200` 같은 원본 팔레트 클래스를 **직접 적지 않는다**.
한 줄이 새로 들어오면 갈아입힌 화면에서 그 자리만 원래 회색으로 남고, 그건 아무도
안 알려 준다. `test/detail-page-editor-theme.test.ts` 가 그걸 잡는다.
