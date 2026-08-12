"use client";

import { useEffect, useState } from "react";

import { cachedImage, isImageSettled, loadImage } from "./image-cache";

/**
 * 주소 하나를 `HTMLImageElement`로. 아직 안 왔거나 실패하면 null이다.
 *
 * 주소가 바뀌는 동안 **이전 그림을 계속 보여주지 않는다** — 로딩 중에 옛 사진이 남아
 * 있으면 슬롯을 갈아 끼웠는데 안 바뀐 것처럼 보인다.
 *
 * 받아 둔 그림은 `image-cache`가 들고 있어서, 화면 밖으로 나갔다 돌아온 페이지는
 * **첫 렌더에서 바로** 그림을 얻는다(빈 자리를 한 번 그렸다 채우지 않는다).
 */
export function useImage(src: string): HTMLImageElement | null {
  const ready = src ? cachedImage(src) : null;
  const [, bump] = useState(0);

  useEffect(() => {
    if (!src || isImageSettled(src)) return;
    let alive = true;
    void loadImage(src).then(() => {
      if (alive) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  return ready;
}
