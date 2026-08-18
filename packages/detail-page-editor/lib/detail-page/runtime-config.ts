/**
 * 편집기가 브라우저에서 부르는 **주소**를 한 자리에 모은다.
 *
 * ## 왜 필요한가
 *
 * 셸이 앱에서 떨어져 나올 때 import 는 다 끊었지만(`detail-page-editor-boundary.test.ts`
 * 가 0을 지킨다) **주소는 못 끊었다.** 소스 곳곳에 `/api/icons`, `/render-fonts/…`
 * 처럼 루트 절대경로가 박혀 있었고, 첫 소비자(leviosa-frontend)가 마침 그 경로에
 * 라우트와 정적 자산을 갖고 있어서 아무 일도 안 났다.
 *
 * 두 번째 소비자(leviosa-agency)에서 한꺼번에 드러났다. 그 앱은 `basePath: "/agency"`
 * 로 마운트되므로 `/api/icons` 는 앱 바깥을 가리키고, 라우트를 만들어 붙여도 **그 경로로는
 * 안 닿는다.** 폰트 번들·미리보기도 같은 이유로 전부 404 였다.
 *
 * ## 무엇을 여는가
 *
 * `basePath` 하나만 주면 나머지는 거기서 파생된다 — 소비자가 우리 라우트 팩토리
 * (`@leviosa-ai/detail-page-editor/server/*`)를 관례대로 마운트한 경우가 그렇다.
 * 다른 자리에 두었으면 `endpoints`·`assets` 로 하나씩 덮는다.
 *
 * ```ts
 * // 편집기를 여는 화면에서 한 번. 두 번 불러도 안전하다(뒤엣것이 이긴다).
 * configureDetailPageEditor({ basePath: "/agency" });
 * ```
 *
 * 아무것도 안 부르면 `basePath` 는 `""` 다 — 예전과 **글자 하나 안 다른** 주소가 나온다.
 * 그래서 이 파일이 들어와도 leviosa-frontend 는 손댈 것이 없다.
 *
 * ## 왜 훅이나 컨텍스트가 아닌가
 *
 * 읽는 쪽이 컴포넌트가 아니다. 폰트 로더·아이콘 검색은 모듈 함수라 React 나무 밖에서
 * 불린다. `ensureCanvasKey` 가 같은 이유로 모듈 수준인 것과 같다.
 */

export type DetailPageEditorEndpoints = {
  /** 기본 `${basePath}/api/stock-photos`. */
  stockPhotos?: string;
  /** 기본 `${basePath}/api/icons`. */
  icons?: string;
};

export type DetailPageEditorAssets = {
  /**
   * `@leviosa-ai/konva` 의 `leviosa-konva-fonts` 가 구워 두는 폰트 번들의 뿌리.
   * 기본 `${basePath}/render-fonts`.
   */
  fontBundle?: string;
  /** 카탈로그 폰트 미리보기 WebP. 기본 `${basePath}/detail-font-previews`. */
  detailFontPreviews?: string;
  /** 번들 폰트 미리보기 WebP. 기본 `${basePath}/cardnews-font-previews`. */
  cardnewsFontPreviews?: string;
  /** GIF 효과 미리보기 GIF. 기본 `${basePath}/gif-effect-previews`. */
  gifEffectPreviews?: string;
};

export type DetailPageEditorConfig = {
  /**
   * 앱이 마운트된 경로. Next 의 `basePath` 와 **같은 값**을 준다.
   *
   * 브라우저에서 루트 절대경로(`/api/…`)는 basePath 를 안 탄다 — Next 가 앞에 붙여 주는
   * 것은 `<Link>`·`next/image` 같은 자기 컴포넌트뿐이고, 맨손 `fetch` 는 아니다.
   */
  basePath?: string;
  endpoints?: DetailPageEditorEndpoints;
  assets?: DetailPageEditorAssets;
};

type Resolved = {
  basePath: string;
  endpoints: Required<DetailPageEditorEndpoints>;
  assets: Required<DetailPageEditorAssets>;
};

/**
 * 뒤 슬래시를 뗀다.
 *
 * `replace(/\/+$/, "")` 가 아닌 이유: 그 정규식은 슬래시만 잔뜩 들어온 문자열에서
 * 역추적으로 느려진다(CodeQL `js/polynomial-redos`). 여기 오는 값은 개발자가 적는
 * 설정이라 공격면은 아니지만, 자르는 일에 정규식이 필요하지도 않다.
 */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

/** 뒤 슬래시를 떼고 앞 슬래시를 붙인다. `""` 는 그대로 둔다(기본값이 그것이다). */
function normalizeBase(value: string): string {
  const trimmed = trimTrailingSlashes(value.trim());
  if (!trimmed) return "";
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function resolve(config: DetailPageEditorConfig): Resolved {
  const basePath = normalizeBase(config.basePath ?? "");
  const at = (path: string) => `${basePath}${path}`;
  return {
    basePath,
    endpoints: {
      stockPhotos: normalizeBase(
        config.endpoints?.stockPhotos ?? at("/api/stock-photos"),
      ),
      icons: normalizeBase(config.endpoints?.icons ?? at("/api/icons")),
    },
    assets: {
      fontBundle: normalizeBase(
        config.assets?.fontBundle ?? at("/render-fonts"),
      ),
      detailFontPreviews: normalizeBase(
        config.assets?.detailFontPreviews ?? at("/detail-font-previews"),
      ),
      cardnewsFontPreviews: normalizeBase(
        config.assets?.cardnewsFontPreviews ?? at("/cardnews-font-previews"),
      ),
      gifEffectPreviews: normalizeBase(
        config.assets?.gifEffectPreviews ?? at("/gif-effect-previews"),
      ),
    },
  };
}

let current: Resolved = resolve({});

/**
 * 편집기를 여는 자리에서 한 번 부른다. 렌더보다 먼저면 된다.
 *
 * 두 번 부르면 **마지막에 준 설정이 통째로 이긴다** — 앞의 것과 안 섞는다. 섞으면
 * `basePath` 를 바꿨을 때 파생 주소가 따라올지 안 따라올지가 부르는 순서에 달리게 되고,
 * 그건 설정 한 줄로 끝나야 할 일이 아니다. 시작할 때 한 번 부르는 자리라 잃는 것도 없다.
 */
export function configureDetailPageEditor(
  config: DetailPageEditorConfig,
): void {
  current = resolve(config);
}

/** 지금 설정. 테스트와 진단용이다. */
export function detailPageEditorConfig(): Resolved {
  return current;
}

/** 편집기가 부르는 라우트 하나의 주소. */
export function editorEndpoint(name: keyof DetailPageEditorEndpoints): string {
  return current.endpoints[name];
}

/** 정적 자산 묶음 하나의 뿌리. 뒤에 `/파일이름` 을 직접 붙여 쓴다. */
export function editorAssetBase(name: keyof DetailPageEditorAssets): string {
  return current.assets[name];
}

/**
 * 폰트 번들을 **절대 주소**로. 서버가 받아가야 하는 자리(GIF 인코딩)가 쓴다.
 *
 * 설정이 이미 절대 주소면 그대로 두고, 경로면 준 오리진을 앞에 붙인다.
 */
export function fontBundleAbsoluteUrl(
  origin: string,
  path: string,
): string | null {
  const base = current.assets.fontBundle;
  if (/^https?:\/\//i.test(base)) return `${base}${path}`;
  if (!/^https:\/\//i.test(origin)) return null;
  return `${trimTrailingSlashes(origin)}${base}${path}`;
}
