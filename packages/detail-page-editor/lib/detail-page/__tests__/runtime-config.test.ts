import { beforeEach, describe, expect, it } from "vitest";

import {
  configureDetailPageEditor,
  detailPageEditorConfig,
  editorAssetBase,
  editorEndpoint,
  fontBundleAbsoluteUrl,
} from "../runtime-config";
import { searchStockPhotos } from "../stock-photos";
import { searchIcons } from "../icons";

/** 모듈 수준 상태라 테스트마다 되돌린다(설정은 통째로 갈아 끼워진다). */
beforeEach(() => {
  configureDetailPageEditor({});
});

describe("기본값", () => {
  /**
   * 첫 소비자(leviosa-frontend)는 이 파일이 들어와도 손댈 것이 없어야 한다. 기본값이
   * 예전 주소와 한 글자라도 다르면 그 앱의 사진·아이콘·폰트가 조용히 죽는다.
   */
  it("아무것도 설정 안 하면 예전 주소 그대로다", () => {
    expect(editorEndpoint("stockPhotos")).toBe("/api/stock-photos");
    expect(editorEndpoint("icons")).toBe("/api/icons");
    expect(editorAssetBase("fontBundle")).toBe("/render-fonts");
    expect(editorAssetBase("detailFontPreviews")).toBe("/detail-font-previews");
    expect(editorAssetBase("cardnewsFontPreviews")).toBe(
      "/cardnews-font-previews",
    );
    expect(editorAssetBase("gifEffectPreviews")).toBe("/gif-effect-previews");
  });
});

describe("basePath", () => {
  it("주소 전부에 앞에 붙는다", () => {
    configureDetailPageEditor({ basePath: "/agency" });
    expect(editorEndpoint("icons")).toBe("/agency/api/icons");
    expect(editorAssetBase("fontBundle")).toBe("/agency/render-fonts");
    expect(editorAssetBase("gifEffectPreviews")).toBe(
      "/agency/gif-effect-previews",
    );
  });

  it("앞뒤 슬래시를 흘려도 같은 값이 나온다", () => {
    configureDetailPageEditor({ basePath: "agency/" });
    expect(editorEndpoint("icons")).toBe("/agency/api/icons");
  });

  it("두 번 불러도 마지막 것이 이긴다", () => {
    configureDetailPageEditor({ basePath: "/a" });
    configureDetailPageEditor({ basePath: "/b" });
    expect(detailPageEditorConfig().basePath).toBe("/b");
  });

  it("basePath 와 명시 주소를 같이 주면 명시 쪽이 이긴다", () => {
    configureDetailPageEditor({
      basePath: "/agency",
      endpoints: { icons: "/elsewhere/icons" },
    });
    expect(editorEndpoint("icons")).toBe("/elsewhere/icons");
    // 안 준 것은 basePath 에서 파생된다.
    expect(editorEndpoint("stockPhotos")).toBe("/agency/api/stock-photos");
  });
});

describe("폰트 번들 절대 주소", () => {
  it("경로 설정이면 준 오리진을 앞에 붙인다", () => {
    configureDetailPageEditor({ basePath: "/agency" });
    expect(
      fontBundleAbsoluteUrl("https://x.example", "/family-css/a-400.css"),
    ).toBe("https://x.example/agency/render-fonts/family-css/a-400.css");
  });

  it("설정이 이미 절대 주소면 오리진을 안 본다", () => {
    configureDetailPageEditor({
      assets: { fontBundle: "https://cdn.example/fonts" },
    });
    expect(fontBundleAbsoluteUrl("http://localhost:3000", "/a.css")).toBe(
      "https://cdn.example/fonts/a.css",
    );
  });

  /** 서버가 받아가야 하는 주소라, http 오리진 + 상대 경로면 만들 수 없다. */
  it("http 오리진에 상대 경로면 못 만든다", () => {
    expect(fontBundleAbsoluteUrl("http://localhost:3000", "/a.css")).toBeNull();
  });
});

describe("검색이 설정된 주소를 부른다", () => {
  function captureFetch(): { url: () => string } {
    let seen = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen = String(input);
      return new Response(JSON.stringify({ photos: [], items: [] }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    return { url: () => seen };
  }

  it("스톡 사진", async () => {
    configureDetailPageEditor({ basePath: "/agency" });
    const seen = captureFetch();
    await searchStockPhotos({ query: "", page: 1, perPage: 24 });
    expect(seen.url()).toBe("/agency/api/stock-photos?page=1&per_page=24");
  });

  it("아이콘", async () => {
    configureDetailPageEditor({ basePath: "/agency" });
    const seen = captureFetch();
    await searchIcons({ query: "", style: "stroke" });
    expect(seen.url()).toBe("/agency/api/icons?style=stroke");
  });
});
