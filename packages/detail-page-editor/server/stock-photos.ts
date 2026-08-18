/**
 * 무료 스톡 사진 검색 프록시(Pexels) — 소비자가 마운트하는 라우트.
 *
 * 키는 서버에만 둔다 — 브라우저가 직접 Pexels를 부르면 키가 번들에 실린다.
 *
 * 제공처를 Pexels로 고른 이유는 라이선스가 아니라 **보관 방식** 때문이다. 상세페이지는
 * 저장돼서 나중에 다시 열리고 서버가 다시 그린다. 그래서 고른 사진은 우리 S3로
 * 옮겨 담아야 하는데,
 *   - Unsplash는 API로 받은 주소를 그대로 걸으라고 요구한다(자체 보관 금지),
 *   - Pixabay는 반대로 영구 핫링크를 금지하는데 CDN이 CORS 헤더를 안 준다
 *     (캔버스가 오염돼 내보내기가 깨진다),
 *   - Pexels는 둘 다 막지 않고 CDN이 `Access-Control-Allow-Origin: *`를 준다.
 * 대신 Pexels는 **검색 결과를 보여줄 때 출처 표기**를 요구한다 — 패널 하단의
 * "Pexels 제공" 링크와 사진별 작가 표기가 그 몫이다.
 *
 * ```ts
 * // app/api/stock-photos/route.ts
 * import { createStockPhotosRoute } from "@leviosa-ai/detail-page-editor/server/stock-photos";
 * export const GET = createStockPhotosRoute({ authorize: requireSession });
 * ```
 *
 * 키가 없으면 **오류가 아니라 `configured: false`** 를 준다. 패널은 그걸 받아 안내를
 * 띄운다 — 사진 하나 때문에 편집기가 못 뜨면 안 된다.
 */

import type {
  StockPhoto,
  StockPhotoResponse,
} from "../lib/detail-page/stock-photos";
import {
  authorizeRequest,
  isResponse,
  json,
  makeCache,
  type EditorRouteOptions,
} from "./route-kit";

const PEXELS_API = "https://api.pexels.com/v1";
const DEFAULT_PER_PAGE = 24;
const MAX_PER_PAGE = 40;
// 기본 한도가 시간당 200회다. 같은 검색어를 다시 두드리는 건 캐시로 받아낸다.
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 200;

const HANGUL = /[가-힣]/;

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  alt: string | null;
  photographer: string;
  photographer_url: string;
  src: Record<string, string>;
};

const cache = makeCache<StockPhotoResponse>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);

function normalizePhoto(photo: PexelsPhoto): StockPhoto {
  return {
    id: String(photo.id),
    thumb: photo.src.medium ?? photo.src.small ?? photo.src.tiny ?? "",
    // large2x는 긴 변 ~1880px다. 원본은 상세페이지에 과하고 옮겨 담는 시간만 늘린다.
    full: photo.src.large2x ?? photo.src.large ?? photo.src.original ?? "",
    width: photo.width,
    height: photo.height,
    alt: photo.alt ?? "",
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    pageUrl: photo.url,
  };
}

export type StockPhotosRouteOptions = EditorRouteOptions & {
  /** 안 주면 `process.env.PEXELS_API_KEY`. 없으면 `configured: false`. */
  apiKey?: string;
};

export function createStockPhotosRoute(options: StockPhotosRouteOptions = {}) {
  return async function GET(request: Request): Promise<Response> {
    const auth = await authorizeRequest(request, options.authorize);
    if (isResponse(auth)) return auth;

    const params = new URL(request.url).searchParams;
    const query = (params.get("q") ?? "").trim();
    const page = Math.max(
      1,
      Number.parseInt(params.get("page") ?? "1", 10) || 1,
    );
    const perPage = Math.min(
      MAX_PER_PAGE,
      Math.max(
        1,
        Number.parseInt(params.get("per_page") ?? "", 10) || DEFAULT_PER_PAGE,
      ),
    );
    const orientation = params.get("orientation") ?? "";

    const apiKey = options.apiKey ?? process.env.PEXELS_API_KEY;
    if (!apiKey) {
      return json({
        photos: [],
        hasMore: false,
        configured: false,
      } satisfies StockPhotoResponse);
    }

    const cacheKey = `${query}|${page}|${perPage}|${orientation}`;
    const cached = cache.read(cacheKey);
    if (cached) return json(cached);

    // 검색어가 없으면 큐레이션 — 빈 격자보다 고를 거리를 먼저 보여준다.
    const url = new URL(
      query ? `${PEXELS_API}/search` : `${PEXELS_API}/curated`,
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    if (query) {
      url.searchParams.set("query", query);
      // 한글 검색어는 locale을 알려 줘야 걸린다.
      if (HANGUL.test(query)) url.searchParams.set("locale", "ko-KR");
      if (orientation) url.searchParams.set("orientation", orientation);
    }

    try {
      const response = await fetch(url, {
        headers: { Authorization: apiKey },
        // 프레임워크의 라우트 캐시가 아니라 위의 메모리 캐시를 정본으로 쓴다.
        cache: "no-store",
        signal: request.signal,
      });
      if (!response.ok) {
        options.onError?.(new Error(`Pexels ${response.status}`), {
          route: "stock-photos",
          status: response.status,
          query,
        });
        return json(
          { error: "stock-photo-search-failed" },
          response.status === 429 ? 429 : 502,
        );
      }

      const data = (await response.json()) as {
        photos?: PexelsPhoto[];
        next_page?: string;
      };
      const photos = (data.photos ?? []).map(normalizePhoto);
      const body: StockPhotoResponse = {
        photos,
        hasMore: Boolean(data.next_page) && photos.length > 0,
        configured: true,
      };
      cache.write(cacheKey, body);
      return json(body);
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      options.onError?.(error, { route: "stock-photos", query });
      return json({ error: "stock-photo-search-failed" }, 502);
    }
  };
}
