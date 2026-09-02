"use client";

// "그룹 편집" — 그룹으로 묶인 여러 요소(텍스트·SVG 도형)를 자연어 요청 한 번으로 함께
// 수정한다. 소싱 서버의 그룹 편집 엔드포인트(/{generatedId}/group/prompt-edit)에 그룹
// 안 모든 텍스트/도형 + 지시를 한 번 POST 하고, id로 돌아온 결과를 각 요소에 적용한다.
// 텍스트는 서로 어울리게 한 번에 다시 쓰이고, 도형은 같은 지시로 각자 다시 그려진다.
// 슬롯 단건용 PromptEditPanel / SvgPromptEditPanel의 그룹 통합판(프롬프트 박스 1개).

import { useCallback, useState } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useDetailPageHost } from "./detail-page-host-context";
import type {
  DetailPageGroupEditItem,
  DetailPageGroupEditResultItem,
} from "./detail-page-host-context";
import { EditQuotaBlock, EditUsageBadge } from "./edit-quota-ui";

interface GroupPromptEditPanelProps {
  /** 생성 인스턴스 ID. 없으면(픽스처 모드) 이 패널은 렌더되지 않는다. */
  generatedId: string;
  /** 편집할 그룹 내 요소들(텍스트·도형)의 현재 상태. */
  items: DetailPageGroupEditItem[];
  /** 요소별 결과를 각 Canvas 요소에 반영하는 콜백(id로 매핑). */
  onApplied: (results: DetailPageGroupEditResultItem[]) => void;
  /** 텍스트 편집 사용 횟수/한도(부모가 관리). */
  textUsed?: number;
  textLimit?: number;
  /** SVG 편집 사용 횟수/한도(부모가 관리). */
  svgUsed?: number;
  svgLimit?: number;
  /** scratch 등 한도 면제면 카운터/차단을 숨긴다. */
  unlimited?: boolean;
  /** 편집 성공/차단 후 종류별 사용량 갱신을 부모에 알린다. */
  onUsage?: (kind: "svg" | "text", used: number, limit: number) => void;
  /** 한도 소진 시 "편집 크레딧 추가하기" 목적지(레비오사 결제면). */
  onBuyMore?: () => void;
}

export function GroupPromptEditPanel({
  generatedId,
  items,
  onApplied,
  textUsed = 0,
  textLimit = 0,
  svgUsed = 0,
  svgLimit = 0,
  unlimited = false,
  onUsage,
  onBuyMore,
}: GroupPromptEditPanelProps) {
  const { api, toast } = useDetailPageHost();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const hasText = items.some((i) => i.kind === "text");
  const hasSvg = items.some((i) => i.kind === "svg");
  // 그룹에 포함된 종류 중 하나라도 한도를 소진하면 편집을 막는다(백엔드도 종류별로 막음).
  const textBlocked = hasText && !unlimited && textLimit > 0 && textUsed >= textLimit;
  const svgBlocked = hasSvg && !unlimited && svgLimit > 0 && svgUsed >= svgLimit;
  const blocked = textBlocked || svgBlocked;
  const blockedKind: "text" | "svg" = textBlocked ? "text" : "svg";

  const send = useCallback(async () => {
    const instruction = input.trim();
    if (!instruction || busy || blocked || items.length === 0) return;
    setBusy(true);
    try {
      const result = await api.groupPromptEditDetailPage(generatedId, {
        instruction,
        items,
      });
      if (typeof result.text_used === "number" && typeof result.text_limit === "number") {
        onUsage?.("text", result.text_used, result.text_limit);
      }
      if (typeof result.svg_used === "number" && typeof result.svg_limit === "number") {
        onUsage?.("svg", result.svg_used, result.svg_limit);
      }
      const changed = result.results.filter((r) => {
        const src = items.find((i) => i.id === r.id);
        if (!src) return false;
        if (r.kind === "text") return (r.text ?? "").trim() !== (src.current_text ?? "").trim();
        return (r.svg ?? "").trim() !== (src.current_svg ?? "").trim();
      });
      if (changed.length === 0) {
        toast.info("바뀐 내용이 없어요. 다르게 요청해 보세요.");
      } else {
        onApplied(changed);
        toast.success("그룹을 수정했어요.");
        setInput("");
      }
    } catch (err) {
      const quota = api.asEditQuotaError(err);
      if (quota) {
        onUsage?.(quota.kind, quota.limit, quota.limit);
        toast.error("편집 한도를 모두 사용했어요.");
      } else {
        toast.error(err instanceof Error ? err.message : "수정 요청이 실패했어요.");
      }
    } finally {
      setBusy(false);
    }
  }, [api, toast, input, busy, blocked, items, generatedId, onApplied, onUsage]);

  // 배지는 그룹에 텍스트가 있으면 텍스트, 아니면 SVG 사용량을 대표로 보여준다.
  const badgeUsed = hasText ? textUsed : svgUsed;
  const badgeLimit = hasText ? textLimit : svgLimit;

  return (
    <div className="flex flex-col overflow-hidden rounded-le-xl border border-le-ink-200 bg-le-surface">
      <div className="flex items-center gap-1.5 border-b border-le-ink-200 px-3 py-2">
        <Sparkles size={13} className="text-le-ai" />
        <span className="text-xs font-le-medium text-le-ink-900">프롬프트로 편집</span>
        {unlimited || badgeLimit > 0 ? (
          <EditUsageBadge used={badgeUsed} limit={badgeLimit} unlimited={unlimited} />
        ) : null}
      </div>
      {blocked ? (
        <EditQuotaBlock kind={blockedKind} onBuyMore={onBuyMore} />
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
              busy ? "수정 중…" : '어떻게 바꿀까요? (예: "더 힘있게", "톤을 통일해서")'
            }
            disabled={busy}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-5 text-le-ink-900 outline-none placeholder:text-le-ink-400 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-le-lg bg-le-ink-900 text-le-on-accent disabled:opacity-40"
            aria-label="프롬프트로 수정"
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ArrowUp size={15} />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
