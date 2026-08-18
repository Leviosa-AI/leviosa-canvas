/**
 * Dynamic Google Fonts loader for marketing editors (cardnews / templates).
 *
 * Loads font CSS via <link> tag on first call; subsequent calls with the same
 * families are no-ops.  Returns a promise that resolves when all requested
 * font faces have finished loading.
 */

import {
  FONT_CATALOG,
  LEVIOSA_KONVA_VERSION,
  catalogFont,
  fontLoadSampleForText,
  resolveFontFamily,
  type CatalogFont,
} from "@leviosa-ai/konva";

import { editorAssetBase } from "../detail-page/runtime-config";

export type FontOption = CatalogFont;

/**
 * The picker list. Derived from the konva catalog (fonts/catalog.json), which is the
 * same file the frozen woff2 bundle is built from — so a font can never appear here
 * without its bytes existing, and adding one means editing exactly one place.
 */
export const ALL_FONT_OPTIONS: FontOption[] = FONT_CATALOG;

const DEFAULT_FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export function getSupportedFontWeights(fontFamily?: string | null): number[] {
  const weights = catalogFont(fontFamily || "Pretendard")?.weights;
  return weights?.length ? weights : DEFAULT_FONT_WEIGHTS;
}

export function getClosestSupportedFontWeight(
  fontFamily: string | undefined | null,
  fontWeight: unknown,
): string {
  const supportedWeights = getSupportedFontWeights(fontFamily);
  const requestedWeight =
    fontWeight === "bold" ? 700
      : fontWeight === "normal" ? 400
        : Number(fontWeight);
  const fallbackWeight = supportedWeights.includes(400) ? 400 : supportedWeights[0];
  if (!Number.isFinite(requestedWeight)) return String(fallbackWeight);
  const closestWeight = supportedWeights.reduce((closest, weight) => (
    Math.abs(weight - requestedWeight) < Math.abs(closest - requestedWeight) ? weight : closest
  ), fallbackWeight);
  return String(closestWeight);
}

// ── Loader ───────────────────────────────────────────────────────────────────

const loadedFontFaces = new Set<string>();
const loadedFamilyWeights = new Set<string>();
const stylesheetPromises = new Map<string, Promise<void>>();
const FONT_LOAD_SAMPLE = "가나다라마바사아자차카타파하 ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789";
/**
 * 자주 쓰는 한글. 구글의 한글 조각은 빈도순으로 묶여 있어서, 이 정도만 미리 받아두면
 * 타이핑 중에 "방금 친 글자만 뒤늦게 폰트가 바뀌는" 일이 대부분 사라진다.
 * 통짜(굵기당 ~750KB)를 받는 대신 조각 몇 개(수십 KB)로 때우는 타협.
 */
const COMMON_HANGUL_SAMPLE =
  "가각간갈감갑값강같개객거건걸검것게겨결경계고곡곤골곱공과관광교구국군굴권귀그근글금급기긴길김까꼭끝" +
  "나난날남내네녀년노논놀농높다단달담답당대댓더던데도독돈동되된두들등디따때또" +
  "라락란람래러런럴럼렁레려력련령로록론료루류르른를름리린립" +
  "마막만많말맛망매머먹면명모목몰못무문물미민밀바박반받발밤밥방배백버번벌범법베변별병보복본볼봄부북분불브비빛" +
  "사산살삼상새색생서석선설섬성세소속손솔송수숙순술스승시식신실심십싶" +
  "아악안않알암앞애야약양어억언얼업없에여역연열영예오옥온올와완왕외요용우운울원월위유육으은을음의이인일임입있" +
  "자작잔잘잠장재저적전절점정제조족존종주준줄중즈지직진질집짓차착찬참창채책처천철첫청체초촌총최추축출춤충취치친칠침" +
  "카칼커컴케코콘크큰클키타탁탄탈탐태택터턴테토톤통투트특틀티파판팔패퍼편평포표푸품풍프피필" +
  "하학한할함합항해핵행향허현혈형혜호혹혼홀화확환활황회획효후훈휴흐흑희히힘";
/**
 * The font stylesheets are cached at the CDN edge, but their filenames are family
 * slugs — they do not change when the bundle does. A re-freeze rewrites the woff2
 * filenames (they are hashes of the source URL), so an edge-cached stylesheet ends up
 * pointing at slice files that no longer exist: every one 404s and the font fails to
 * load. Stamping the bundle version into the URL makes each bundle its own cache key,
 * so a deploy can never be shadowed by the previous bundle's stylesheet.
 */
/**
 * 번들의 뿌리는 설정에서 온다(`configureDetailPageEditor`). 기본값은 예전과 같은
 * `/render-fonts` 라, 아무것도 안 부른 소비자에게는 주소가 그대로다.
 */
function bundleUrl(path: string): string {
  return `${editorAssetBase("fontBundle")}${path}?v=${LEVIOSA_KONVA_VERSION}`;
}

const localFontCssUrl = () => bundleUrl("/font-css.css");

export class FontLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FontLoadError";
  }
}

function slugifyFamily(family: string): string {
  return family
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const LOCAL_FONT_FAMILY_SLUGS = new Set(
  ALL_FONT_OPTIONS.map((font) => slugifyFamily(font.family)),
);

function ensureStylesheet(href: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();

  const existing = stylesheetPromises.get(href);
  if (existing) return existing;

  const linkElement = document.createElement("link");
  linkElement.rel = "stylesheet";
  linkElement.href = href;
  const promise = new Promise<void>((resolve, reject) => {
    linkElement.addEventListener("load", () => resolve(), { once: true });
    linkElement.addEventListener("error", () => {
      // 실패한 약속을 캐시에 남기면 이후 호출이 전부 같은 실패를 돌려받는다(재시도 불가).
      stylesheetPromises.delete(href);
      reject(new Error(`Font stylesheet failed to load: ${href}`));
    }, { once: true });
  });
  stylesheetPromises.set(href, promise);
  document.head.appendChild(linkElement);
  return promise;
}

/**
 * Installs the @font-face rules for the faces about to be drawn.
 *
 * Asks for the family+weight file rather than the whole family: a Korean family is
 * ~90 unicode-range slices per weight, so the family file is nine times the CSS for
 * the one weight a slide actually uses. Falls back family-wide, then bundle-wide.
 */
function ensureFontFaceStylesheets(
  requests: Array<{ family: string; weight: string }>,
): Promise<void> {
  const seen = new Set<string>();
  const hrefs: string[] = [];
  for (const { family, weight } of requests) {
    const slug = slugifyFamily(family.trim());
    if (!slug || !LOCAL_FONT_FAMILY_SLUGS.has(slug)) {
      hrefs.push(localFontCssUrl());
      continue;
    }
    const key = `${slug}\n${weight}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hrefs.push(bundleUrl(`/family-css/${slug}-${weight}.css`));
  }
  return Promise.all(
    hrefs.map((href) =>
      ensureStylesheet(href).catch(() => {
        const slug = href.match(/family-css\/(.+)-\d+\.css\?/)?.[1];
        return slug
          ? ensureStylesheet(bundleUrl(`/family-css/${slug}.css`)).catch(() =>
              ensureStylesheet(localFontCssUrl()),
            )
          : ensureStylesheet(localFontCssUrl());
      }),
    ),
  ).then(() => {});
}

export interface FontFaceRequest {
  family?: string | null;
  weight?: string | number | null;
  size?: string | number | null;
  sample?: string | null;
}

interface NormalizedFontFaceRequest {
  family: string;
  weight: string;
  size: number;
  sample: string;
}

/**
 * 한 번 실패하면 편집기는 검은 캔버스에 "폰트를 불러오지 못했습니다"만 띄운 채 멈춘다
 * (새로고침 전까지 복구 없음). 실패는 대개 일시적(같은 시점에 이미지 여러 장을 동시에
 * 받느라 CSS 요청이 밀리는 등)이라 한 번 더 시도한다.
 * ponytail: 재시도 1회 고정. 계속 실패하면 진짜 문제라 그대로 에러를 낸다.
 */
export function loadFontFaces(requests: FontFaceRequest[]): Promise<void> {
  return loadFontFacesOnce(requests).catch(() => loadFontFacesOnce(requests));
}

function loadFontFacesOnce(requests: FontFaceRequest[]): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (!document.fonts) return Promise.resolve();

  const stylesheetRequests: Array<{ family: string; weight: string }> = [];
  const pendingRequests: NormalizedFontFaceRequest[] = [];
  for (const request of requests) {
    // 블록에 저장된 값은 폰트명이 아니라 계열/형태 딱지("gothic/round")일 수 있다.
    // 그리는 쪽과 같은 함수로 실제 패밀리를 정해야 "받은 폰트 ≠ 그리는 폰트"가 안 생긴다.
    const family = resolveFontFamily(request.family);
    // Snap to a weight the family actually ships, so the family+weight stylesheet
    // we ask for is one that exists (a 404 would cost a round trip to discover).
    const weight = getClosestSupportedFontWeight(family, request.weight ?? "400");
    const size = Number(request.size || 16);
    stylesheetRequests.push({ family, weight });
    const rawSample = (request.sample || FONT_LOAD_SAMPLE).trim() || FONT_LOAD_SAMPLE;
    const sample = fontLoadSampleForText(family, rawSample, FONT_LOAD_SAMPLE);
    const key = `${family}\n${weight}\n${size}\n${sample}`;
    if (loadedFontFaces.has(key)) continue;
    pendingRequests.push({ family, weight, size, sample });
  }

  if (pendingRequests.length === 0) return document.fonts.ready.then(() => {});
  return ensureFontFaceStylesheets(stylesheetRequests)
    .then(() => Promise.all(
      pendingRequests.map(async (request) => {
        const descriptor = `${request.weight} ${request.size}px "${request.family}"`;
        const faces = await document.fonts.load(descriptor, request.sample);
        if (faces.length === 0) {
          throw new FontLoadError(`No bundled font face matched: ${descriptor}`);
        }
        const unloadedFace = faces.find((face) => face.status !== "loaded");
        if (unloadedFace) {
          throw new FontLoadError(`Font face failed to load: ${descriptor}`);
        }
        if (!document.fonts.check(descriptor, request.sample)) {
          throw new FontLoadError(`Font face is not ready for rendering: ${descriptor}`);
        }
      }),
    ))
    .then(() => document.fonts.ready)
    .then(() => {
      for (const request of pendingRequests) {
        loadedFontFaces.add(`${request.family}\n${request.weight}\n${request.size}\n${request.sample}`);
        loadedFamilyWeights.add(`${request.family}\n${request.weight}`);
      }
    });
}

/**
 * 이 패밀리+굵기를 이미 한 번이라도 그려본 적이 있는지.
 * 캔버스가 "지금 이 폰트로 그리면 대체 폰트가 아니라 진짜 폰트가 나온다"를 판단하는 데 쓴다.
 * 글자 단위 조각까지 보장하지는 않는다 — 그건 COMMON_HANGUL_SAMPLE 예열이 덮는다.
 */
export function isFontFamilyWeightLoaded(family: string, weight: string): boolean {
  return loadedFamilyWeights.has(`${family.trim()}\n${weight}`);
}

/**
 * 화면에 적용된 폰트를 다 받은 뒤에 뒤에서 조용히 받아두는 것들.
 * - 쓰고 있는 패밀리+굵기의 자주 쓰는 한글 (타이핑 중 튐 방지)
 * - 같은 패밀리의 다른 굵기 (굵게 토글이 즉시 먹히게), 샘플은 지금 화면의 글자
 * 실패는 무시하고, 보이는 폰트 요청과 대역폭을 다투지 않게 한 건씩 차례로 받는다.
 */
export function prefetchFontVariants(requests: FontFaceRequest[]): void {
  if (typeof document === "undefined" || !document.fonts) return;

  const samplesByFamily = new Map<string, string>();
  const usedFaces = new Set<string>();
  for (const request of requests) {
    const family = resolveFontFamily(request.family);
    const weight = getClosestSupportedFontWeight(family, request.weight ?? "400");
    usedFaces.add(`${family}\n${weight}`);
    const sample = (request.sample || "").trim();
    if (sample) samplesByFamily.set(family, `${samplesByFamily.get(family) ?? ""}${sample}`);
  }

  const jobs: FontFaceRequest[] = [];
  for (const face of usedFaces) {
    const [family, weight] = face.split("\n");
    jobs.push({ family, weight, sample: COMMON_HANGUL_SAMPLE });
    for (const other of getSupportedFontWeights(family)) {
      if (String(other) === weight) continue;
      jobs.push({ family, weight: String(other), sample: samplesByFamily.get(family) || FONT_LOAD_SAMPLE });
    }
  }

  // ponytail: 순차 1건씩. 병렬로 풀면 다음 슬라이드 폰트 요청을 밀어낸다.
  void jobs.reduce(
    (chain, job) => chain.then(() => loadFontFaces([job]).catch(() => {})),
    Promise.resolve(),
  );
}

/**
 * Keeps the historical API name for editor/font-picker callers.
 * This now only installs the local font stylesheet; actual canvas rendering
 * loads the font faces it uses through `loadFontFaces`.
 */
export function loadAllGoogleFonts(): Promise<void> {
  return ensureStylesheet(localFontCssUrl()).catch(() => {});
}

export function loadDefaultCardnewsFonts(): Promise<void> {
  return loadFontFaces([
    { family: "Pretendard", weight: "100", sample: FONT_LOAD_SAMPLE },
    { family: "Pretendard", weight: "200", sample: FONT_LOAD_SAMPLE },
    { family: "Pretendard", weight: "300", sample: FONT_LOAD_SAMPLE },
    { family: "Pretendard", weight: "400", sample: FONT_LOAD_SAMPLE },
    { family: "Pretendard", weight: "500", sample: FONT_LOAD_SAMPLE },
    { family: "Pretendard", weight: "600", sample: FONT_LOAD_SAMPLE },
    { family: "Pretendard", weight: "700", sample: FONT_LOAD_SAMPLE },
    { family: "Pretendard", weight: "800", sample: FONT_LOAD_SAMPLE },
    { family: "Pretendard", weight: "900", sample: FONT_LOAD_SAMPLE },
    { family: "Noto Sans KR", weight: "400", sample: FONT_LOAD_SAMPLE },
    { family: "Noto Sans KR", weight: "700", sample: FONT_LOAD_SAMPLE },
    { family: "Noto Sans KR", weight: "900", sample: FONT_LOAD_SAMPLE },
  ]);
}
