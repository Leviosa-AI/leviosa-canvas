/**
 * 플랫폼 용량 상한에 파일을 맞추는 사다리.
 *
 * 폭은 플랫폼 규격에 맞춰 두고, 그래도 파일이 상한을 넘으면 우리가 다시 굽는다 —
 * 사용자에게 "너무 큽니다"만 돌려주면 그 다음 할 일이 없기 때문이다. 손실 형식
 * (JPG)은 화질부터 내리고, 그래도 안 되면 크기를 줄인다. 무손실이거나 화질 손잡이가
 * 없는 형식(PNG·GIF·서버 WebP·MP4)은 크기만 줄인다.
 *
 * 순수 함수라 인코더 없이 순서를 검증할 수 있다. DOM 을 만지는 쪽은 호출자다.
 */

export type FitStep = {
  /** 목표 폭 대비 배율. 1 이면 규격 폭 그대로. */
  scale: number;
  /** 손실 형식의 화질(0~1). 무손실 사다리에서는 항상 1. */
  quality: number;
};

/** 화질 사다리. 첫 값이 상한이 없을 때의 기본 화질이기도 하다. */
export const LOSSY_QUALITIES = [0.95, 0.88, 0.8, 0.72] as const;
/** 크기 사다리. 절반 아래로는 안 내려간다 — 그 아래는 글자가 뭉개져 올릴 수 없다. */
export const SCALE_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5] as const;

/** 시도할 단계를 순서대로. 첫 단계가 "그대로"다. */
export function fitSteps(lossy: boolean): FitStep[] {
  if (!lossy) return SCALE_STEPS.map((scale) => ({ scale, quality: 1 }));
  const floor = LOSSY_QUALITIES[LOSSY_QUALITIES.length - 1];
  return [
    ...LOSSY_QUALITIES.map((quality) => ({ scale: 1, quality })),
    ...SCALE_STEPS.slice(1).map((scale) => ({ scale, quality: floor })),
  ];
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
  lossy: boolean,
  encode: (step: FitStep) => Promise<{ value: T; bytes: number }>,
): Promise<FitResult<T>> {
  const steps = fitSteps(lossy);
  let last: FitResult<T> | null = null;
  for (const step of steps) {
    const { value, bytes } = await encode(step);
    last = {
      value,
      bytes,
      step,
      fitted: maxBytes == null || bytes <= maxBytes,
    };
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
