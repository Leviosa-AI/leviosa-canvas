# 편집기 셸을 앱에 꽂기

`@leviosa-ai/detail-page-editor` 를 처음 세우는 소비자가 읽는 문서.

두 번째 소비자(`leviosa-agency`)를 꽂으면서 알게 된 것을 적는다. **import 결합은 0이었는데
화면은 안 떴다.** `detail-page-editor-boundary.test.ts` 가 재는 것은 `import` 이고, 남아
있던 결합은 그게 아니라 **주소·프로바이더·문구** 였다. 아래 넷을 다 하면 선다.

## 1. 설치와 컴파일

```sh
npm i @leviosa-ai/detail-page-editor @leviosa-ai/canvas @leviosa-ai/konva
```

```ts
// next.config.ts — 소스로 배포되므로 반드시 적는다.
transpilePackages: ["@leviosa-ai/canvas", "@leviosa-ai/detail-page-editor"],
```

## 2. 주소 — `configureDetailPageEditor`

편집기는 사진·아이콘을 **우리 서버를 거쳐** 부르고, 폰트 번들·미리보기를 정적 자산에서
읽는다. 기본 주소는 루트 절대경로(`/api/icons`, `/render-fonts/…`)다.

> **`basePath` 를 쓰는 앱은 반드시 불러야 한다.** 브라우저의 맨손 `fetch("/api/…")` 는
> Next 의 `basePath` 를 안 탄다 — 앞에 붙여 주는 것은 `<Link>`·`next/image` 같은 Next 자기
> 컴포넌트뿐이다. 안 부르면 앱 바깥을 두드려 400/404 가 난다.

```ts
import { configureDetailPageEditor } from "@leviosa-ai/detail-page-editor";

configureDetailPageEditor({ basePath: "/agency" });
```

자산을 다른 자리에 두었으면 하나씩 덮는다. 설정은 **통째로 갈아 끼워진다** — 부분 병합이
아니므로 한 번에 다 준다.

```ts
configureDetailPageEditor({
  basePath: "/agency",
  endpoints: { icons: "/agency/api/editor/icons" },
  assets: { fontBundle: "https://cdn.example/render-fonts" },
});
```

## 3. 라우트 두 개 마운트

구현은 패키지가 들고 있다. 소비자는 자리를 정할 뿐이다.

```ts
// app/api/icons/route.ts
export { GET } from "@leviosa-ai/detail-page-editor/server/icons";
```

```ts
// app/api/stock-photos/route.ts
import { createStockPhotosRoute } from "@leviosa-ai/detail-page-editor/server/stock-photos";

export const GET = createStockPhotosRoute({
  // 우리 Pexels 키를 태우는 자리다(시간당 200회). 로그인 게이트를 건다.
  authorize: async (request) => {
    const user = await currentUser(request);
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
    return { userId: user.id };
  },
  onError: (error, context) => reportError(error, context),
});
```

환경 변수:

| 변수 | 필요한 곳 | 없으면 |
|---|---|---|
| `PEXELS_API_KEY` | 스톡 사진 | 오류가 아니라 `configured: false` — 패널이 안내를 띄운다 |
| `KOREAN_DICTIONARY_API_KEY` | 아이콘 한국어 확장 | 그 층만 꺼진다. 검색은 그대로 된다 |
| `NEXT_PUBLIC_LEVIOSA_CANVAS_KEY` | 엔진 계량 | 편집기는 똑같이 돈다(계량기지 자물쇠가 아니다) |

## 4. 프로바이더와 문구

편집기가 자기 것으로 까는 것: **툴팁 프로바이더**(0.7.0부터. 그 전에는 앱이 전역으로 깔고
있기를 기대했고, 없는 앱에서는 `Tooltip must be used within TooltipProvider` 로 죽었다).

앱이 꽂아야 하는 것:

- `QueryClientProvider` — 브랜드 자산·아이콘·사진 캐시가 여기 산다.
- `I18nextProvider` — 번역기는 소비자 것이다. i18n 라이브러리를 안 쓰는 앱이면 편집기 전용
  인스턴스를 따로 세우면 된다(`i18next.createInstance()`; 전역 싱글턴을 안 건드린다).
- `DetailPageHostProvider` — 소싱 서버·브랜드 저장소·토스트·캐시 키.

문구는 패키지가 싣고 온다. 렌더 전에 한 번 등록한다.

```ts
import { registerDetailPageEditorTranslations } from "@leviosa-ai/detail-page-editor/i18n";

registerDetailPageEditorTranslations(i18n);
```

문구를 갈아 끼우려면 `overrides` 에 준다. 소비자가 이미 같은 키를 로케일 파일에 갖고
있으면 등록이 `overwrite=false` 라 저절로 이기지만, 로케일 파일 체계가 없는 앱은 그럴 자리가
없어서 여기서 직접 받는다.

```ts
registerDetailPageEditorTranslations(i18n, {
  overrides: {
    ko: { branding: { detailPage: { sidebar: { photos: "이미지" } } } },
  },
});
```

## 5. 정적 자산

| 묶음 | 무엇 | 어떻게 얻나 |
|---|---|---|
| `render-fonts` | 번들 폰트 CSS·바이트 | `leviosa-konva-fonts --prefix=<basePath>/render-fonts/fonts/ --out=public/render-fonts` (`@leviosa-ai/konva` 의 CLI) |
| `detail-font-previews` | **추천 글꼴**(CDN 카탈로그 22종) 미리보기 WebP | 소비자 빌드 스크립트가 `@leviosa-ai/detail-page-editor/config/detail-page-fonts.json` 을 읽어 굽는다 |
| `cardnews-font-previews` | **기본 글꼴**(번들 폰트) 미리보기 WebP | 같은 스크립트가 `render-fonts` 번들 바이트로 굽는다. 파일 이름은 konva 카탈로그의 `id` |
| `gif-effect-previews` | GIF 효과 미리보기 | 소싱 저장소의 `scripts/detail_page_gif_effect_previews.py` 산출물 |

`--prefix` 에 basePath 를 넣는 것을 잊으면 CSS 안의 폰트 파일 주소가 앱 바깥을 가리킨다.

미리보기 WebP 를 안 구우면 피커는 이름을 그 폰트로 그려 대신하는데, **추천 글꼴은 그 폴백도
안 먹는다** — 카탈로그 폰트의 `@font-face` 는 그 폰트를 고른 뒤에야 선언되므로, 굽지 않은
행은 전부 기본 UI 폰트로 똑같이 보인다. 번들 글꼴만 폴백이 제대로 산다(프리즈된 스타일시트가
이미 `@font-face` 를 깔아 둔다). 즉 미리보기는 있으면 좋은 게 아니라 추천 글꼴 목록의 전제다.

두 폴더 이름을 소비자가 이미 다르게 쓰고 있다면 폴더를 옮기지 말고 주소를 알려 준다 —
`configureDetailPageEditor` 의 `assets` 가 그 자리다. leviosa-agency 는 브랜드 스타일가이드
피커가 쓰던 `public/font-previews` 를 그대로 재사용한다.

```ts
configureDetailPageEditor({
  basePath: "/agency",
  assets: { cardnewsFontPreviews: "/agency/font-previews" },
});
```

## 6. AI 편집 버튼이 안 보인다면

버그가 아니라 게이트다. `DetailPageEditor` 에 `generatedId` 를 안 주면 "프롬프트로 편집" ·
"배경 지우기" 같은 항목을 **아예 안 띄운다**(`editor-ai-context.tsx`). 그 항목들은 전부
소싱 서버의 `/{generated_id}/…` 아래에 있어서, ID 없이는 부를 곳이 없기 때문이다.

인스턴스 발급이 실패했는데 화면이 조용하면 그게 원인이다 — 실패를 사용자에게 보이게 하고,
`generatedId` 가 왜 비었는지부터 본다.

## 7. 파는 티어가 다르면 목록을 좁힌다

AI 이미지 드롭다운은 기본이 `basic / pro / max` 셋이다. 소비자 요금표에서 은퇴한
티어가 있으면 `imageTiers` 로 좁힌다 — 값이 없는 티어를 남겨 두면 사용자는 고를 수
있는데 **아무도 청구를 못 하고**, 그 상태는 화면 어디에도 안 보인다.

```tsx
<DetailPageEditor imageTiers={["pro", "max"]} … />
```

빈 배열이나 모르는 이름을 주면 셋 다로 되돌아간다(`resolveImageTiers`). 빈 드롭다운은
"AI 이미지를 못 만드는 편집기"이고, 그건 배열 하나를 잘못 넘겨서 벌어질 일이 아니다.
고른 티어가 목록 밖이면 목록 안의 기본값으로 되돌린다.

## 재는 것

| 테스트 | 무엇을 막나 |
|---|---|
| `test/detail-page-editor-boundary.test.ts` | `@/…` 앱 별칭, 선언 안 된 npm 의존 |
| `test/detail-page-editor-runtime-boundary.test.ts` | 소스에 박히는 루트 절대경로 |
| `packages/detail-page-editor/i18n/__tests__/coverage.test.ts` | 번들에 없는 문구 키 |
| `…/__tests__/detail-page-editor-providers.test.tsx` | 편집기가 자기 프로바이더를 안 깔고 나가는 것 |
