"use client";

// 프롬프트 편집 무료 한도(SVG 15 / 텍스트 30) UI 조각. 텍스트/SVG 편집 패널이 공유한다.
// - EditUsageBadge: "(N/M회)" 카운터. 한도 근접 시 색을 바꿔 경고.
// - EditQuotaBlock: 한도 소진 시 입력 대신 노출되는 하드 차단 + "편집 크레딧 추가하기" CTA.

import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDetailPageHost } from "./detail-page-host-context";

export interface EditUsageState {
  svgUsed: number;
  svgLimit: number;
  textUsed: number;
  textLimit: number;
  unlimited: boolean;
}

const EMPTY_USAGE: EditUsageState = {
  svgUsed: 0,
  svgLimit: 0,
  textUsed: 0,
  textLimit: 0,
  unlimited: false,
};

/**
 * 편집기 로드 시 인스턴스의 프롬프트 편집 사용량/한도를 한 번 조회하고,
 * 편집 성공/차단 시 applyUsage로 낙관적 갱신한다. generatedId가 없으면(픽스처) no-op.
 */
export function useDetailPageEditUsage(generatedId?: string) {
  const { api } = useDetailPageHost();
  const [usage, setUsage] = useState<EditUsageState>(EMPTY_USAGE);

  useEffect(() => {
    if (!generatedId) {
      setUsage(EMPTY_USAGE);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const u = await api.getDetailPageEditUsage(generatedId, controller.signal);
        if (!cancelled) {
          setUsage({
            svgUsed: u.svg_used,
            svgLimit: u.svg_limit,
            textUsed: u.text_used,
            textLimit: u.text_limit,
            unlimited: u.unlimited,
          });
        }
      } catch {
        /* 미로그인/미배포 → 카운터 숨김(0 한도) */
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, generatedId]);

  const applyUsage = useCallback(
    (kind: "svg" | "text", used: number, limit: number) => {
      setUsage((prev) =>
        kind === "svg"
          ? { ...prev, svgUsed: used, svgLimit: limit }
          : { ...prev, textUsed: used, textLimit: limit },
      );
    },
    [],
  );

  return { usage, applyUsage };
}

export function EditUsageBadge({
  used,
  limit,
  unlimited = false,
}: {
  used: number;
  limit: number;
  /** 한도 면제(scratch/시연) 시 분모·경고색 없이 '{used}회'만 표시한다. */
  unlimited?: boolean;
}) {
  const { t } = useTranslation("branding");
  if (unlimited) {
    return (
      <span
        className="ml-auto text-[11px] tabular-nums text-dpe-ink-500"
        title={t("detailPage.editQuota.unlimitedTitle")}
      >
        {t("detailPage.editQuota.usedUnlimited", { used })}
      </span>
    );
  }
  const remaining = Math.max(0, limit - used);
  const warn = remaining <= Math.max(1, Math.ceil(limit * 0.2));
  return (
    <span
      className={
        "ml-auto text-[11px] tabular-nums " +
        (remaining === 0
          ? "text-dpe-danger-600"
          : warn
            ? "text-dpe-warn-500"
            : "text-dpe-ink-500")
      }
      title={t("detailPage.editQuota.remainingTitle", { remaining })}
    >
      {t("detailPage.editQuota.usage", { used, limit })}
    </span>
  );
}

export function EditQuotaBlock({
  kind,
  onBuyMore,
}: {
  kind: "svg" | "text";
  onBuyMore?: () => void;
}) {
  const { t } = useTranslation("branding");
  const label =
    kind === "svg"
      ? t("detailPage.editQuota.shapeEdit")
      : t("detailPage.editQuota.textEdit");
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-4 text-center">
      <p className="text-[13px] font-dpe-medium text-dpe-ink-900">
        {t("detailPage.editQuota.quotaExhausted", { label })}
      </p>
      <p className="text-[11px] leading-4 text-dpe-ink-500">
        {t("detailPage.editQuota.quotaHint")}
      </p>
      <button
        type="button"
        onClick={onBuyMore}
        disabled={!onBuyMore}
        className="mt-1 inline-flex items-center gap-1.5 rounded-dpe-lg bg-dpe-ink-900 px-3 py-1.5 text-xs font-dpe-medium text-dpe-on-accent disabled:opacity-40"
      >
        <Sparkles size={13} />
        {t("detailPage.editQuota.buyCredits")}
      </button>
    </div>
  );
}
