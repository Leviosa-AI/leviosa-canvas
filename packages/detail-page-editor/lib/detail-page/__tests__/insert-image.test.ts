import { afterEach, describe, expect, it, vi } from "vitest";

import { insertPersonalImage } from "../insert-image";

type Added = Record<string, unknown>;

function makeStore(added: Added[]) {
  const page = {
    computedWidth: 1000,
    computedHeight: 800,
    addElement: (opts: Added) => {
      added.push(opts);
      return opts;
    },
  };
  return { activePage: page, pages: [page] };
}

/** 삽입은 naturalWidth/Height로 비율을 잡으려 Image를 로드한다 — onload를 즉시 발화. */
function stubImage(naturalWidth: number, naturalHeight: number) {
  const instances: FakeImage[] = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = naturalWidth;
    naturalHeight = naturalHeight;
    crossOrigin: string | null = null;
    constructor() {
      instances.push(this);
    }
    set src(_v: string) {
      this.onload?.();
    }
  }
  vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
  return instances;
}

/** 측정이 실패하는 경우(깨진 URL 등) — onerror를 발화. */
function stubBrokenImage() {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    crossOrigin: string | null = null;
    set src(_v: string) {
      this.onerror?.();
    }
  }
  vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("insertPersonalImage", () => {
  it("일반 이미지도 원본 비율로 앉는다 — 정사각 강제가 아니다", () => {
    // 예전엔 종류를 안 가리고 62%×62% 정사각이었다. 750폭 페이지에서 무엇을 넣든
    // 465×465로 들어왔고, 스톡 편집기가 cover-crop을 하니 세로 긴 누끼는 잘려 나갔다.
    stubImage(1500, 528); // 조립 배너 비율
    const added: Added[] = [];
    insertPersonalImage(makeStore(added), "https://s3/banner.png");
    expect(added).toHaveLength(1);
    const el = added[0];
    expect(el.type).toBe("image");
    expect(el.width).toBe(620); // 1000 * 0.62 (가로가 먼저 닿는다)
    expect(el.height).toBe(218); // 620 * 528/1500
    expect(el.custom).toBeUndefined();
  });

  it("세로로 긴 이미지는 높이에 걸려 페이지 밖으로 안 나간다", () => {
    // 선크림 누끼(171×669). 가로만 제한하면 465×1817이 되어 섹션을 뚫고 나간다.
    stubImage(171, 669);
    const added: Added[] = [];
    insertPersonalImage(makeStore(added), "https://s3/tube.png");
    const el = added[0];
    expect(el.height).toBe(496); // 800 * 0.62 (세로가 먼저 닿는다)
    expect(el.width).toBe(127); // 496 * 171/669
    expect(Number(el.height)).toBeLessThanOrEqual(800);
  });

  it("페이지 안에서 가운데 정렬한다", () => {
    stubImage(1500, 528);
    const added: Added[] = [];
    insertPersonalImage(makeStore(added), "https://s3/banner.png");
    const el = added[0];
    expect(el.x).toBe(190); // (1000 - 620) / 2
    expect(el.y).toBe(291); // (800 - 218) / 2
  });

  it("GIF는 원본 비율을 유지하고 custom.detailPageGif로 태깅한다", () => {
    stubImage(400, 200); // 2:1
    const added: Added[] = [];
    insertPersonalImage(makeStore(added), "https://s3/anim.gif", {
      isGif: true,
    });
    expect(added).toHaveLength(1);
    const el = added[0];
    expect(el.width).toBe(620);
    expect(el.height).toBe(310);
    expect(el.custom).toEqual({ detailPageGif: true });
  });

  it("GIF는 레이어 트리에서 자동 이름 대신 'GIF'로 뜨도록 name을 박는다", () => {
    stubImage(400, 400);
    const added: Added[] = [];
    insertPersonalImage(makeStore(added), "https://s3/anim.gif", {
      isGif: true,
    });
    expect(added[0].name).toBe("GIF");
  });

  it("일반 이미지에는 name을 강제하지 않는다(Canvas 기본 이름 유지)", () => {
    stubImage(400, 400);
    const added: Added[] = [];
    insertPersonalImage(makeStore(added), "https://s3/x.jpg");
    expect(added[0].name).toBeUndefined();
  });

  it("측정에 실패하면 예전처럼 정사각으로라도 넣는다", () => {
    stubBrokenImage();
    const added: Added[] = [];
    insertPersonalImage(makeStore(added), "https://s3/broken.png");
    expect(added).toHaveLength(1);
    expect(added[0].width).toBe(620);
    expect(added[0].height).toBe(620);
  });

  it("비율 프리로드는 crossOrigin='anonymous'로 로드한다(Konva CORS 캐시 오염 방지)", () => {
    // 프리로드가 no-CORS로 받으면 헤더 없는 응답이 캐시돼 Canvas/Konva의
    // crossOrigin 로드가 "Can not load the image..."로 깨진다. 로드 방식을 일치시킨다.
    const instances = stubImage(400, 400);
    insertPersonalImage(makeStore([]), "https://s3/anim.gif", { isGif: true });
    expect(instances).toHaveLength(1);
    expect(instances[0].crossOrigin).toBe("anonymous");
  });

  it("data: URI 프리로드는 crossOrigin을 설정하지 않는다", () => {
    const instances = stubImage(400, 400);
    insertPersonalImage(makeStore([]), "data:image/gif;base64,AAAA", {
      isGif: true,
    });
    expect(instances[0].crossOrigin).toBeNull();
  });

  it("페이지가 없으면 아무것도 하지 않는다", () => {
    stubImage(400, 400);
    const added: Added[] = [];
    insertPersonalImage({ pages: [] }, "https://s3/x.gif", { isGif: true });
    expect(added).toHaveLength(0);
  });
});
