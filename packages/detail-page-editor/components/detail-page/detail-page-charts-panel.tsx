"use client";

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { CHART_PRESETS, createChartSpec, type ChartPreset } from "../../lib/detail-page/chart/defaults";
import { chartPreviewSvg } from "../../lib/detail-page/chart/preview";
import { scaleChartStyle } from "../../lib/detail-page/chart/render";
import { documentFontFamily, insertChart, type StoreLike } from "../../lib/detail-page/chart/sync";
import { encodeSvgDataUri } from "../../lib/detail-page-canvas/export/svg";

/**
 * "차트" 패널 — 프리셋을 클릭하면 캔버스에 차트가 놓인다.
 *
 * 썸네일은 별도 자산이 아니라 **실제 렌더러 출력**을 SVG로 옮긴 것이다(``preview.ts``).
 * 프리셋을 고치면 썸네일이 저절로 따라오고, 카탈로그와 결과가 어긋나지 않는다.
 *
 * 넣는 차트는 페이지 폭의 80%, 폰트는 문서에서 가장 많이 쓰인 것을 물려받는다 —
 * 캔버스에 놓자마자 페이지 톤에 붙어 있어야 "AI가 얹어 준 것"처럼 보이지 않는다.
 */

/** 썸네일 기준 폭. 실제 삽입 폭(≈600)과의 비율로 스타일을 줄인다. */
const PREVIEW_WIDTH = 220;
const REFERENCE_WIDTH = 600;

const PREVIEW_DATA = {
  labels: ["우리", "A", "B"],
  series: [{ name: "값", values: [92, 61, 45] }],
};

function previewUri(preset: ChartPreset): string {
  const full = createChartSpec({
    kind: preset.kind,
    width: PREVIEW_WIDTH,
    style: preset.style,
    options: preset.options,
    data: preset.data ?? PREVIEW_DATA,
  });
  return encodeSvgDataUri(
    chartPreviewSvg(scaleChartStyle(full, PREVIEW_WIDTH / REFERENCE_WIDTH)),
  );
}

export function DetailPageChartsPanel({ store }: { store: unknown }) {
  const { t } = useTranslation("branding");
  const s = store as StoreLike;

  // 프리셋은 코드 상수라 세션 내내 안 바뀐다. 매 렌더마다 SVG를 다시 굽지 않는다.
  const cells = useMemo(
    () => CHART_PRESETS.map((preset) => ({ preset, uri: previewUri(preset) })),
    [],
  );

  const insert = useCallback(
    (preset: ChartPreset) => {
      const page = s.activePage ?? s.pages?.[0];
      const pageWidth =
        typeof page?.computedWidth === "number" ? page.computedWidth : 860;
      insertChart(
        s,
        createChartSpec({
          kind: preset.kind,
          width: Math.round(pageWidth * 0.8),
          fontFamily: documentFontFamily(s),
          style: preset.style,
          options: preset.options,
          data: preset.data,
        }),
        { name: t(preset.labelKey) },
      );
    },
    [s, t],
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <p className="mb-2 text-xs font-dpe-medium text-dpe-ink-500">
        {t("detailPage.chart.panelTitle")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {cells.map(({ preset, uri }) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => insert(preset)}
            title={t("detailPage.chart.insertHint")}
            className="flex flex-col items-center gap-1.5 rounded-dpe-lg border border-dpe-ink-200 p-2 hover:border-dpe-ink-400"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={uri}
              alt={t(preset.labelKey)}
              className="h-20 w-full object-contain"
            />
            <span className="text-[11px] text-dpe-ink-500">{t(preset.labelKey)}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-dpe-ink-400">
        {t("detailPage.chart.panelHint")}
      </p>
    </div>
  );
}
