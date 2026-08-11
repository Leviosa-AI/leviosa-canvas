/**
 * 한 번 받은 그림을 들고 있는가.
 *
 * 이게 없으면 화면 밖으로 나갔다 돌아온 페이지가 매번 `new Image()`를 다시 만들고,
 * 그 한 바퀴 동안 사진 자리가 빈다 — 빠르게 굴리면 계속 깜빡인다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cachedImage,
  clearImageCache,
  isImageSettled,
  loadImage,
} from "@/lib/leviosa-canvas/render/image-cache";

/** 만들어진 가짜 그림들 — 몇 번 만들었는지 세려고 들고 있는다. */
let made: FakeImage[] = [];

class FakeImage {
  crossOrigin = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 10;
  naturalHeight = 10;
  #src = "";

  constructor() {
    made.push(this);
  }

  set src(value: string) {
    this.#src = value;
  }
  get src(): string {
    return this.#src;
  }

  settle(ok: boolean): void {
    if (ok) this.onload?.();
    else this.onerror?.();
  }
}

beforeEach(() => {
  made = [];
  clearImageCache();
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearImageCache();
  vi.restoreAllMocks();
});

describe("이미지 캐시", () => {
  it("받아 둔 그림은 다시 안 만든다", async () => {
    const first = loadImage("/a.png");
    made[0].settle(true);
    await first;
    expect(made).toHaveLength(1);

    await loadImage("/a.png");
    expect(made).toHaveLength(1);
    expect(cachedImage("/a.png")).toBe(made[0]);
  });

  it("같은 주소를 동시에 부르면 요청은 한 번이다", async () => {
    const a = loadImage("/b.png");
    const b = loadImage("/b.png");
    expect(made).toHaveLength(1);
    made[0].settle(true);
    expect(await a).toBe(await b);
  });

  it("실패도 기억한다 — 스크롤할 때마다 다시 두드리지 않는다", async () => {
    const first = loadImage("/bad.png");
    made[0].settle(false);
    expect(await first).toBeNull();
    expect(isImageSettled("/bad.png")).toBe(true);

    expect(await loadImage("/bad.png")).toBeNull();
    expect(made).toHaveLength(1);
  });

  it("아직 모르는 주소는 null이고 판정도 안 났다", () => {
    expect(cachedImage("/unknown.png")).toBeNull();
    expect(isImageSettled("/unknown.png")).toBe(false);
  });

  it("빈 주소는 아무것도 안 만든다", async () => {
    expect(await loadImage("")).toBeNull();
    expect(made).toHaveLength(0);
  });

  it("캔버스가 오염되지 않게 crossOrigin을 단다", async () => {
    // 이게 없으면 `toDataURL`이 통째로 막힌다(내려받기·썸네일이 여기 걸린다).
    const pending = loadImage("/c.png");
    expect(made[0].crossOrigin).toBe("anonymous");
    made[0].settle(true);
    await pending;
  });
});
