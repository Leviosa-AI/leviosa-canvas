/**
 * 플랫폼 용량 상한에 파일을 맞추는 사다리.
 *
 * 폭은 플랫폼 규격에 맞춰 두고, 그래도 파일이 상한을 넘으면 우리가 다시 굽는다 —
 * 사용자에게 "너무 큽니다"만 돌려주면 그 다음 할 일이 없기 때문이다. 손실 형식
 * (JPG)은 화질부터 내리고, 그래도 안 되면 크기를 줄인다. 화질 손잡이가 없는 형식
 * (GIF·서버 WebP·MP4)은 크기만 줄인다.
 *
 * PNG 는 셋째 길이다. 기본은 PNG 다 — 글자 가장자리가 깨끗하다. 그런데 사진이 든
 * 상세페이지의 PNG 는 같은 폭의 JPG 보다 몇 배 크고, 크기를 줄이는 것 말고는 손잡이가
 * 없다. 그래서 PNG 가 넘으면 크기를 건드리기 전에 **JPG 로 바꿔** 화질 사다리를 탄다.
 * 폭을 가장 오래 지키는 순서다.
 *
 * 순수 함수라 인코더 없이 순서를 검증할 수 있다. DOM 을 만지는 쪽은 호출자다.
 */

export type FitStep = {
  /** 목표 폭 대비 배율. 1 이면 규격 폭 그대로. */
  scale: number;
  /** 손실 형식의 화질(0~1). 무손실 단계에서는 항상 1. */
  quality: number;
  /** 이 단계가 손실 형식(JPG)으로 굽는가. PNG 사다리의 첫 칸만 거짓이다. */
  lossy: boolean;
};

/** 화질 사다리. 첫 값이 상한이 없을 때의 기본 화질이기도 하다. */
export const LOSSY_QUALITIES = [0.95, 0.88, 0.8, 0.72] as const;
/** 크기 사다리. 절반 아래로는 안 내려간다 — 그 아래는 글자가 뭉개져 올릴 수 없다. */
export const SCALE_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5] as const;

/** 시도할 단계를 순서대로. 첫 단계가 "그대로"다. */
export function fitSteps(lossy: boolean): FitStep[] {
  if (!lossy) return SCALE_STEPS.map((scale) => ({ scale, quality: 1, lossy: false }));
  const floor = LOSSY_QUALITIES[LOSSY_QUALITIES.length - 1];
  return [
    ...LOSSY_QUALITIES.map((quality) => ({ scale: 1, quality, lossy: true })),
    ...SCALE_STEPS.slice(1).map((scale) => ({ scale, quality: floor, lossy: true })),
  ];
}

/**
 * PNG 사다리: 원본 PNG 한 칸, 그 다음은 JPG 사다리 전부.
 *
 * 상한이 없으면 첫 칸에서 끝나므로 PNG 그대로 나간다. 상한이 있고 PNG 가 넘으면
 * 폭은 그대로 둔 채 JPG 화질부터 내려간다.
 */
export function pngFallbackSteps(): FitStep[] {
  return [{ scale: 1, quality: 1, lossy: false }, ...fitSteps(true)];
}

export type FitResult<T> = {
  value: T;
  bytes: number;
  step: FitStep;
  /** 상한 안에 들어왔는가. 거짓이면 사다리 끝까지 내려도 넘은 것이다. */
  fitted: boolean;
};

/**
 * 상한 안에 드는 첫 결과를 돌려준다.
 *
 * 상한이 없으면 첫 단계만 굽고 끝낸다. 끝까지 넘으면 마지막(가장 작은) 결과를
 * `fitted: false` 로 돌려준다 — 그래도 내려받게 두고, 창이 넘었다고 알린다.
 */
export async function fitToBudget<T>(
  maxBytes: number | null | undefined,
  steps: FitStep[],
  encode: (step: FitStep) => Promise<{ value: T; bytes: number }>,
  opts: {
    /**
     * 굽다가 던진 오류를 "너무 크다"로 볼지. 참을 돌려주면 다음 칸으로 내려간다.
     * 서버가 요청 자체를 거절하는 경우(413)를 위한 것이다 — 그때는 결과 크기를 잴
     * 기회조차 없어서, 상한이 없어도 한 칸 줄여 다시 보내는 것 말고 길이 없다.
     * 마지막 칸에서 던지면 그대로 던진다.
     */
    retryOnError?: (error: unknown) => boolean;
  } = {},
): Promise<FitResult<T>> {
  let last: FitResult<T> | null = null;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let encoded: { value: T; bytes: number };
    try {
      encoded = await encode(step);
    } catch (error) {
      if (i < steps.length - 1 && opts.retryOnError?.(error)) continue;
      throw error;
    }
    const { value, bytes } = encoded;
    last = { value, bytes, step, fitted: maxBytes == null || bytes <= maxBytes };
    if (last.fitted) return last;
  }
  return last as FitResult<T>;
}

/** data URL 이 파일로 떨어질 때의 바이트 수(base64 길이에서 역산). */
export function dataUrlBytes(url: string): number {
  const comma = url.indexOf(",");
  if (comma < 0) return url.length;
  const payload = url.length - comma - 1;
  const padding = url.endsWith("==") ? 2 : url.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload * 3) / 4) - padding);
}
