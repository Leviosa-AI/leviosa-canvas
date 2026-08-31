"use client";

// "프롬프트로 편집" — 선택한 차트·표를 자연어 요청으로 고친다("행 하나 더 넣고 단위를
// %로"). 소싱 서버의 그룹 편집 엔드포인트(/{generatedId}/group/prompt-edit)에
// ``kind: "data"`` 항목 하나로 보내고, 돌아온 **스펙**을 그대로 적용한다.
//
// ⚠️ 자식 글자를 고쳐 받지 않는다. 차트·표의 자식(막대·칸 글자)은 스펙에서 매번 다시
// 그려지므로, 글자만 고쳐 두면 사용자가 다음에 행 하나 늘리는 순간 조용히 덮인다.
// 그래서 서버도 프론트도 스펙만 주고받고, 적용은 sync 경로(그리는 곳 하나)를 탄다.

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

interface SpecPromptEditPanelProps {
  /** 생성 인스턴스 ID. 없으면(픽스처 모드) 이 패널은 렌더되지 않는다. */
  generatedId: string;
  /** 차트인지 표인지. 서버가 검증 규칙을 이걸로 가른다. */
  specKind: "chart" | "table";
  /** 편집기 요소 id(응답 매핑용). */
  elementId: string;
  /** 지금 요소에 얹혀 있는 스펙. */
  currentSpec: unknown;
  /** 수정된 스펙을 적용하는 콜백(sync 경로를 태운다). */
  onApplied: (spec: unknown) => void;
  /** 이 인스턴스의 텍스트 편집 사용 횟수/한도(부모가 관리). */
  editsUsed?: number;
  editLimit?: number;
  /** scratch 등 한도 면제면 카운터/차단을 숨긴다. */
  unlimited?: boolean;
  /** 편집 성공/차단 후 사용량 갱신을 부모에 알린다. */
  onUsage?: (used: number, limit: number) => void;
  /** 한도 소진 시 "편집 크레딧 추가하기" 목적지. */
  onBuyMore?: () => void;
}

export function SpecPromptEditPanel({
  generatedId,
  specKind,
  elementId,
  currentSpec,
  onApplied,
  editsUsed = 0,
  editLimit = 0,
  unlimited = false,
  onUsage,
  onBuyMore,
}: SpecPromptEditPanelProps) {
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
      const result = await api.groupPromptEditDetailPage(generatedId, {
        instruction,
        items: [
          {
            id: elementId,
            kind: "data",
            spec_kind: specKind,
            current_spec: currentSpec,
          },
        ],
      });
      if (
        typeof result.text_used === "number" &&
        typeof result.text_limit === "number"
      ) {
        onUsage?.(result.text_used, result.text_limit);
      }
      // 서버는 변경이 없으면 spec을 아예 안 싣는다(원본 유지 = 무과금).
      const spec = result.results?.find((item) => item.id === elementId)?.spec;
      if (!spec) {
        toast.info(t("detailPage.promptEdit.noChange"));
      } else {
        onApplied(spec);
        toast.success(t("detailPage.specPromptEdit.success"));
        setInput("");
      }
    } catch (err) {
      const quota = api.asEditQuotaError(err);
      if (quota) {
        onUsage?.(quota.limit, quota.limit);
        toast.error(t("detailPage.promptEdit.quotaExhausted"));
      } else {
        toast.error(
          err instanceof Error ? err.message : t("detailPage.promptEdit.requestFailed"),
        );
      }
    } finally {
      setBusy(false);
    }
  }, [
    api,
    toast,
    input,
    busy,
    blocked,
    generatedId,
    specKind,
    elementId,
    currentSpec,
    onApplied,
    onUsage,
    t,
  ]);

  return (
    <div className="relative flex flex-col overflow-hidden rounded-dpe-xl border border-dpe-ink-200 bg-dpe-surface">
      <div className="flex items-center gap-1.5 border-b border-dpe-ink-200 px-3 py-2">
        <Sparkles size={13} className="text-dpe-ai" />
        <span className="text-xs font-dpe-medium text-dpe-ink-900">
          {t("detailPage.promptEdit.header")}
        </span>
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
              busy
                ? t("detailPage.promptEdit.editing")
                : t(`detailPage.specPromptEdit.placeholder.${specKind}`)
            }
            disabled={busy}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-5 text-dpe-ink-900 outline-none placeholder:text-dpe-ink-400 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-dpe-lg bg-dpe-ink-900 text-dpe-on-accent disabled:opacity-40"
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
      <p className="px-3 pb-2 text-[11px] leading-relaxed text-dpe-ink-500">
        {t("detailPage.specPromptEdit.hint")}
      </p>
    </div>
  );
}
