import { afterEach, describe, expect, it, vi } from "vitest";

import { createStockPhotosRoute } from "../stock-photos";
import { createIconsRoute } from "../icons";

/**
 * 라우트 팩토리가 지켜야 하는 것.
 *
 * 이 구현은 소비자 앱마다 한 벌씩 있던 것을 패키지로 들여온 것이다. 그래서 여기서 재는
 * 것은 검색 품질이 아니라 **소비자가 잘못 꽂았을 때의 태도**다 — 키가 없을 때, 인증이
 * 막을 때, 상류가 죽었을 때. 셋 다 편집기가 못 뜨는 이유가 되면 안 된다.
 */

const upstream = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  upstream.mockReset();
  delete process.env.PEXELS_API_KEY;
});

function get(url: string): Request {
  return new Request(url);
}

describe("스톡 사진", () => {
  it("키가 없으면 오류가 아니라 configured:false 다", async () => {
    const GET = createStockPhotosRoute();
    const response = await GET(get("https://app.test/api/stock-photos?page=1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      photos: [],
      hasMore: false,
      configured: false,
    });
    // 상류를 두드리지도 않는다.
    expect(upstream).not.toHaveBeenCalled();
  });

  it("authorize 가 Response 를 주면 그대로 나간다", async () => {
    const GET = createStockPhotosRoute({
      apiKey: "k",
      authorize: () =>
        new Response(JSON.stringify({ error: "nope" }), { status: 401 }),
    });
    const response = await GET(get("https://app.test/api/stock-photos"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "nope" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("검색어가 없으면 curated 를 부른다", async () => {
    upstream.mockResolvedValue(
      Response.json({ photos: [], next_page: null }) as never,
    );
    const GET = createStockPhotosRoute({ apiKey: "k" });
    await GET(get("https://app.test/api/stock-photos?page=1&per_page=24"));

    const called = String(upstream.mock.calls[0]?.[0]);
    expect(called).toContain("/curated");
    expect(called).toContain("per_page=24");
  });

  it("한글 검색어에는 locale 을 붙인다", async () => {
    upstream.mockResolvedValue(Response.json({ photos: [] }) as never);
    const GET = createStockPhotosRoute({ apiKey: "k" });
    await GET(get("https://app.test/api/stock-photos?q=%EB%B0%94%EB%8B%A4"));

    const called = String(upstream.mock.calls[0]?.[0]);
    expect(called).toContain("/search");
    expect(called).toContain("locale=ko-KR");
  });

  /** 429 를 502 로 뭉개면 소비자가 한도 초과를 장애와 구분 못 한다. */
  it("상류 429 는 429 로 내려간다", async () => {
    upstream.mockResolvedValue(new Response(null, { status: 429 }) as never);
    const onError = vi.fn();
    const GET = createStockPhotosRoute({ apiKey: "k", onError });
    const response = await GET(get("https://app.test/api/stock-photos?q=a"));

    expect(response.status).toBe(429);
    expect(onError).toHaveBeenCalled();
  });

  it("상류가 죽으면 502 이고 onError 로 알린다", async () => {
    upstream.mockRejectedValue(new Error("network"));
    const onError = vi.fn();
    const GET = createStockPhotosRoute({ apiKey: "k", onError });
    const response = await GET(get("https://app.test/api/stock-photos?q=b"));

    expect(response.status).toBe(502);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      route: "stock-photos",
      query: "b",
    });
  });
});

describe("아이콘", () => {
  it("authorize 가 Response 를 주면 그대로 나간다", async () => {
    const GET = createIconsRoute({
      authorize: () => new Response(null, { status: 403 }),
    });
    const response = await GET(get("https://app.test/api/icons"));

    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  /**
   * 상류가 통째로 죽어도 502 한 번으로 끝난다. 예전에 이 자리가 던지면 라우트 핸들러가
   * 스택트레이스를 그대로 내려보냈다 — 소비자 앱의 오류 규약 밖의 응답이다.
   */
  it("상류가 죽으면 502 이고 onError 로 알린다", async () => {
    upstream.mockRejectedValue(new Error("iconify down"));
    const onError = vi.fn();
    const GET = createIconsRoute({ onError });
    const response = await GET(get("https://app.test/api/icons?q=truck"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "icon-search-failed" });
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ route: "icons", query: "truck" }),
    );
  });
});
