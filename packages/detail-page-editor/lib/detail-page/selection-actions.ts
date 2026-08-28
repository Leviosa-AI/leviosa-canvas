/**
 * 고른 것 위 띠에 무엇을 띄울까.
 *
 * 규칙만 여기 적는다 — 그려야 알 수 있는 것이 하나도 없어서 그대로 잴 수 있고, "왜 이
 * 버튼이 안 뜨지"를 캔버스를 띄우지 않고 답할 수 있다.
 *
 * 원칙은 하나다. **그 요소에만 해당하고, 지금 실제로 할 수 있는 것만** 띄운다. 회색으로
 * 떠 있는 버튼은 자리만 차지하고 매번 눌러 보게 만든다.
 */

import { isGifSrc } from "../detail-page-canvas/export/gif-plan";

export type QuickActionId = "crop" | "bgRemove" | "promptEdit" | "more";

export type ActionElement = {
  id: string;
  type?: string;
  src?: unknown;
  locked?: unknown;
  custom?: unknown;
  children?: ActionElement[];
};

export type ActionContext = {
  /**
   * 서버가 아는 문서가 있는가.
   *
   * 글·도형·그룹을 프롬프트로 고치는 일은 서버가 문서를 읽고 고쳐서 돌려주므로 이것이
   * 필요하다. **그림 편집은 아니다** — 그림과 지시가 요청에 다 실려 가고 결과는 브랜드
   * 자산으로 돌아온다. 그래서 문서가 없는 편집기(캐러셀)에서도 그림만은 고칠 수 있다.
   */
  hasGeneration?: boolean;
  /** 배경 지우기가 배선돼 있는가. */
  canRemoveBackground?: boolean;
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** GIF로 들어온 요소인가. 프레임 그림이라 자르기·배경 지우기의 대상이 아니다. */
export function isAnimated(el: ActionElement): boolean {
  const custom = el.custom as { detailPageGif?: unknown } | undefined;
  if (custom?.detailPageGif) return true;
  return (el.type === "image" || el.type === "svg") && isGifSrc(str(el.src));
}

/** 그룹 안에 프롬프트로 고칠 수 있는 것(글·도형)이 있는가. 이미지는 대상이 아니다. */
export function hasEditableDescendant(el: ActionElement): boolean {
  for (const child of el.children ?? []) {
    if (child.type === "text" || child.type === "svg") return true;
    if (hasEditableDescendant(child)) return true;
  }
  return false;
}

export function quickActions(
  els: ReadonlyArray<ActionElement>,
  { hasGeneration = false, canRemoveBackground = false }: ActionContext = {},
): QuickActionId[] {
  // 여럿을 골랐으면 공통 동작(순서·그룹·삭제)만 남는다 — 그건 전부 "더보기"에 있다.
  if (els.length !== 1) return els.length ? ["more"] : [];

  const el = els[0];
  const actions: QuickActionId[] = [];
  const animated = isAnimated(el);

  if (el.type === "image" && !animated && str(el.src)) {
    actions.push("crop");
    if (canRemoveBackground) actions.push("bgRemove");
  }

  // 그림은 그 자체가 요청에 실려 가므로 문서가 필요 없다. 대신 실을 그림이 있어야 한다.
  const editableImage = el.type === "image" && Boolean(str(el.src));
  const needsDocument =
    el.type === "text" ||
    el.type === "svg" ||
    (el.type === "group" && hasEditableDescendant(el));
  if (editableImage || (needsDocument && hasGeneration)) {
    actions.push("promptEdit");
  }

  actions.push("more");
  return actions;
}
