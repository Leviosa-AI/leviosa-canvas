/**
 * 첨부한 레퍼런스 사진을 **모델에 보낼 크기**로 줄인다.
 *
 * 유저가 붙이는 것은 대개 남의 상세페이지 스크린샷이라 길이가 몇천 픽셀이고 파일도
 * 수 MB다. 그대로 보내면 요청 본문이 통째로 커지는데, 정작 모델이 읽는 것은 배치와
 * 구성뿐이라 긴 변 1,024px 이면 충분하다. 비용도 여기서 갈린다 — 비전 입력은 픽셀이
 * 아니라 타일 수로 계산되므로 줄인 만큼 그대로 싸진다.
 *
 * ## ⚠ 세로로 긴 캡쳐에 긴 변 상한을 쓰면 안 된다
 *
 * 위 문단은 **정사각에 가까운 그림에서만** 맞다. 상세페이지 전체 캡쳐는 긴 변이
 * 세로다. 실측 900×39418 짜리 캡쳐에 긴 변 1,024 를 걸면 **23×1024** 가 나온다 —
 * 폭 23픽셀에는 섹션 경계도 장식도 글자도 남지 않는다. 에러도 경고도 없이 통과하고,
 * 서버는 그 띠를 정상 입력으로 받는다. 저작이 "레퍼런스를 안 닮는" 사고의 실제 원인이
 * 이것이었다(2026-08-14, job e538ce45 — 명세·저작 두 턴이 모두 그 띠를 봤다).
 *
 * 서버는 세로로 긴 캡쳐를 폭을 살려 밴드로 나눠 싣는다
 * (`app/services/detail_page/design_reference.py` 의 ``_slice_into_bands``). 그러려면
 * **폭이 살아 있는 그림이 서버에 닿아야 한다.** 그래서 여기서는 세로로 긴 그림을
 * 만나면 긴 변이 아니라 **폭만** 기준으로 삼고, 줄일 것이 없으면 원본을 손대지 않고
 * 그대로 보낸다.
 *
 * JPEG 로 굳힌다. 레퍼런스는 사진이지 도형이 아니라서 무손실이 필요 없고, PNG 로 두면
 * 같은 그림이 서너 배 무겁다.
 */

/** 긴 변 상한. **세로로 긴 캡쳐에는 쓰지 않는다**(머리말 참조). */
export const REFERENCE_MAX_EDGE = 1024;

/**
 * 세로로 긴 캡쳐로 보는 종횡비(세로/가로). 서버의 ``BAND_TRIGGER_RATIO`` 와 같은 값이다 —
 * 여기서 통과시킨 그림을 저쪽이 밴드로 나누므로, 두 문턱이 어긋나면 "폭은 살렸는데
 * 서버는 안 나누는" 구간이 생긴다.
 */
export const TALL_TRIGGER_RATIO = 2.5;

/** 세로로 긴 캡쳐에서 지키는 폭. 서버의 밴드 폭(``BAND_WIDTH_PX``)과 같다. */
export const TALL_MAX_WIDTH = 1024;

/**
 * 세로로 긴 캡쳐에서 더는 못 내려가는 폭. 서버의 ``BAND_MIN_WIDTH_PX`` 와 같다.
 * 이 아래로 내려가면 밴드로 나눠도 글자를 못 읽으므로, 줄이는 대신 원본을 보낸다.
 */
export const TALL_MIN_WIDTH = 640;

/**
 * 캔버스로 다시 그릴 수 있는 넓이 상한.
 *
 * iOS Safari 는 16,777,216px 를 넘는 캔버스에 그리면 **예외 없이 빈 그림**을 내놓는다.
 * 세로로 긴 캡쳐는 이 상한을 쉽게 넘으므로(900×39418 = 3,548만), 넘을 것 같으면
 * 다시 그리지 않고 원본을 그대로 보낸다 — 빈 그림을 보내는 것보다 무거운 원본이 낫다.
 */
export const MAX_CANVAS_PIXELS = 16_000_000;

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
 * 한 장을 어떻게 줄일지에 대한 판정. 캔버스 없이 **크기만으로** 정해진다.
 *
 * 순수 함수로 떼어 둔 이유는 이 판정이 사고가 났던 자리이기 때문이다 — 캔버스가 필요한
 * 코드 안에 묻어 두면 jsdom 에서 못 재고, 못 재는 규칙은 조용히 다시 틀어진다.
 */
export type ResizePlan = {
  /** 세로로 긴 캡쳐인가. 상한을 고르는 쪽(``finalizeReferenceDataUri``)이 읽는다. */
  tall: boolean;
  /** 다시 그리지 않고 원본을 그대로 보낼 것인가. */
  passThrough: boolean;
  /** 보낼 그림의 크기. ``passThrough`` 면 원본 크기 그대로다. */
  width: number;
  height: number;
};

/**
 * 보낼 크기를 정한다.
 *
 * - **세로로 긴 캡쳐**(세로 ≥ 가로 × {@link TALL_TRIGGER_RATIO}): 폭만 기준으로 줄인다.
 *   폭이 이미 {@link TALL_MAX_WIDTH} 안이면 손대지 않는다 — 다시 그릴 이유가 없고,
 *   캔버스 넓이 상한도 안 건드린다. 줄여야 하는데 캔버스 넓이 상한을 넘거나 폭이
 *   {@link TALL_MIN_WIDTH} 아래로 떨어지면 **줄이기를 포기하고 원본을 보낸다**(서버가
 *   밴드로 나누며 자기 예산에 맞춘다).
 * - 그 밖의 그림: 예전처럼 긴 변 {@link REFERENCE_MAX_EDGE}.
 */
export function planReferenceResize(width: number, height: number): ResizePlan {
  const w = Math.max(0, Math.floor(Number(width) || 0));
  const h = Math.max(0, Math.floor(Number(height) || 0));
  if (!w || !h) return { tall: false, passThrough: true, width: w, height: h };

  const tall = h >= w * TALL_TRIGGER_RATIO;
  if (!tall) {
    const scale = Math.min(1, REFERENCE_MAX_EDGE / Math.max(w, h));
    if (scale >= 1) return { tall, passThrough: true, width: w, height: h };
    return {
      tall,
      passThrough: false,
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
    };
  }

  let scale = Math.min(1, TALL_MAX_WIDTH / w);
  if (w * h * scale * scale > MAX_CANVAS_PIXELS) {
    scale = Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / (w * h)));
  }
  if (scale >= 1 || w * scale < TALL_MIN_WIDTH) {
    // 줄일 것이 없거나, 줄이면 읽을 수 없어진다. 둘 다 원본이 답이다.
    return { tall, passThrough: true, width: w, height: h };
  }
  return {
    tall,
    passThrough: false,
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * 줄이기 결과. ``width``/``height`` 는 **보낼 그림의 크기**다 — 판독 값이 그 크기로
 * 정해지므로(비전 입력은 타일 수로 청구된다) 원본이 아니라 줄인 뒤 크기여야 한다.
 * 디코드가 안 되면 0 이고, 그때는 부르는 쪽이 "모른다"로 다뤄야 한다.
 *
 * ``tall`` 은 세로로 긴 캡쳐라 **원본 폭을 지키고 보낸다**는 표시다. 그 그림은 서버가
 * 밴드로 나누므로 한 장짜리 바이트 상한을 그대로 걸면 안 된다.
 */
export type ShrunkReference = {
  uri: string;
  width: number;
  height: number;
  tall: boolean;
};

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
  if (!ctx) return { uri: original, width: 0, height: 0, tall: false };

  try {
    const img = await loadImage(original);
    const plan = planReferenceResize(img.naturalWidth, img.naturalHeight);
    if (!plan.width || !plan.height) {
      return { uri: original, width: 0, height: 0, tall: false };
    }
    if (plan.passThrough) {
      // 줄일 것이 없어도 크기는 안다 — 여기서 0 을 내면 안 줄인 그림만 값이 비싸진다.
      return {
        uri: original,
        width: plan.width,
        height: plan.height,
        tall: plan.tall,
      };
    }

    canvas.width = plan.width;
    canvas.height = plan.height;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      uri: canvas.toDataURL("image/jpeg", QUALITY),
      width: canvas.width,
      height: canvas.height,
      tall: plan.tall,
    };
  } catch {
    return { uri: original, width: 0, height: 0, tall: false };
  }
}
