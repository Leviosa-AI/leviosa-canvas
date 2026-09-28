# 편집기 감사 (2026-09-28)

기준 커밋 `d562b0ca`. 세 감사자의 결과를 합치고 중복을 뺐다 — Claude 서브에이전트 2개(엔진·셸), Codex `gpt-6-astra` (reasoning high). ★는 별도로 코드에서 재확인한 항목. 경로는 `packages/` 기준.

## P0 — 기본 조작·결과물 신뢰성

1. ★ **레이어 잠금 버튼이 `locked`를 안 건드린다.** `toggleLock`이 `draggable/resizable/…` 플래그만 `el.locked` 값으로 세팅하는데 엔진은 `el.locked`만 검사한다. 잠금이 안 걸리고, 잠긴 건 안 풀린다. — `detail-page-editor/components/detail-page/detail-page-layers-panel.tsx:135`, `canvas/render/element-view.tsx:80`, `canvas/edit/hotkeys.ts:39`
2. ★ **다중 선택 후 하나를 잡고 끌면 선택이 그 하나로 줄어든다.** pointerdown이 이미 선택된 요소인지 보지 않고 `[id]`로 교체한다. — `canvas/render/canvas-view.tsx:374`, `:702-704`
3. ★ **바뀐 게 없어도 undo 단계가 쌓이고 redo가 날아간다.** `mutate()`가 `run()` 결과를 보기 전에 `history.record()`를 부르고, `record()`는 push + `future=[]`. — `canvas/store.ts:615-616`, `:455-465`
4. ★ **슬라이더·다중 변형이 제스처 하나당 수십 개 undo 단계.** 불투명도 `onChange`마다 `setAll` → 매 틱 전체 문서 `JSON.stringify` + 스냅샷. 멀티 dragend/transformEnd도 노드마다 트랜잭션을 연다. — `detail-page-properties-panel.tsx:611`, `canvas/render/canvas-view.tsx:858-878`, `canvas/store.ts:447`
5. ★ **PSD/SVG/AI 내보내기가 이미지 crop을 무시한다.** export 디렉터리에 `crop` 0건. — `lib/detail-page-canvas/export/raster.ts:198-223`, `lib/detail-page/image-crop.ts:7`
6. **SVG/PSD 내보내기에 회전이 누락된다.** svg에 rotate transform이 없고 PSD 텍스트 행렬이 고정. — `export/svg.ts:200`, `export/psd.ts:323`
7. ★ **텍스트 하이라이트(마커 밴드)가 PSD/SVG/AI에서 빠진다.** export에 `highlightColor` 0건. — `detail-page-properties-panel.tsx:710-713`
8. ★ **자동저장 실패가 조용하고 `beforeunload`가 없다.** 실패 시 dirty만 복원, 재시도·토스트 없음. 이탈 시 `void` 저장. — `use-auto-save.ts:74-76`, `:101-114`

## P1 — 편집기 기본기

### 저장
- 수동 저장이 자동저장 single-flight를 우회한다. 성공해도 dirty가 안 지워진다. — `detail-page-editor.tsx:243`
- 기본 헤더가 dirty여도 "저장됨"을 표시한다. — `detail-page-editor.tsx:381-385`
- 동시 편집 충돌 감지가 없다(revision/etag를 안 보냄). — `detail-page-editor.tsx:231`
- 이미지 로드 실패가 `null`로 고착되고, 빠진 채 내보내기가 성공한다. — `canvas/render/image-cache.ts:59`, `export/psd.ts:259`

### 엔진
- 요소 속성 하나가 바뀌면 캔버스 전체가 리렌더된다. `el.set`도 `store.version`을 올리고 `PageView/ElementView`는 memo가 아니며 텍스트마다 `new Konva.Text`로 측정한다. — `canvas/store.ts:620`, `canvas/render/text-layout.ts:43`
- 회전·반투명 그룹을 해제하면 외형이 변한다(자식에 x/y만 더함). — `canvas/store.ts:875`
- 그룹 회전을 무시해 정렬·스냅·마퀴·텍스트 편집기 위치가 틀어진다. — `canvas/edit/rect.ts:86-93`, `canvas/store.ts:186-197`
- 스냅: 함께 선택된 요소·숨긴 요소에 스냅, 페이지별 크기 무시(`store.width` 사용), 간격 가이드·리사이즈 스냅·회전 스냅 없음. — `canvas-view.tsx:809-828`, `canvas/edit/snap.ts`
- 마퀴: 잠긴 배경 위에서 시작 불가, 숨긴 요소를 잡음, Shift 누적 안 됨, Stage를 벗어나면 끝남. — `canvas-view.tsx:335-395`
- ⌘+/⌘−가 엔진에서 동작하지 않는다(`setScale`을 안 넘김). ⌘0/⌘1/Space 팬 없음. — `canvas-view.tsx:745`, `canvas/edit/hotkeys.ts:163`
- OS 클립보드 붙여넣기가 없고, 이미지 ⌘C가 엔진 복사를 막아 ⌘V가 이전 객체를 붙인다. — `editor-hotkeys.tsx:125`, `canvas/edit/commands.ts:171-251`
- 캐시 비트맵 stale: 필터 이미지 리사이즈, 반투명 그룹 자식 수정 시 갱신 안 됨. — `canvas/render/element-view.tsx:415-433`, `:142-152`
- 드래그 중 커서가 페이지 밖이면 pointermove마다 CanvasView 전체 리렌더. 드래그 시작마다 동기 `toDataURL`. — `canvas-view.tsx:667-690`, `:781`
- Esc가 `isTyping()`보다 먼저 처리된다. — `canvas-view.tsx:739-743`
- 폰트 하나 로드될 때마다 Layer 전체 리마운트(`key={fontsVersion}`). — `canvas-view.tsx:406`
- ⌘G가 실패해도 이벤트를 먹는다. ⌘A가 scope를 무시한다. 잠금·숨김 단축키 없음. 뒤집기 없음(`flipEnabled={false}`). — `canvas/edit/hotkeys.ts:100-134`, `canvas-view.tsx:224`
- `deletePages`가 `mutate` 밖에서 `activePageId`를 바꾸고 알리지 않는다. 마지막 페이지도 지울 수 있다. — `canvas/store.ts:912-914`

### 내보내기
- 텍스트 자간/폭 불일치: PSD가 `letterSpacing` em을 px로 해석, 60% 압축 규칙이 화면엔 없다. — `export/text-layout.ts:125`, `export/psd.ts:346`
- 병합 PNG에 캔버스 면적 가드가 없다(Safari 16.7M px 넘으면 빈 파일). — `detail-page-download-dialog.tsx:143-162`
- PSD 초과 시 영어 원문 에러만 뜬다. PDF 선택지, 투명 배경, JPG 화질, 취소가 없다. 페이지별 raster는 파일을 연속 다운로드한다. — `export/psd.ts:152`, `download-dialog.tsx:448-451`

### 셸
- 속성 패널: shadow/stroke/blend/회전 입력이 없다(렌더러는 shadow 지원). 페이지 배경 편집 UI가 없다. 혼합 선택이면 불투명도·삭제만 남는다. — `detail-page-properties-panel.tsx:681-944`, `:2231-2280`, `:2723-2727`
- 찾기·바꾸기 결과가 문서 수정 후 갱신되지 않는다. — `find-replace-panel.tsx:61`
- 업로드가 파일 1개 선택뿐. 드롭·붙여넣기·URL 없음. 서버 자산 삭제에 confirm 없음. — `detail-page-my-images-panel.tsx:329-360`, `:412`
- 레이어 패널에 rename·검색이 없고 키보드 재정렬이 안 된다. — `detail-page-layers-panel.tsx`
- 중첩 그룹 편집을 셸이 제한한다(페이지 직속만). — `lib/detail-page/group-action.ts:28`, `lib/detail-page/layer-move.ts:205`
- 리치 텍스트·shrink-to-fit·대화형 크롭이 없다(별도 에픽).

### `[next]` 실험 패키지
- 비동기 커밋이 앞선 편집을 덮어쓸 수 있다. — `detail-dom-editor-next/src/EditorController.ts:114`
- 최상위 섹션 삭제·복제의 undo가 복원되지 않는다. — `EditorController.ts:127`, `detail-document-next/src/patch.ts:56`
- `textContent` 저장으로 줄바꿈이 사라질 수 있다. — `detail-dom-editor-next/src/TextEditor.tsx:13`

## P2
- 접근성: `aria-pressed`·tree 의미·포커스 트랩 없음, 업로드 input이 `hidden`. — `inspector-controls.tsx:160-173`, `layers-panel.tsx:349`, `download-dialog.tsx:482`
- i18n 밖 하드코딩 문자열, 오류 원문 노출. — `annotation-canvas.tsx`, `export-platforms.ts:45-94`, `ai-generate-panel.tsx:359`
- 2735줄 속성 패널. 360px 고정 인스펙터. ⌘S 미가로채기. 표 정렬이 마지막 열만. AI 생성 취소 불가. `editor-profile` 모듈 전역 가변 상태.
- 테스트 공백: raster/export-files/gif-export 본체, annotation-dialog, konva-json-preview.

## 가장 먼저 손댈 3가지
1. Undo 신뢰성(3·4).
2. 잠금·다중 선택 드래그(1·2).
3. 화면=내보내기 일치(5·6·7).
