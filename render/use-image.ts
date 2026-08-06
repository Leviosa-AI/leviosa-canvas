"use client";

import { useEffect, useState } from "react";

/**
 * 주소 하나를 `HTMLImageElement`로. 아직 안 왔거나 실패하면 null이다.
 *
 * 주소가 바뀌는 동안 **이전 그림을 계속 보여주지 않는다** — 로딩 중에 옛 사진이 남아
 * 있으면 슬롯을 갈아 끼웠는데 안 바뀐 것처럼 보인다.
 */
export function useImage(src: string): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{
    src: string;
    image: HTMLImageElement | null;
  }>({ src: "", image: null });

  useEffect(() => {
    if (!src) return;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setLoaded({ src, image });
    image.onerror = () => setLoaded({ src, image: null });
    image.src = src;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);

  return loaded.src === src ? loaded.image : null;
}
