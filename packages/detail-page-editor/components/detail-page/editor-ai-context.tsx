"use client";

/**
 * AI 편집이 필요로 하는 것들을 캔버스 위 층에 전한다.
 *
 * "프롬프트로 편집"·"배경 지우기"는 고른 요소 바로 위 띠에서 열리는데, 그 띠는 작업
 * 영역 안(`leviosa-canvas-workspace`)에 산다. 편집기가 그 층까지 props로 내리면
 * **캔버스 나무를 통째로 다시 만들게 된다** — 작업 영역은 무거워서 크레딧 잔액 하나가
 * 바뀔 때마다 다시 만들면 안 되는 자리다(그래서 `useMemo`로 묶여 있다).
 *
 * 그래서 값은 컨텍스트로 흘린다. 값이 바뀌면 **읽는 쪽만** 다시 그린다.
 */

import { createContext, useContext, type ReactNode } from "react";

import type { EditUsageState } from "./edit-quota-ui";
import type { ImageTier } from "../../lib/detail-page/image-credit";
import type {
  GenerateGifFn,
  RemoveBackgroundFn,
} from "./ai-generate-panel";

export type EditorAiValue = {
  /** 생성 인스턴스 ID. 없으면(픽스처) 프롬프트 편집을 아예 안 띄운다. */
  generatedId?: string;
  usage?: EditUsageState;
  applyUsage?: (kind: "svg" | "text", used: number, limit: number) => void;
  onBuyCredits?: () => void;
  imageCreditCost?: number;
  imageCreditBalance?: number;
  imageCostByTier?: Partial<Record<ImageTier, number>>;
  imageTiers?: readonly ImageTier[];
  onGenerateGif?: GenerateGifFn;
  gifCreditCost?: number;
  onRemoveBackground?: RemoveBackgroundFn;
  bgRemoveCreditCost?: number;
};

const EditorAiContext = createContext<EditorAiValue>({});

export function EditorAiProvider({
  value,
  children,
}: {
  value: EditorAiValue;
  children: ReactNode;
}) {
  return (
    <EditorAiContext.Provider value={value}>{children}</EditorAiContext.Provider>
  );
}

/** 꽂혀 있지 않으면 빈 값 — 띠는 아무 AI 항목도 안 띄운다(하니스·테스트가 그렇다). */
export function useEditorAi(): EditorAiValue {
  return useContext(EditorAiContext);
}
