/**
 * 브랜드 자산을 **바이트로 읽을 때** 쓸 주소로 바꾼다.
 *
 * 문서에 박히는 브랜드 자산 주소(``/api/v1/brands/assets/file/{id}?sig=``)는 그 순간의
 * presigned S3 URL 로 302 리다이렉트한다. 리다이렉트가 **교차 출처**로 나가는 순간
 * 브라우저는 다음 요청의 Origin 을 ``null`` 로 바꿔 보내고, 버킷의 CORS 는 우리 도메인만
 * 허용하므로(와일드카드가 아니다) 그 요청은 거부된다.
 *
 * 그래서 이 주소는 **CORS 를 켜고 읽는 모든 소비자에게 막혀 있다.** 실제 자산으로 재면
 * 이렇다:
 *
 * | 읽는 방법 | 결과 |
 * |---|---|
 * | 302 경로 + ``crossOrigin`` | 막힘 |
 * | 302 경로, CORS 없이 | 뜬다 |
 * | ``raw=1`` + ``crossOrigin`` | 뜬다 |
 *
 * 처음엔 디코더(``fetch``)만 막힌 줄 알았지만, 캔버스는 내보내기 때문에 이미지를 항상
 * ``crossOrigin`` 으로 읽는다 — 그래서 편집기 이미지 자체가 안 뜨고 점선 빈 상자로 남는다.
 * 백엔드의 ``raw=1``(리다이렉트 없이 바이트) 로 돌리면 동일 출처 응답이라 둘 다 풀린다.
 *
 * 다른 주소(S3 presigned 직결·data URI·정적 파일)는 손대지 않는다.
 */

const BRAND_ASSET_FILE_PATH = "/api/v1/brands/assets/file/";

export function assetBytesUrl(src: string): string {
  const url = String(src ?? "");
  if (!url) return url;
  // 절대 주소로 와도 경로만 보면 된다(같은 오리진으로 서빙되므로).
  const path = url.split("?")[0];
  if (!path.includes(BRAND_ASSET_FILE_PATH)) return url;
  if (/[?&]raw=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}raw=1`;
}

type ElementLike = {
  src?: unknown;
  clipSrc?: unknown;
  maskSrc?: unknown;
  children?: unknown;
};

const SRC_KEYS = ["src", "clipSrc", "maskSrc"] as const;

/**
 * 이미 저장된 문서 안의 자산 주소를 바이트 경로로 옮긴다(제자리 수정, 멱등).
 *
 * 새로 꽂는 것만 고치면 **어제까지 저장해 둔 문서는 계속 빈 상자로 열린다.** 열 때 한 번
 * 훑는 편이 문서를 일괄 마이그레이션하는 것보다 안전하다 — 되돌릴 것이 없고, 브랜드 자산
 * 경로가 아닌 주소는 그대로 지나간다.
 */
export function normalizeDocumentAssetSrcs<T>(doc: T): T {
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const el = node as ElementLike;
      for (const key of SRC_KEYS) {
        if (typeof el[key] === "string") el[key] = assetBytesUrl(el[key] as string);
      }
      walk(el.children);
    }
  };
  const pages = (doc as { pages?: unknown })?.pages;
  if (Array.isArray(pages)) {
    for (const page of pages) walk((page as { children?: unknown })?.children);
  }
  return doc;
}
