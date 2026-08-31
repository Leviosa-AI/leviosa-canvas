"use client";

import { useEffect, useState } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Unlink } from "lucide-react";

import { ColorInput } from "../cardnews/color-input";
import { SpecPromptEditPanel } from "./spec-prompt-edit-panel";
import type { SpecEditPrompting } from "./table-inspector";
import {
  NumberField,
  Section,
  ToggleButton,
} from "./inspector-controls";
import { formatChartValue, parseChartNumber } from "../../lib/detail-page/chart/format";
import { resolveChart } from "../../lib/detail-page/chart/normalize";
import {
  MAX_PALETTE_SLOTS,
  paletteScope,
  paletteSlots,
  withPaletteColor,
} from "../../lib/detail-page/chart/palette";
import { parseChartTable } from "../../lib/detail-page/chart/paste";
import { CHART_KINDS } from "../../lib/detail-page/chart/render";
import {
  detachChart,
  syncChartGroup,
  type ElementLike,
  type StoreLike,
} from "../../lib/detail-page/chart/sync";
import type { ChartData, ChartSpec, ChartStyle } from "../../lib/detail-page/chart/types";

/**
 * 차트 인스펙터 — Canva의 "차트 편집"에 해당한다.
 *
 * 모든 변경은 여기서 스펙을 고쳐 ``syncChartGroup``으로 다시 그리는 경로 하나만 탄다.
 * 그래서 값과 그림이 절대 어긋나지 않는다 — 지금 템플릿의 하드코딩 막대(값 따로, 길이
 * 따로)가 겪던 문제가 그것이다.
 *
 * 캔버스의 막대는 **잠겨 있지 않다**. 잠그면 클릭이 아무것도 못 맞혀 차트를 아예 고를 수
 * 없다(``spec-group/sync``의 규칙 4). 드릴인해서 막대를 직접 고칠 수는 있지만, 그렇게
 * 고친 값은 다음 재생성 때 스펙에서 다시 그려져 덮인다.
 *
 * 종류를 바꿔도 ``spec.data``는 그대로라 데이터가 살아남는다.
 */

// ── 셀 ──────────────────────────────────────────────────────────────────────

/** blur/Enter에 커밋하는 입력. 타이핑마다 다시 그리면 캔버스가 덜덜 떤다. */
function Cell({
  value,
  onCommit,
  align = "left",
  placeholder,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  align?: "left" | "right";
  placeholder?: string;
  ariaLabel: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => {
    if (local !== value) onCommit(local);
  };
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`w-full min-w-0 rounded-le-md border border-le-ink-200 bg-le-surface px-2 py-1.5 text-sm text-le-ink-900 outline-none focus:border-le-ink-400 ${
        align === "right" ? "text-right tabular-nums" : ""
      }`}
    />
  );
}

// ── 데이터 조작 ──────────────────────────────────────────────────────────────

function replaceAt<T>(list: T[], index: number, next: T): T[] {
  return list.map((item, i) => (i === index ? next : item));
}

function withLabel(data: ChartData, index: number, label: string): ChartData {
  return { ...data, labels: replaceAt(data.labels, index, label) };
}

function withValue(
  data: ChartData,
  row: number,
  column: number,
  value: number | null,
): ChartData {
  return {
    ...data,
    series: data.series.map((s, i) =>
      i === column ? { ...s, values: replaceAt(s.values, row, value) } : s,
    ),
  };
}

function withRowAdded(data: ChartData): ChartData {
  return {
    labels: [...data.labels, ""],
    series: data.series.map((s) => ({ ...s, values: [...s.values, null] })),
  };
}

function withRowRemoved(data: ChartData, index: number): ChartData {
  return {
    labels: data.labels.filter((_, i) => i !== index),
    series: data.series.map((s) => ({
      ...s,
      values: s.values.filter((_, i) => i !== index),
    })),
  };
}

/** 행을 지우면 강조가 가리키던 자리도 따라 옮기거나 풀린다. */
export function highlightAfterRemove(
  highlight: number | null,
  removed: number,
): number | null {
  if (highlight === null) return null;
  if (highlight === removed) return null;
  return highlight > removed ? highlight - 1 : highlight;
}

// ── 인스펙터 ────────────────────────────────────────────────────────────────

export const ChartInspector = observer(function ChartInspector({
  store,
  el,
  spec,
  prompting,
}: {
  store: StoreLike;
  el: ElementLike;
  spec: ChartSpec;
  prompting?: SpecEditPrompting;
}) {
  const { t } = useTranslation("branding");
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (patch: Partial<ChartSpec>) => {
    syncChartGroup(store, el, { ...spec, ...patch });
  };
  const setData = (data: ChartData) => apply({ data });
  const setOptions = (patch: Partial<ChartSpec["options"]>) =>
    apply({ options: { ...spec.options, ...patch } });
  const setStyle = (patch: Partial<ChartStyle>) =>
    apply({ style: { ...spec.style, ...patch } });

  const resolved = resolveChart(spec);
  const rows = spec.data.labels.length;

  const scope = paletteScope(spec);
  const slots = paletteSlots(spec);
  const slotsTruncated =
    (scope === "series" ? spec.data.series.length : spec.data.labels.length) >
    MAX_PALETTE_SLOTS;

  /** 스프레드시트에서 붙여넣기 — 표 전체를 갈아 끼운다. */
  const onPaste = (event: React.ClipboardEvent) => {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    // 한 칸짜리 값은 그냥 입력이다. 여러 칸/여러 줄일 때만 표로 해석한다.
    if (!text.includes("\t") && !text.includes("\n")) return;
    const parsed = parseChartTable(text);
    if (!parsed) return;
    event.preventDefault();
    setNotice(t("detailPage.chart.pasted", { count: parsed.labels.length }));
    apply({
      data: parsed,
      options: {
        ...spec.options,
        // 붙여넣은 표는 행 수가 달라지므로 강조를 유지할 근거가 없다.
        highlightIndex: null,
      },
    });
  };

  return (
    <>
      {prompting?.generatedId ? (
        <Section title={t("detailPage.specPromptEdit.section")}>
          <SpecPromptEditPanel
            generatedId={prompting.generatedId}
            specKind="chart"
            elementId={String(el.id ?? "")}
            currentSpec={spec}
            // 서버가 준 스펙도 사용자가 고친 것과 같은 경로로 적용한다 — 그리는 곳이
            // 하나여야 값과 그림이 안 어긋난다.
            onApplied={(next) => syncChartGroup(store, el, next as ChartSpec)}
            editsUsed={prompting.usage?.textUsed}
            editLimit={prompting.usage?.textLimit}
            unlimited={prompting.usage?.unlimited}
            onUsage={prompting.onUsage}
            onBuyMore={prompting.onBuyMore}
          />
        </Section>
      ) : null}

      <Section title={t("detailPage.chart.kind")}>
        <div className="grid grid-cols-2 gap-1.5">
          {CHART_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={kind === spec.kind}
              onClick={() => apply({ kind })}
              className={`h-8 rounded-le-md border text-xs transition-colors ${
                kind === spec.kind
                  ? "border-le-ink-300 bg-le-ink-100 font-le-semibold text-le-ink-900"
                  : "border-le-ink-200 bg-le-surface text-le-ink-600 hover:bg-le-ink-50"
              }`}
            >
              {t(`detailPage.chart.kinds.${kind}`)}
            </button>
          ))}
        </div>
        {resolved.hiddenSeries > 0 ? (
          <p className="mt-2 text-[11px] text-le-warn-600">
            {t("detailPage.chart.hiddenSeries", { count: resolved.hiddenSeries })}
          </p>
        ) : null}
      </Section>

      <Section title={t("detailPage.chart.data")}>
        <div onPaste={onPaste}>
          <div className="flex items-center gap-1.5 pb-1 text-[11px] text-le-ink-400">
            <span className="flex-1">{t("detailPage.chart.columnLabel")}</span>
            {spec.data.series.map((series) => (
              <span key={series.name} className="w-20 text-right">
                {series.name}
              </span>
            ))}
            <span className="w-6" />
          </div>
          <div className="flex flex-col gap-1.5">
            {spec.data.labels.map((label, row) => (
              <div key={row} className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <Cell
                    ariaLabel={t("detailPage.chart.rowLabelAria", { row: row + 1 })}
                    value={label}
                    placeholder={t("detailPage.chart.columnLabel")}
                    onCommit={(next) => setData(withLabel(spec.data, row, next))}
                  />
                </div>
                {spec.data.series.map((series, column) => (
                  <div key={series.name} className="w-20 shrink-0">
                    <Cell
                      ariaLabel={t("detailPage.chart.rowValueAria", {
                        row: row + 1,
                        series: series.name,
                      })}
                      align="right"
                      value={formatChartValue(series.values[row] ?? null, {
                        decimals: spec.options.decimals,
                        grouping: false,
                      })}
                      onCommit={(next) =>
                        setData(
                          withValue(spec.data, row, column, parseChartNumber(next)),
                        )
                      }
                    />
                  </div>
                ))}
                <button
                  type="button"
                  aria-label={t("detailPage.chart.removeRow")}
                  title={t("detailPage.chart.removeRow")}
                  disabled={rows <= 1}
                  onClick={() =>
                    apply({
                      data: withRowRemoved(spec.data, row),
                      options: {
                        ...spec.options,
                        highlightIndex: highlightAfterRemove(
                          spec.options.highlightIndex,
                          row,
                        ),
                      },
                    })
                  }
                  className="flex h-8 w-6 shrink-0 items-center justify-center rounded-le-md text-le-ink-400 hover:text-le-danger-500 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setData(withRowAdded(spec.data))}
            className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-le-md border border-le-ink-200 bg-le-surface text-xs font-le-medium text-le-ink-600 hover:bg-le-ink-50"
          >
            <Plus size={14} />
            {t("detailPage.chart.addRow")}
          </button>
          <p className="mt-1.5 text-[11px] text-le-ink-400">
            {notice ?? t("detailPage.chart.pasteHint")}
          </p>
        </div>
      </Section>

      <Section title={t("detailPage.chart.display")}>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs text-le-ink-500">
              {t("detailPage.chart.unit")}
            </span>
            <Cell
              ariaLabel={t("detailPage.chart.unit")}
              value={spec.options.unit}
              placeholder="%"
              onCommit={(unit) => setOptions({ unit })}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs text-le-ink-500">
              {t("detailPage.chart.decimals")}
            </span>
            <NumberField
              value={spec.options.decimals}
              min={0}
              max={3}
              onChange={(decimals) => setOptions({ decimals })}
            />
          </label>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <ToggleButton
            active={spec.options.showValue}
            title={t("detailPage.chart.showValue")}
            onClick={() => setOptions({ showValue: !spec.options.showValue })}
          >
            <span className="text-xs">{t("detailPage.chart.showValue")}</span>
          </ToggleButton>
          <ToggleButton
            active={spec.style.showTrack}
            title={t("detailPage.chart.showTrack")}
            onClick={() => setStyle({ showTrack: !spec.style.showTrack })}
          >
            <span className="text-xs">{t("detailPage.chart.showTrack")}</span>
          </ToggleButton>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {(["none", "desc", "asc"] as const).map((sort) => (
            <ToggleButton
              key={sort}
              active={spec.options.sort === sort}
              title={t(`detailPage.chart.sorts.${sort}`)}
              onClick={() => setOptions({ sort })}
            >
              <span className="text-xs">{t(`detailPage.chart.sorts.${sort}`)}</span>
            </ToggleButton>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs text-le-ink-500">
              {t("detailPage.chart.max")}
            </span>
            {spec.options.max === "auto" ? (
              <button
                type="button"
                onClick={() => setOptions({ max: Math.round(resolved.max) })}
                className="h-8 min-w-0 flex-1 rounded-le-md border border-le-ink-200 bg-le-surface text-xs text-le-ink-500 hover:bg-le-ink-50"
              >
                {t("detailPage.chart.maxAuto")}
              </button>
            ) : (
              <NumberField
                value={spec.options.max}
                min={1}
                onChange={(max) => setOptions({ max })}
              />
            )}
          </label>
          {spec.options.max === "auto" ? null : (
            <button
              type="button"
              onClick={() => setOptions({ max: "auto" })}
              className="h-8 rounded-le-md border border-le-ink-200 bg-le-surface text-xs text-le-ink-500 hover:bg-le-ink-50"
            >
              {t("detailPage.chart.maxToAuto")}
            </button>
          )}
        </div>

        <label className="mt-2 flex items-center gap-2">
          <span className="w-10 shrink-0 text-xs text-le-ink-500">
            {t("detailPage.chart.highlight")}
          </span>
          <select
            aria-label={t("detailPage.chart.highlight")}
            value={spec.options.highlightIndex ?? ""}
            onChange={(event) =>
              setOptions({
                highlightIndex:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
            className="h-8 min-w-0 flex-1 rounded-le-md border border-le-ink-200 bg-le-surface px-2 text-xs text-le-ink-700 outline-none focus:border-le-ink-400"
          >
            <option value="">{t("detailPage.chart.highlightNone")}</option>
            {spec.data.labels.map((label, index) => (
              <option key={index} value={index}>
                {label || t("detailPage.chart.rowLabelAria", { row: index + 1 })}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title={t("detailPage.chart.colors")}>
        {/* 팔레트는 종류마다 대응 대상이 다르다 — 막대·도넛은 항목별, 라인·스택은
            시리즈별. 강조 항목이 지정돼 있으면 첫 색 하나만 쓰이므로 슬롯도 하나다
            (여러 개 펼치면 눌러도 아무 일 없는 컨트롤이 생긴다). */}
        <div className="flex flex-col gap-2">
          {slots.map((slot) => (
            <label key={slot.index} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-xs text-le-ink-500">
                {scope === "highlight"
                  ? t("detailPage.chart.color.accent")
                  : slot.name ||
                    t(
                      scope === "series"
                        ? "detailPage.chart.color.seriesN"
                        : "detailPage.chart.color.itemN",
                      { n: slot.index + 1 },
                    )}
              </span>
              <ColorInput
                value={slot.color}
                onChange={(color) =>
                  apply(withPaletteColor(spec, slot.index, color))
                }
              />
            </label>
          ))}
          {scope !== "highlight" && slotsTruncated ? (
            <p className="text-[11px] leading-relaxed text-le-ink-400">
              {t("detailPage.chart.color.moreSlots", { count: MAX_PALETTE_SLOTS })}
            </p>
          ) : null}

          {(
            [
              ["muted", spec.style.mutedColor],
              ["track", spec.style.trackColor],
              ["label", spec.style.labelColor],
              ["value", spec.style.valueColor],
            ] as const
          ).map(([key, value]) => (
            <label key={key} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-le-ink-500">
                {t(`detailPage.chart.color.${key}`)}
              </span>
              <ColorInput
                value={value}
                onChange={(color) => {
                  if (key === "muted") setStyle({ mutedColor: color });
                  else if (key === "track") setStyle({ trackColor: color });
                  else if (key === "label") setStyle({ labelColor: color });
                  else setStyle({ valueColor: color });
                }}
              />
            </label>
          ))}
        </div>
      </Section>

      <Section title={t("detailPage.chart.shape")}>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs text-le-ink-500">
              {t("detailPage.chart.barSize")}
            </span>
            <NumberField
              value={spec.style.barSize}
              min={1}
              onChange={(barSize) => setStyle({ barSize })}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs text-le-ink-500">
              {t("detailPage.chart.gap")}
            </span>
            <NumberField
              value={spec.style.gap}
              min={0}
              onChange={(gap) => setStyle({ gap })}
            />
          </label>
        </div>
      </Section>

      <Section title={t("detailPage.properties.actions")}>
        <button
          type="button"
          onClick={() => detachChart(el)}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-le-md border border-le-ink-200 bg-le-surface text-sm font-le-semibold text-le-ink-700 hover:bg-le-ink-50"
        >
          <Unlink aria-hidden="true" size={15} />
          {t("detailPage.chart.detach")}
        </button>
        <p className="mt-1.5 text-[11px] text-le-ink-400">
          {t("detailPage.chart.detachHint")}
        </p>
      </Section>
    </>
  );
});
