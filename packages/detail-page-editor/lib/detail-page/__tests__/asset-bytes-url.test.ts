import { describe, expect, it } from "vitest";

import {
  assetBytesUrl,
  normalizeDocumentAssetSrcs,
} from "../asset-bytes-url";

/**
 * 브랜드 자산 주소는 presigned S3 URL 로 302 리다이렉트한다. 교차 출처 리다이렉트에서
 * 브라우저가 Origin 을 ``null`` 로 바꿔 보내고, 버킷 CORS 는 우리 도메인만 허용하므로
 * 그 요청이 거부된다 — ``fetch`` 만이 아니라 ``crossOrigin`` 을 켠 ``<img>`` 도 같이
 * 막힌다. 캔버스는 내보내기 때문에 늘 ``crossOrigin`` 으로 읽으므로, 꽂은 자산이 점선
 * 빈 상자로만 보였다.
 */
describe("assetBytesUrl", () => {
  it("서명 경로는 raw=1 로 돌린다", () => {
    expect(assetBytesUrl("/api/v1/brands/assets/file/a1?sig=abc")).toBe(
      "/api/v1/brands/assets/file/a1?sig=abc&raw=1",
    );
  });

  it("절대 주소로 와도 알아본다", () => {
    expect(
      assetBytesUrl("https://dev.leviosa.ai.kr/api/v1/brands/assets/file/a1?sig=abc"),
    ).toBe("https://dev.leviosa.ai.kr/api/v1/brands/assets/file/a1?sig=abc&raw=1");
  });

  it("이미 raw 가 붙어 있으면 그대로 둔다", () => {
    const url = "/api/v1/brands/assets/file/a1?sig=abc&raw=1";
    expect(assetBytesUrl(url)).toBe(url);
  });

  it("presigned S3 직결 주소는 손대지 않는다", () => {
    // 이쪽은 리다이렉트가 없어 CORS 가 정상으로 걸린다 — 건드리면 서명이 깨진다.
    const url = "https://bucket.s3.ap-northeast-2.amazonaws.com/x.gif?X-Amz-Signature=1";
    expect(assetBytesUrl(url)).toBe(url);
  });

  it("data URI·정적 파일도 그대로", () => {
    expect(assetBytesUrl("data:image/gif;base64,R0lGOD")).toBe(
      "data:image/gif;base64,R0lGOD",
    );
    expect(assetBytesUrl("/dev-fixtures/a.gif")).toBe("/dev-fixtures/a.gif");
    expect(assetBytesUrl("")).toBe("");
  });

  it("경로가 아니라 쿼리에 그 문자열이 들어 있을 뿐이면 안 건드린다", () => {
    const url = "https://s3.example/x.gif?from=/api/v1/brands/assets/file/a1";
    expect(assetBytesUrl(url)).toBe(url);
  });
});

/**
 * 새로 꽂는 것만 고치면 어제까지 저장해 둔 문서는 계속 빈 상자로 열린다. 그래서 문서를
 * 열 때 한 번 훑는다.
 */
describe("normalizeDocumentAssetSrcs", () => {
  it("그룹 안까지 내려가 src·clipSrc·maskSrc 를 모두 옮긴다", () => {
    const doc = {
      pages: [
        {
          children: [
            { id: "a", src: "/api/v1/brands/assets/file/a1?sig=x" },
            {
              id: "g",
              children: [
                {
                  id: "b",
                  src: "/api/v1/brands/assets/file/b1?sig=y",
                  clipSrc: "/api/v1/brands/assets/file/c1?sig=z",
                  maskSrc: "https://s3.example/m.png",
                },
              ],
            },
          ],
        },
      ],
    };

    normalizeDocumentAssetSrcs(doc);

    expect(doc.pages[0].children[0].src).toBe(
      "/api/v1/brands/assets/file/a1?sig=x&raw=1",
    );
    const inner = doc.pages[0].children[1].children![0];
    expect(inner.src).toBe("/api/v1/brands/assets/file/b1?sig=y&raw=1");
    expect(inner.clipSrc).toBe("/api/v1/brands/assets/file/c1?sig=z&raw=1");
    expect(inner.maskSrc).toBe("https://s3.example/m.png");
  });

  it("두 번 돌려도 결과가 같다(문서를 다시 열어도 안전)", () => {
    const doc = {
      pages: [{ children: [{ id: "a", src: "/api/v1/brands/assets/file/a1?sig=x" }] }],
    };
    normalizeDocumentAssetSrcs(doc);
    const once = doc.pages[0].children[0].src;
    normalizeDocumentAssetSrcs(doc);
    expect(doc.pages[0].children[0].src).toBe(once);
  });

  it("페이지가 없거나 모양이 다른 문서에도 터지지 않는다", () => {
    expect(() => normalizeDocumentAssetSrcs({})).not.toThrow();
    expect(() => normalizeDocumentAssetSrcs(null)).not.toThrow();
    expect(() => normalizeDocumentAssetSrcs({ pages: [{}] })).not.toThrow();
  });
});
