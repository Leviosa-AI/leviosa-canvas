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

/**
 * 어떤 벌의 **몇 번째 자리**가 문서 전체에서 몇 번째인가.
 *
 * 페이지 배열은 벌과 무관하게 한 줄이다. «2안의 세 번째 앞에 끼워라»를 그 한 줄의
 * 자리로 옮겨 줘야 스토어가 알아듣는다.
 *
 * @param at 그 벌 안에서의 자리(0 이면 맨 앞, 길이와 같으면 맨 뒤).
 */
export function frameInsertIndex<T extends FramedPage>(
  pages: readonly T[],
  frameKey: string,
  at: number,
): number {
  const mine: number[] = [];
  pages.forEach((page, index) => {
    if (frameOf(page) === frameKey) mine.push(index);
  });
  // 아직 한 장도 없는 벌이면 맨 뒤에 새 열이 선다.
  if (!mine.length) return pages.length;
  if (at <= 0) return mine[0];
  if (at >= mine.length) return mine[mine.length - 1] + 1;
  return mine[at];
}

/**
 * 벌 하나가 **통째로 사라졌는가.**
 *
 * 벌은 판에 붙은 이름표라 마지막 판이 나가면 그 벌도 없어진다. 화면은 그 순간을 잡아
 * 되돌릴 길을 띄운다.
 *
 * 두 가지를 함께 봐야 한다. 문서를 통째로 갈아 끼울 때도 이름은 다 바뀌므로 «딱 하나가
 * 빠지고 새로 든 것은 없다»여야 하고, 원래 한 벌뿐이었다면 그건 사라진 것이 아니라 그냥
 * 빈 문서다.
 */
export function frameVanished(
  before: readonly string[],
  after: readonly string[],
): boolean {
  if (before.length < 2) return false;
  const gone = before.filter((key) => !after.includes(key));
  const added = after.filter((key) => !before.includes(key));
  return gone.length === 1 && added.length === 0;
}
