"use client";

/**
 * 한 번 받은 그림을 **탭이 살아 있는 동안 들고 있는** 자리.
 *
 * 작업 영역은 화면에서 멀어진 페이지의 Stage를 통째로 버린다(`useNearViewport`).
 * 그래야 30섹션짜리 문서가 도는데, 대신 다시 다가올 때마다 `new Image()`가 새로
 * 만들어졌다. 브라우저 HTTP 캐시가 있어도 **디코드와 `onload` 한 바퀴가 다시 돌아서**
 * 그 사이 한 프레임 이상 빈 자리가 보인다 — 빠르게 굴리면 사진이 계속 깜빡인다.
 *
 * 그래서 요소가 아니라 **주소**를 기준으로 `HTMLImageElement`를 들고 있는다. 다시
 * 붙는 순간 이미 디코드된 그림이 그 자리에서 나오므로 깜빡임이 없다.
 *
 * 무한정 들고 있지는 않는다. 750×2000짜리 사진 한 장이 디코드되면 6MB쯤 되므로
 * LRU로 `MAX_ENTRIES`장까지만 남긴다 — 35섹션 문서 한 벌은 충분히 덮는다.
 *
 * 실패도 기록한다(`null`). 안 그러면 못 받는 주소를 스크롤할 때마다 다시 두드린다.
 */

/** 들고 있을 최대 장수. 넘으면 가장 오래 안 쓴 것부터 버린다. */
const MAX_ENTRIES = 160;

/** 주소 → 다 받은 그림(못 받았으면 null). Map은 삽입 순서를 지켜 LRU로 쓴다. */
const done = new Map<string, HTMLImageElement | null>();
/** 받는 중인 주소. 같은 그림을 두 요소가 함께 쓰면 요청은 한 번이다. */
const inflight = new Map<string, Promise<HTMLImageElement | null>>();

function touch(src: string, image: HTMLImageElement | null): void {
  done.delete(src);
  done.set(src, image);
  while (done.size > MAX_ENTRIES) {
    const oldest = done.keys().next();
    if (oldest.done) break;
    done.delete(oldest.value);
  }
}

/** 이미 받아 둔 그림. 아직 모르거나 못 받았으면 null. */
export function cachedImage(src: string): HTMLImageElement | null {
  if (!src) return null;
  const hit = done.get(src);
  if (hit === undefined) return null;
  // 꺼내 쓴 것은 최근으로 올린다.
  touch(src, hit);
  return hit;
}

/** 이 주소를 이미 판정했는가(성공이든 실패든). 다시 두드릴지 정하는 데 쓴다. */
export function isImageSettled(src: string): boolean {
  return done.has(src);
}

/**
 * 주소 하나를 받아 캐시에 올린다. 이미 있으면 그것을, 받는 중이면 그 약속을 준다.
 *
 * `crossOrigin`은 항상 `anonymous`다 — 없으면 캔버스가 오염되어 `toDataURL`이
 * 통째로 막힌다(내려받기·썸네일이 여기에 걸린다).
 */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  if (done.has(src)) return Promise.resolve(cachedImage(src));
  const pending = inflight.get(src);
  if (pending) return pending;
  if (typeof window === "undefined") return Promise.resolve(null);

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      inflight.delete(src);
      touch(src, image);
      resolve(image);
    };
    image.onerror = () => {
      inflight.delete(src);
      touch(src, null);
      resolve(null);
    };
    image.src = src;
  });
  inflight.set(src, promise);
  return promise;
}

/** 여러 장을 한꺼번에. 하나가 실패해도 나머지를 기다린다. */
export async function loadImages(sources: readonly string[]): Promise<void> {
  await Promise.all(sources.map((src) => loadImage(src)));
}

/** 테스트 전용 — 캐시는 모듈 수명이라 테스트 사이에 비워야 한다. */
export function clearImageCache(): void {
  done.clear();
  inflight.clear();
}
