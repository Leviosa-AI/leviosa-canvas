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
  /** 생성 인스턴스가 있는가. 없으면 프롬프트 편집을 서버가 못 받는다(픽스처). */
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

  if (hasGeneration) {
    const editable =
      el.type === "text" ||
      el.type === "svg" ||
      el.type === "image" ||
      (el.type === "group" && hasEditableDescendant(el));
    if (editable) actions.push("promptEdit");
  }

  actions.push("more");
  return actions;
}
