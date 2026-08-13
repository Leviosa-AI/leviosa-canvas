"use client";

// "프롬프트로 편집" — 선택한 텍스트 슬롯의 카피를 자연어 요청으로 다시 쓴다. 소싱 서버의
// v2 카피 엔진(/{generatedId}/copy/prompt-edit)에 현재 문구 + 지시를 한 번 POST 하고,
// 돌아온 텍스트를 곧바로 해당 Canvas 요소에 적용한다(상품 문맥·존댓말·컴플라이언스 유지).

import { useCallback, useState } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDetailPageHost } from "./detail-page-host-context";
import { EditQuotaBlock, EditUsageBadge } from "./edit-quota-ui";
import { GenerationProgressLine } from "./generation-progress-fill";
import {
  useFakeProgress,
  GENERATION_ESTIMATE_MS,
} from "../../lib/detail-page/use-fake-progress";

interface PromptEditPanelProps {
  /** 생성 인스턴스 ID. 없으면(픽스처 모드) 이 패널은 렌더되지 않는다. */
  generatedId: string;
  /** 요소의 custom.leviosaSlot. */
  slotRole: string;
  /** 편집기에 지금 표시된 문구(로컬 편집 반영본). */
  currentText: string;
  /** custom.leviosaSlotKind (headline_highlight / line_split 등). */
  renderKind?: string;
  /** 슬롯 최대 글자 수(있으면 전달). */
  maxLength?: number;
  /** 수정된 텍스트를 요소에 반영하는 콜백 (el.set({ text })). */
  onApplied: (text: string) => void;
  /** 이 인스턴스의 텍스트 편집 사용 횟수/한도(부모가 관리). */
  editsUsed?: number;
  editLimit?: number;
  /** scratch 등 한도 면제면 카운터/차단을 숨긴다. */
  unlimited?: boolean;
  /** 편집 성공/차단 후 사용량 갱신을 부모에 알린다. */
  onUsage?: (used: number, limit: number) => void;
  /** 한도 소진 시 "편집 크레딧 추가하기" 목적지(레비오사 결제면). */
  onBuyMore?: () => void;
}

export function PromptEditPanel({
  generatedId,
  slotRole,
  currentText,
  renderKind,
  maxLength,
  onApplied,
  editsUsed = 0,
  editLimit = 0,
  unlimited = false,
  onUsage,
  onBuyMore,
}: PromptEditPanelProps) {
  const { t } = useTranslation("branding");
  const { api, toast } = useDetailPageHost();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const progress = useFakeProgress(busy, GENERATION_ESTIMATE_MS.text);

  const blocked = !unlimited && editLimit > 0 && editsUsed >= editLimit;

  const send = useCallback(async () => {
    const instruction = input.trim();
    if (!instruction || busy || blocked) return;
    setBusy(true);
    try {
      const result = await api.promptEditDetailPageCopy(generatedId, {
        slot_role: slotRole,
        current_text: currentText,
        instruction,
        max_length: maxLength,
        render_kind: renderKind,
      });
      if (typeof result.edits_used === "number" && typeof result.edit_limit === "number") {
        onUsage?.(result.edits_used, result.edit_limit);
      }
      const text = (result.text ?? "").trim();
      if (!text || text === currentText.trim()) {
        toast.info(t("detailPage.promptEdit.noChange"));
      } else {
        onApplied(text);
        toast.success(t("detailPage.promptEdit.textSuccess"));
        setInput("");
      }
    } catch (err) {
      const quota = api.asEditQuotaError(err);
      if (quota) {
        onUsage?.(quota.limit, quota.limit);
        toast.error(t("detailPage.promptEdit.quotaExhausted"));
      } else {
        toast.error(err instanceof Error ? err.message : t("detailPage.promptEdit.requestFailed"));
      }
    } finally {
      setBusy(false);
    }
  }, [api, toast, input, busy, blocked, generatedId, slotRole, currentText, maxLength, renderKind, onApplied, onUsage, t]);

  return (
    <div className="relative flex flex-col overflow-hidden rounded-dpe-xl border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <Sparkles size={13} className="text-primary" />
        <span className="text-xs font-dpe-medium text-foreground">{t("detailPage.promptEdit.header")}</span>
        {unlimited || editLimit > 0 ? (
          <EditUsageBadge used={editsUsed} limit={editLimit} unlimited={unlimited} />
        ) : null}
      </div>
      {blocked ? (
        <EditQuotaBlock kind="text" onBuyMore={onBuyMore} />
      ) : (
        <div className="flex items-end gap-1.5 px-2 py-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={
              busy ? t("detailPage.promptEdit.editing") : t("detailPage.promptEdit.textPlaceholder")
            }
            disabled={busy}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-dpe-lg bg-primary text-primary-foreground disabled:opacity-40"
            aria-label={t("detailPage.promptEdit.send")}
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ArrowUp size={15} />
            )}
          </button>
        </div>
      )}
      {busy ? <GenerationProgressLine progress={progress} /> : null}
    </div>
  );
}
