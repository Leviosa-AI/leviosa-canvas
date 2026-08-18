/**
 * 라우트 팩토리가 공유하는 것들.
 *
 * ## 왜 패키지가 라우트를 들고 있나
 *
 * 편집기의 사진·아이콘 검색은 **브라우저가 직접 못 부른다** — Pexels 키를 번들에 실을 수
 * 없고, Iconify 는 라이선스 게이트와 한국어 확장을 서버에서 걸어야 한다. 그래서 소비자
 * 앱에 라우트가 하나씩 있어야 하는데, 그 라우트를 소비자가 **직접 쓰게 두었더니**
 * 첫 소비자만 갖고 있고 두 번째 소비자에는 없었다. 편집기 화면의 두 패널이 404 로 죽는
 * 것을 "설치 안내를 안 읽어서"라고 부를 수는 없다.
 *
 * 이제 구현은 여기 있고 소비자는 한 줄로 마운트한다.
 *
 * ```ts
 * // app/api/icons/route.ts
 * export { GET } from "@leviosa-ai/detail-page-editor/server/icons";
 * ```
 *
 * ## 왜 `next/server` 를 안 쓰나
 *
 * 표준 `Request`/`Response` 로 적으면 Next 라우트 핸들러가 그대로 받는다(그쪽 타입이
 * 이것의 확장이다). 프레임워크를 하나 덜 알면 이 파일은 Next 가 아닌 소비자에게도 선다.
 */

/**
 * 인증. 통과하면 사용자 신원을, 막을 거면 `Response` 를 그대로 돌려준다.
 *
 * `Response` 를 반환값으로 받는 이유는 401 의 **모양**이 앱마다 다르기 때문이다.
 * 우리가 정해서 내려보내면 소비자의 오류 규약과 어긋난 본문이 하나 생긴다.
 */
export type EditorRouteAuthorize = (
  request: Request,
) => Promise<{ userId: string } | Response> | ({ userId: string } | Response);

export type EditorRouteOptions = {
  /**
   * 안 주면 **누구나 부를 수 있다.**
   *
   * 아이콘은 공개 API 프록시라 그래도 되지만, 사진은 우리 Pexels 키를 태우므로
   * (시간당 200회) 로그인 게이트를 거는 것이 맞다.
   */
  authorize?: EditorRouteAuthorize;
  /**
   * 사고를 앱의 관측 체계로 보낸다. 안 주면 조용히 지나간다 — 응답은 그대로 나간다.
   */
  onError?: (error: unknown, context: Record<string, unknown>) => void;
};

/** 인증을 태운다. `Response` 가 나오면 호출부가 그대로 반환해야 한다. */
export async function authorizeRequest(
  request: Request,
  authorize: EditorRouteAuthorize | undefined,
): Promise<{ userId: string } | Response> {
  if (!authorize) return { userId: "anonymous" };
  return await authorize(request);
}

export function isResponse(value: unknown): value is Response {
  return typeof Response !== "undefined" && value instanceof Response;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * 프로세스 메모리 LRU. 오래된 것부터 버린다(Map 은 삽입 순서를 지킨다).
 *
 * 서버리스에서 인스턴스마다 따로 산다는 것을 알고 쓴다 — 적중률이 낮아질 뿐 틀리지 않고,
 * 공유 캐시를 요구하면 소비자가 Redis 를 세워야 편집기가 뜨는 셈이 된다.
 */
export function makeCache<T>(ttlMs: number, maxEntries: number) {
  const store = new Map<string, { value: T; expiry: number }>();
  return {
    read(key: string): T | null {
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() >= hit.expiry) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    write(key: string, value: T): void {
      if (store.size >= maxEntries) {
        const oldest = store.keys().next();
        if (!oldest.done) store.delete(oldest.value);
      }
      store.set(key, { value, expiry: Date.now() + ttlMs });
    },
  };
}

export async function getJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`upstream ${response.status} ${url}`);
  return (await response.json()) as T;
}
