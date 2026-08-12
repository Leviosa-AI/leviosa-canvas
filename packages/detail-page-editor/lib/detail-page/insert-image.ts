/**
 * Insert a personal image/GIF onto the active Canvas page.
 *
 * Every image is measured and placed at its own aspect ratio, fitted inside a
 * box of 62% of the page. Stills used to drop in as a fixed ``62% × 62%``
 * *square* regardless of the source: on a 750-wide page every asset landed at
 * 465×465, and since Canvas cover-crops images, a tall product cutout was
 * center-cropped to a square. Fitting to the real ratio makes the element match
 * the source, so the cover-crop becomes a no-op.
 *
 * The box is capped on both axes — capping width alone let a tall cutout
 * (e.g. 171×669) come in at 465×1817 and run off a short section page.
 *
 * GIFs are additionally tagged ``custom.detailPageGif`` so the exporter treats
 * their section as animated even if the presigned URL lacks a ``.gif`` suffix.
 */

type AddElementOpts = Record<string, unknown>;
type PageLike = {
  computedWidth: number;
  computedHeight: number;
  addElement: (opts: AddElementOpts) => unknown;
};
type StoreLike = { activePage?: PageLike; pages: PageLike[] };

const BOX_RATIO = 0.62;

export function insertPersonalImage(
  store: unknown,
  src: string,
  opts: { isGif?: boolean } = {},
): void {
  const s = store as StoreLike;
  const page = s.activePage ?? s.pages[0];
  if (!page) return;
  const maxWidth = page.computedWidth * BOX_RATIO;
  const maxHeight = page.computedHeight * BOX_RATIO;

  const place = (width: number, height: number) => {
    page.addElement({
      type: "image",
      src,
      x: Math.round((page.computedWidth - width) / 2),
      y: Math.round((page.computedHeight - height) / 2),
      width,
      height,
      // GIF는 레이어 트리에서 "image-2" 같은 자동 이름 대신 "GIF"로 보이게 이름을
      // 박고, 내보내기가 이 섹션을 애니메이션으로 다루도록 custom 플래그를 단다.
      ...(opts.isGif ? { name: "GIF", custom: { detailPageGif: true } } : {}),
    });
  };

  /** 원본 비율을 박스 안에 맞춘다. 어느 축으로도 박스를 넘지 않는다. */
  const fit = (naturalWidth: number, naturalHeight: number) => {
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      place(Math.round(maxWidth), Math.round(maxWidth));
      return;
    }
    const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
    place(Math.round(naturalWidth * scale), Math.round(naturalHeight * scale));
  };

  // Load with the same ``crossOrigin`` mode Canvas/Konva uses for the canvas.
  // The S3 bucket DOES send CORS headers, but only when the request carries an
  // ``Origin`` (and it omits ``Vary: Origin``): a no-CORS preload here caches an
  // ACAO-less 200 that Konva's later crossOrigin load then reuses → blocked as
  // "Can not load the image...". Matching the mode makes both share a CORS-safe
  // cache entry. data: URIs never need CORS.
  const img = new Image();
  if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
  img.onload = () => fit(img.naturalWidth, img.naturalHeight);
  // 측정 실패는 배치 실패가 아니다 — 예전처럼 정사각으로라도 넣는다.
  img.onerror = () => place(Math.round(maxWidth), Math.round(maxWidth));
  img.src = src;
}
