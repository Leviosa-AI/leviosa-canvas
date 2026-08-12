/**
 * 디자인 레퍼런스 — "이런 식으로"를 그림으로 가리키는 입력의 **브라우저 쪽 계약**.
 *
 * 서버(``app/services/detail_page/design_reference.py``)와 같은 어휘·같은 상한을 쓴다.
 * 한쪽만 고치면 화면에서는 붙었는데 요청이 422 로 돌아오거나, 반대로 화면이 미리 막아
 * 서버가 허용하는 것을 못 넣게 된다.
 *
 * ## 왜 축을 고르게 하는가
 *
 * 레퍼런스를 통째로 따라가면 남의 상세페이지가 된다. 실제로 원하는 것은 축 하나씩이다 —
 * 이 장에서는 색감만, 저 장에서는 배치만. 축을 안 고르면 예전처럼 배치와 구성만
 * 참고한다(기존 동작이 기본값이다).
 *
 * ## 왜 붙이는 자리에서 막는가
 *
 * 크기·형식 검사는 서버에도 있다. 그런데 서버에서만 막으면 유저는 **제출을 누른 다음에야**
 * 알게 된다 — 그림을 고르고, 축을 고르고, 지시를 다 적은 뒤다. 같은 규칙을 붙이는
 * 자리에도 두어 그 자리에서 말해 준다.
 */

import { shrinkReferenceDataUri } from "./reference-image";

/**
 * 참고할 축. 서버의 ``ASPECT_LABELS`` 와 **키가 같아야 한다**.
 *
 * ``content`` 는 **문구가 아니라 정보 구성**이다 — 어떤 항목을 어떤 순서로 다루는지
 * (성분표 · 사용법 · 비교표 · 후기). 남의 문장을 옮겨 오는 축이 아니라서 설명도 그렇게
 * 적는다. 셀러가 "내용을 참고"를 "문구를 베낀다"로 읽으면 안 된다.
 */
export const DESIGN_REFERENCE_ASPECTS = [
  { key: "palette", label: "색감", hint: "바탕·글자·강조의 색 관계" },
  { key: "typography", label: "서체", hint: "굵기 대비와 글자 크기 리듬" },
  { key: "layout", label: "레이아웃", hint: "단 수, 정렬, 여백 리듬" },
  { key: "content", label: "내용 구성", hint: "다루는 정보 항목과 순서" },
  { key: "mood", label: "분위기", hint: "여백의 양과 요소 밀도" },
  { key: "decoration", label: "장식", hint: "구분선·도형의 성격" },
] as const;

export type DesignReferenceAspect = (typeof DESIGN_REFERENCE_ASPECTS)[number]["key"];

/** 레퍼런스 한 장. 서버 요청 본문과 같은 모양이다. */
export type DesignReference = {
  url: string;
  aspects: DesignReferenceAspect[];
};

/**
 * 장수 상한. 서버와 **같은 수**여야 한다 — 프론트가 더 보내면 서버가 거절하고,
 * 서버보다 적게 막으면 유저가 넣을 수 있는 것을 못 넣는다.
 */
export const MAX_DESIGN_REFERENCES = 6;

/**
 * 고를 수 있는 파일 형식. 비전 모델이 읽는 것은 정지 이미지뿐이라 PDF·HEIC 는 못 쓴다.
 *
 * GIF 는 받는다. 움짤이어도 줄이기가 첫 프레임을 굳히고(캔버스는 한 프레임만 그린다),
 * 줄이기를 건너뛴 작은 GIF 는 서버가 평탄화한다. 막는 것보다 첫 프레임으로 읽히는 편이
 * 낫다 — "이 움짤 느낌으로"는 멀쩡한 요청이다.
 */
export const ACCEPTED_REFERENCE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** ``<input accept>`` 에 넣을 값. */
export const REFERENCE_ACCEPT_ATTR = ACCEPTED_REFERENCE_TYPES.join(",");

/** 고를 수 있는 원본 파일 크기. 이보다 크면 줄이기 전에 브라우저 메모리가 먼저 눕는다. */
export const MAX_REFERENCE_FILE_BYTES = 12 * 1024 * 1024;

/** 줄인 **뒤** 서버가 받아 주는 한 장의 크기. 서버의 ``MAX_REFERENCE_BYTES`` 와 같다. */
export const MAX_REFERENCE_UPLOAD_BYTES = 4 * 1024 * 1024;

/** 붙일 수 없는 파일이면 이유를, 괜찮으면 null. */
export function referenceFileRejection(file: File): string | null {
  const type = String(file.type || "").toLowerCase();
  if (!ACCEPTED_REFERENCE_TYPES.includes(type as (typeof ACCEPTED_REFERENCE_TYPES)[number])) {
    return "PNG · JPG · WEBP · GIF 만 참고 사진으로 쓸 수 있어요.";
  }
  if (file.size > MAX_REFERENCE_FILE_BYTES) {
    const limit = Math.round(MAX_REFERENCE_FILE_BYTES / (1024 * 1024));
    return `참고 사진은 한 장에 ${limit}MB 까지예요.`;
  }
  return null;
}

/** base64 data URI 가 실제로 몇 바이트인지. 요청 본문 크기를 재는 데 쓴다. */
export function dataUriByteLength(uri: string): number {
  const comma = uri.indexOf(",");
  if (comma < 0) return 0;
  const payload = uri.slice(comma + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

/**
 * 고른 파일을 **바로 걸 수 있는** data URI 로 읽는다. 줄이기는 여기서 하지 않는다.
 *
 * 썸네일을 줄이기까지 기다렸다가 띄우면 안 된다 — 줄이기는 디코드를 기다리는 일이고,
 * 디코더가 못 읽는 파일에서는 몇 초 뒤에야 포기한다. 그 사이 화면에 아무것도 안 뜨면
 * 유저는 첨부가 먹히지 않은 줄 안다. 형식·원본 크기는 **읽기 전에** 이미 걸렀다.
 *
 * @throws Error 붙일 수 없는 파일. message 를 그대로 보여 주면 된다.
 */
export async function readReferenceFile(file: File): Promise<string> {
  const rejection = referenceFileRejection(file);
  if (rejection) throw new Error(rejection);
  return readFileAsDataUri(file);
}

/**
 * 붙여 둔 레퍼런스를 보낼 크기로 줄인다.
 *
 * 줄이기는 **실패해도 원본을 돌려준다**(``shrinkReferenceDataUri``). 그래서 줄인 뒤에 한
 * 번 더 잰다 — 줄이기가 못 돈 큰 그림이 그대로 서버까지 가서 422 로 돌아오면, 유저는
 * 붙이는 자리가 아니라 제출 자리에서 실패를 본다.
 *
 * 크기(``inputTokens``)도 여기서 함께 잰다. 판독 값이 그 크기로 정해지는데, 재는 자리를
 * 따로 두면 그림을 한 번 더 디코딩하게 된다. 못 쟀으면 0 이고, 값은 비싼 쪽으로 잡힌다.
 *
 * @returns 줄인 data URI, 또는 그래도 상한을 넘겼으면 이유.
 */
export async function finalizeReferenceDataUri(
  original: string,
): Promise<{ uri: string; inputTokens: number } | { error: string }> {
  const shrunk = await shrinkReferenceDataUri(original);
  if (dataUriByteLength(shrunk.uri) > MAX_REFERENCE_UPLOAD_BYTES) {
    const limit = Math.round(MAX_REFERENCE_UPLOAD_BYTES / (1024 * 1024));
    return {
      error: `참고 사진을 ${limit}MB 아래로 줄이지 못했어요. 더 작은 그림을 써 주세요.`,
    };
  }
  return {
    uri: shrunk.uri,
    inputTokens: estimateImageInputTokens(shrunk.width, shrunk.height),
  };
}

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("참고 사진을 읽지 못했어요."));
    reader.onerror = () => reject(new Error("참고 사진을 읽지 못했어요."));
    reader.readAsDataURL(file);
  });
}

/** 셀러가 "1번 이미지"라고 쓰므로 화면도 1부터 센다. */
export function referenceOrdinal(index: number): string {
  return `${index + 1}번`;
}

/* ---- 판독 크레딧 ------------------------------------------------------------ *
 *
 * 판독은 **선차감**이다. 그래서 값은 누르기 전에 화면에 떠 있어야 하고, 그러려면 화면이
 * 서버와 **같은 공식**을 갖고 있어야 한다. 서버가 실제 usage 가 아니라 추정으로 청구하는
 * 이유도 이것이다(``app/services/detail_page/design_brief.py``) — 미리 말해 준 값과 실제
 * 청구가 다르면 그건 안내가 아니다.
 *
 * 값을 정하는 것은 장수가 아니라 **그림의 크기**다. 비전 입력은 픽셀이 아니라 512px 타일
 * 수로 청구되므로, 정사각 썸네일과 세로로 긴 상세페이지 캡쳐는 같은 한 장이어도 값이
 * 두 배 가까이 벌어진다.
 */

const IMAGE_TOKENS_BASE = 85;
const IMAGE_TOKENS_PER_TILE = 170;
const IMAGE_TILE_PX = 512;
const IMAGE_SHORT_SIDE_PX = 768;
const IMAGE_LONG_SIDE_PX = 2048;

/**
 * 크기를 못 잰 그림 한 장으로 잡는 토큰. 서버의 ``UNKNOWN_IMAGE_TOKENS`` 와 같다.
 *
 * 디코더가 못 읽는 파일이면 크기를 모르는 채로 값을 말해야 한다. 그때 싸게 잡으면
 * 화면이 말한 값보다 실제 청구가 커진다 — 모르는 쪽은 **비싸게** 잡아야 안전하다.
 */
export const UNKNOWN_IMAGE_TOKENS = 1445;

/** 그림을 뺀 나머지 입력(시스템 프롬프트 + 딱지 + 지시)의 대략치. 서버와 같은 값. */
const BRIEF_PROMPT_OVERHEAD_TOKENS = 1100;

/** 판독 출력의 대략치. 몇 장을 붙이든 돌려주는 것은 같은 크기의 JSON 한 덩이다. */
const BRIEF_OUTPUT_ALLOWANCE_TOKENS = 500;

/** 판독 모델(gpt-5.6-luna) USD per 1M = [입력, 출력]. 서버 단가표와 같아야 한다. */
const BRIEF_MODEL_PRICE_USD_PER_MILLION = [0.2, 1.2] as const;

/** 원가 → 크레딧 환산. 카피·재저작과 **같은 환율**이다(원가 1.5원 = 1크레딧). */
const USD_TO_KRW_RATE = 1500;
const KRW_PER_CREDIT = 1.5;

/**
 * 그림 한 장이 비전 입력에서 차지하는 토큰. 서버의 ``estimate_image_input_tokens``.
 *
 * 긴 변을 2048 안에, 그다음 짧은 변을 768 로 **줄이기만** 한다(작은 그림을 키우면 없는
 * 비용이 생긴다). 크기를 모르면 {@link UNKNOWN_IMAGE_TOKENS}.
 */
export function estimateImageInputTokens(width: number, height: number): number {
  let w = Math.floor(Number(width) || 0);
  let h = Math.floor(Number(height) || 0);
  if (w <= 0 || h <= 0) return UNKNOWN_IMAGE_TOKENS;

  const longest = Math.max(w, h);
  if (longest > IMAGE_LONG_SIDE_PX) {
    const scale = IMAGE_LONG_SIDE_PX / longest;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  const shortest = Math.min(w, h);
  if (shortest > IMAGE_SHORT_SIDE_PX) {
    const scale = IMAGE_SHORT_SIDE_PX / shortest;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  const tiles = Math.ceil(w / IMAGE_TILE_PX) * Math.ceil(h / IMAGE_TILE_PX);
  return IMAGE_TOKENS_BASE + IMAGE_TOKENS_PER_TILE * tiles;
}

/**
 * 붙여 둔 레퍼런스를 읽는 데 드는 크레딧. 서버의 ``estimate_brief_credits`` 와 같은 값을
 * 낸다 — 다르면 화면이 말한 값과 청구가 어긋난다.
 *
 * @param imageTokens 장별 입력 토큰. 못 잰 장은 0 으로 넣으면 비싼 쪽으로 잡는다.
 */
export function estimateBriefCredits(imageTokens: number[]): number {
  if (!imageTokens.length) return 0;
  const [inputPrice, outputPrice] = BRIEF_MODEL_PRICE_USD_PER_MILLION;
  const inputTokens =
    BRIEF_PROMPT_OVERHEAD_TOKENS +
    imageTokens.reduce(
      (sum, tokens) => sum + (tokens > 0 ? tokens : UNKNOWN_IMAGE_TOKENS),
      0,
    );
  const costUsd =
    (inputTokens / 1_000_000) * inputPrice +
    (BRIEF_OUTPUT_ALLOWANCE_TOKENS / 1_000_000) * outputPrice;
  if (costUsd <= 0) return 0;
  return Math.max(1, Math.ceil((costUsd * USD_TO_KRW_RATE) / KRW_PER_CREDIT));
}
