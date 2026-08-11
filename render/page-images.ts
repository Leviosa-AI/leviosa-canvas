"use client";

import { imageSrc } from "./attrs";
import { loadImages } from "./image-cache";
import { svgSourceFor } from "./svg-source";

/**
 * 이 페이지가 그릴 그림들의 주소. 썸네일·내려받기가 "다 받았는지" 물어보는 자리다.
 *
 * 굽는 쪽이 이걸 안 기다리면 **글자와 도형만 있는 그림**이 나온다. Stage는 붙는 즉시
 * 그려지는데 사진은 그때 아직 안 왔기 때문이다 — 페이지 패널 썸네일에서 실제로 그랬다.
 *
 * `ElementView`가 그리는 것과 같은 규칙으로 고른다: 안 보이는 요소는 세지 않고,
 * `image`는 목업 자리표시까지, `svg`는 색을 갈아 끼운 뒤의 최종 주소로 본다.
 */

type ElementLike = {
  type?: string;
  visible?: boolean;
  children?: readonly ElementLike[];
  src?: unknown;
  custom?: unknown;
  colorsReplace?: unknown;
};

export function pageImageSources(page: {
  children?: readonly ElementLike[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (list: readonly ElementLike[] | undefined) => {
    for (const el of list ?? []) {
      if (el.visible === false) continue;
      if (el.children?.length) walk(el.children);
      const src =
        el.type === "image"
          ? imageSrc(el as never)
          : el.type === "svg"
            ? (svgSourceFor(el) ?? "")
            : "";
      if (src && !seen.has(src)) {
        seen.add(src);
        out.push(src);
      }
    }
  };
  walk(page.children);
  return out;
}

/** 브라우저가 한 번 더 그릴 틈. 리액트가 받은 그림으로 다시 커밋할 시간을 준다. */
function nextPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** 이 페이지의 그림이 전부 캐시에 오를 때까지. 그 뒤 한 프레임을 더 기다린다. */
export async function waitForPageImages(page: {
  children?: readonly ElementLike[];
}): Promise<void> {
  const sources = pageImageSources(page);
  if (!sources.length) return;
  await loadImages(sources);
  await nextPaint();
}
