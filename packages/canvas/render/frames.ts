/**
 * 페이지를 **프레임**으로 묶는 규칙.
 *
 * 프레임은 문서의 새 층이 아니라 **페이지에 붙는 꼬리표**다. 한 문서에 후보 여러 벌을
 * 담아 나란히 놓으려고 들어왔는데(캐러셀 후보 · 상세페이지 시안), 진짜 층을 하나 만들면
 * 페이지 단위로 도는 것 전부 — 복제 · 삭제 · 순서 · 썸네일 · 내보내기 · 저장 · 되돌리기 —
 * 를 다시 짜야 한다. 꼬리표면 그 전부가 그대로 산다.
 *
 * **꼬리표가 없는 문서는 프레임 하나짜리다.** 지금까지 만들어진 문서 전부가 그 자리에
 * 있고, 이 규칙이 그것들의 그림을 한 픽셀도 안 바꾼다.
 *
 * 같은 꼬리표가 떨어져 있어도 한 열로 모은다 — 프레임은 «구간»이 아니라 «묶음»이다.
 * 열의 순서는 그 꼬리표가 처음 나온 자리를 따른다.
 */

/** 꼬리표가 사는 자리. 페이지의 `custom` 안이다. */
export const FRAME_KEY = "frame";

type FramedPage = { custom?: unknown };

/** 이 페이지가 속한 프레임. 꼬리표가 없으면 빈 문자열 — 그것도 하나의 프레임이다. */
export function frameOf(page: FramedPage): string {
  const custom = page.custom;
  if (!custom || typeof custom !== "object") return "";
  const value = (custom as Record<string, unknown>)[FRAME_KEY];
  return typeof value === "string" ? value : "";
}

/** 프레임별 묶음. 열 하나가 곧 한 벌이다. */
export function groupFrames<T extends FramedPage>(
  pages: readonly T[],
): Array<{ key: string; pages: T[] }> {
  const byKey = new Map<string, T[]>();
  for (const page of pages) {
    const key = frameOf(page);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(page);
    else byKey.set(key, [page]);
  }
  return [...byKey].map(([key, group]) => ({ key, pages: group }));
}
