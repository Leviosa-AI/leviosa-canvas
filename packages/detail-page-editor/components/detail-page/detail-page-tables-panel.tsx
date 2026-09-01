"use client";

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  TABLE_PRESETS,
  createTableSpec,
  type TablePreset,
} from "../../lib/detail-page/table/defaults";
import { tablePreviewSvg } from "../../lib/detail-page/table/preview";
import { scaleTableStyle } from "../../lib/detail-page/table/render";
import {
  documentFontFamily,
  insertTable,
  type StoreLike,
} from "../../lib/detail-page/table/sync";
import { encodeSvgDataUri } from "../../lib/detail-page-canvas/export/svg";

/**
 * "표" 패널 — 프리셋을 클릭하면 캔버스에 표가 놓인다.
 *
 * 썸네일은 별도 자산이 아니라 **실제 렌더러 출력**을 SVG로 옮긴 것이다(``preview.ts``).
 * 프리셋을 고치면 썸네일이 저절로 따라오고, 카탈로그와 결과가 어긋나지 않는다.
 *
 * 넣는 표는 페이지 폭의 80%, 폰트는 문서에서 가장 많이 쓰인 것을 물려받는다.
 */

/** 썸네일 기준 폭. 실제 삽입 폭(≈650)과의 비율로 스타일을 줄인다. */
const PREVIEW_WIDTH = 240;
const REFERENCE_WIDTH = 650;

function previewUri(preset: TablePreset): string {
  const full = createTableSpec({
    kind: preset.kind,
    width: PREVIEW_WIDTH,
    style: preset.style,
    options: preset.options,
    data: preset.data,
  });
  return encodeSvgDataUri(
    tablePreviewSvg(scaleTableStyle(full, PREVIEW_WIDTH / REFERENCE_WIDTH)),
  );
}

export function DetailPageTablesPanel({ store }: { store: unknown }) {
  const { t } = useTranslation("branding");
  const s = store as StoreLike;

  // 프리셋은 코드 상수라 세션 내내 안 바뀐다. 매 렌더마다 SVG를 다시 굽지 않는다.
  const cells = useMemo(
    () => TABLE_PRESETS.map((preset) => ({ preset, uri: previewUri(preset) })),
    [],
  );

  const insert = useCallback(
    (preset: TablePreset) => {
      const page = s.activePage ?? s.pages?.[0];
      const pageWidth =
        typeof page?.computedWidth === "number" ? page.computedWidth : 860;
      const font = documentFontFamily(s);
      insertTable(
        s,
        createTableSpec({
          kind: preset.kind,
          width: Math.round(pageWidth * 0.8),
          style: { ...preset.style, ...(font ? { fontFamily: font } : {}) },
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
      <p className="mb-2 text-xs font-le-medium text-le-ink-500">
        {t("detailPage.table.panelTitle")}
      </p>
      <div className="grid grid-cols-1 gap-2">
        {cells.map(({ preset, uri }) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => insert(preset)}
            title={t("detailPage.table.insertHint")}
            className="flex flex-col items-center gap-1.5 rounded-le-lg border border-le-ink-200 p-2 hover:border-le-ink-400"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={uri}
              alt={t(preset.labelKey)}
              className="h-16 w-full object-contain"
            />
            <span className="text-[11px] text-le-ink-500">{t(preset.labelKey)}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-le-ink-400">
        {t("detailPage.table.panelHint")}
      </p>
    </div>
  );
}
