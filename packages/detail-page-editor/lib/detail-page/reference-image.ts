/**
 * 첨부한 레퍼런스 사진을 **모델에 보낼 크기**로 줄인다.
 *
 * 유저가 붙이는 것은 대개 남의 상세페이지 스크린샷이라 길이가 몇천 픽셀이고 파일도
 * 수 MB다. 그대로 보내면 요청 본문이 통째로 커지는데, 정작 모델이 읽는 것은 배치와
 * 구성뿐이라 긴 변 1,024px 이면 충분하다. 비용도 여기서 갈린다 — 비전 입력은 픽셀이
 * 아니라 타일 수로 계산되므로 줄인 만큼 그대로 싸진다.
 *
 * JPEG 로 굳힌다. 레퍼런스는 사진이지 도형이 아니라서 무손실이 필요 없고, PNG 로 두면
 * 같은 그림이 서너 배 무겁다.
 */

/** 긴 변 상한. 이보다 작은 그림은 확대하지 않는다. */
export const REFERENCE_MAX_EDGE = 1024;

const QUALITY = 0.82;

/**
 * 디코드 상한. 넘기면 줄이기를 포기하고 원본을 쓴다.
 *
 * 깨진 파일이나 디코더가 못 읽는 포맷은 ``onload`` 도 ``onerror`` 도 **안 뜬다.** 기다리는
 * 쪽에 상한이 없으면 모달이 제출을 누른 채로 굳는다 — 유저에게는 그냥 먹통이다.
 */
const DECODE_TIMEOUT_MS = 3000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(
      () => reject(new Error("image decode timed out")),
      DECODE_TIMEOUT_MS,
    );
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("image decode failed"));
    };
    img.src = src;
  });
}

function readAsDataUri(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("read failed"));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** 파일 바이트를 그대로 data URI 로. 붙이자마자 썸네일을 띄우는 데 쓴다. */
export function readImageFileAsDataUri(file: File): Promise<string> {
  return readAsDataUri(file);
}

/**
 * 줄이기 결과. ``width``/``height`` 는 **보낼 그림의 크기**다 — 판독 값이 그 크기로
 * 정해지므로(비전 입력은 타일 수로 청구된다) 원본이 아니라 줄인 뒤 크기여야 한다.
 * 디코드가 안 되면 0 이고, 그때는 부르는 쪽이 "모른다"로 다뤄야 한다.
 */
export type ShrunkReference = { uri: string; width: number; height: number };

/**
 * 이미 읽어 둔 data URI 를 줄인다. 디코드나 캔버스가 안 되면 **원본을 그대로** 돌려준다 —
 * 줄이지 못한 것이 아예 못 붙이는 것보다 낫다.
 */
export async function shrinkReferenceDataUri(
  original: string,
): Promise<ShrunkReference> {
  // 캔버스를 **디코드보다 먼저** 확인한다. 그릴 곳이 없으면 어차피 줄이지 못하는데,
  // 순서를 뒤집으면 줄이지도 못할 그림을 몇 초씩 기다렸다가 포기하게 된다.
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { uri: original, width: 0, height: 0 };

  try {
    const img = await loadImage(original);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) return { uri: original, width: 0, height: 0 };
    const scale = Math.min(1, REFERENCE_MAX_EDGE / longest);
    if (scale >= 1) {
      // 줄일 것이 없어도 크기는 안다 — 여기서 0 을 내면 안 줄인 그림만 값이 비싸진다.
      return { uri: original, width: img.naturalWidth, height: img.naturalHeight };
    }

    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      uri: canvas.toDataURL("image/jpeg", QUALITY),
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    return { uri: original, width: 0, height: 0 };
  }
}
