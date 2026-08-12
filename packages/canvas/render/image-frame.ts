/**
 * 사진을 상자에 어떻게 앉히는가.
 *
 * 디컴포저는 상자를 템플릿 치수로 잡지만 사진의 비율은 그와 다르다. 그래서 **누끼는
 * 통째로 넣고(contain), 배경 사진은 잘라 채운다(cover).** 원본 프록시가 그렇게 그리고,
 * 지금 팔리는 편집기도 문서를 싣고 나서 같은 판단을 한다 — 다만 그쪽은 렌더러를 못 고쳐서
 * **요소 상자를 옮겨** 흉내 낸다. 우리는 렌더러를 들고 있으니 그리는 자리에서 바로 한다.
 *
 * 문서가 직접 `crop*`을 들고 있으면 그건 사람이 정한 자리다 — 우리가 다시 고르지 않고
 * 그 값을 그대로 쓴다.
 */

import { num, type Attrs } from "../types";

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** 그릴 자리(`dest`)와 원본에서 오려 올 자리(`crop`, 없으면 통째로). */
export type ImageFrame = { dest: Rect; crop?: Rect };

const CROP_KEYS = ["cropX", "cropY", "cropWidth", "cropHeight"] as const;

/** 문서가 crop을 명시했는가. 디컴포저는 이 자리를 `null`로 비워 둔다. */
export function hasDocumentCrop(el: Attrs): boolean {
  return CROP_KEYS.some((key) => typeof el[key] === "number");
}

/**
 * 문서의 crop 값으로 원본 사각형을 잡는다. 상자 비율에 맞춰 **crop 영역의 왼쪽 위에서**
 * 오린다 — 문서를 만든 렌더러와 같은 셈법이다(`gifSourceRect`와 같은 식).
 */
function documentSourceRect(el: Attrs, natural: Size, box: Size): Rect {
  const regionWidth = natural.width * num(el, "cropWidth", 1);
  const regionHeight = natural.height * num(el, "cropHeight", 1);
  const x = natural.width * num(el, "cropX", 0);
  const y = natural.height * num(el, "cropY", 0);
  if (!(regionWidth > 0 && regionHeight > 0)) {
    return { x, y, width: natural.width, height: natural.height };
  }
  const boxAspect = box.width / box.height;
  const regionAspect = regionWidth / regionHeight;
  const width = boxAspect >= regionAspect ? regionWidth : regionHeight * boxAspect;
  const height = boxAspect >= regionAspect ? regionWidth / boxAspect : regionHeight;
  return { x, y, width, height };
}

/**
 * @param transparent 누끼(알파가 있는 그림)인가. 못 읽으면 아니라고 보는 쪽이 안전하다 —
 *   배경 사진이 훨씬 흔하고, 통째로 넣었다가는 여백이 생겨 페이지가 비어 보인다.
 */
export function imageFrame(
  el: Attrs,
  natural: Size,
  box: Size,
  transparent: boolean,
): ImageFrame {
  const dest = { x: 0, y: 0, width: box.width, height: box.height };
  const iw = natural.width;
  const ih = natural.height;
  if (!(iw > 0 && ih > 0 && box.width > 0 && box.height > 0)) return { dest };

  // 문서가 "늘여라"라고 했으면 늘인다.
  if (el.stretchEnabled === true) return { dest };
  if (hasDocumentCrop(el)) {
    return { dest, crop: documentSourceRect(el, natural, box) };
  }

  if (transparent) {
    // 누끼는 통째로 — 상자 안에 맞춰 넣고 가운데에 둔다. 남는 자리로 페이지 배경이 비친다.
    const scale = Math.min(box.width / iw, box.height / ih);
    const width = iw * scale;
    const height = ih * scale;
    return {
      dest: {
        x: (box.width - width) / 2,
        y: (box.height - height) / 2,
        width,
        height,
      },
    };
  }

  // 배경 사진은 상자를 채우고 넘치는 만큼 **가운데를 남기고** 잘라 낸다.
  const boxAspect = box.width / box.height;
  const imageAspect = iw / ih;
  const width = imageAspect > boxAspect ? ih * boxAspect : iw;
  const height = imageAspect > boxAspect ? ih : iw / boxAspect;
  return { dest, crop: { x: (iw - width) / 2, y: (ih - height) / 2, width, height } };
}

/** 한 번 재면 그림당 한 번만 재도록 붙잡아 둔다. */
const alphaCache = new WeakMap<HTMLImageElement, boolean>();

/**
 * 누끼인지 픽셀로 확인한다. 긴 변 48px로 줄여 보는 것으로 충분하다 — 누끼의 투명한
 * 가장자리는 아무리 줄여도 남는다. 픽셀을 못 읽으면(교차 출처 오염) 아니라고 답한다.
 */
export function imageHasAlpha(image: HTMLImageElement): boolean {
  const cached = alphaCache.get(image);
  if (cached !== undefined) return cached;
  let value = false;
  try {
    if (typeof document !== "undefined") {
      const longest = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = Math.min(1, 48 / (longest || 1));
      const w = Math.max(1, Math.round(image.naturalWidth * scale));
      const h = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(image, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 250) {
            value = true;
            break;
          }
        }
      }
    }
  } catch {
    value = false;
  }
  alphaCache.set(image, value);
  return value;
}
