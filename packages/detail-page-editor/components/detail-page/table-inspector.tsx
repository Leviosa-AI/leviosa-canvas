"use client";

import { useEffect, useState } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import { Columns3, RotateCcw, Rows3, Trash2, Unlink } from "lucide-react";

import { ColorInput } from "../cardnews/color-input";
import { SpecPromptEditPanel } from "./spec-prompt-edit-panel";
import {
  NumberField,
  Section,
  ToggleButton,
} from "./inspector-controls";
import {
  alignAfterColumnRemove,
  autoColumnWidths,
  withCell,
  withColumnAdded,
  withColumnName,
  withColumnRemoved,
  withRowAdded,
  withRowRemoved,
} from "../../lib/detail-page/table/edit";
import { MAX_COLUMNS, MAX_ROWS, resolveTable } from "../../lib/detail-page/table/normalize";
import { parseTableGrid } from "../../lib/detail-page/table/paste";
import {
  detachTable,
  syncTableGroup,
  type ElementLike,
  type StoreLike,
} from "../../lib/detail-page/table/sync";
import type {
  CellAlign,
  TableData,
  TableRule,
  TableSpec,
  TableStyle,
} from "../../lib/detail-page/table/types";

/**
 * 표 인스펙터.
 *
 * 모든 변경은 스펙을 고쳐 ``syncTableGroup``으로 다시 그리는 경로 하나만 탄다.
 *
 * 칸은 캔버스에서 드릴인해 직접 고쳐도 된다 — 그렇게 친 글자는 재생성 직전에 스펙으로
 * 되받아진다(``table/harvest.ts``). 그래서 이 패널이 보여 주는 값도 저장된 스펙이 아니라
 * **걷어 온 스펙**이다(속성 패널에서 ``harvestTableGroup``을 거쳐 내려온다). 둘이 어긋나면
 * 사용자가 캔버스에서 고친 글자를 패널이 옛 값으로 되돌려 버린다.
 */

/**
 * 프롬프트 편집에 필요한 것들. 부모(속성 패널)가 들고 있는 값을 그대로 받는다.
 *
 * 타입을 여기서 따로 좁게 정의한다 — 속성 패널에서 끌어오면 순환 import가 된다
 * (``inspector-controls``를 뽑아낸 것과 같은 이유).
 */
export type SpecEditPrompting = {
  /** 생성 인스턴스 ID. 없으면(픽스처 모드) 프롬프트 편집을 안 띄운다. */
  generatedId?: string;
  usage?: { textUsed?: number; textLimit?: number; unlimited?: boolean };
  onUsage?: (used: number, limit: number) => void;
  onBuyMore?: () => void;
};

const KINDS: TableSpec["kind"][] = ["keyvalue", "grid"];
const ALIGNS: CellAlign[] = ["left", "center", "right"];

// ── 셀 ──────────────────────────────────────────────────────────────────────

/** blur/Enter에 커밋하는 입력. 타이핑마다 다시 그리면 캔버스가 덜덜 떤다. */
function Cell({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  onPaste,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  ariaLabel: string;
  onPaste?: (event: React.ClipboardEvent) => void;
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
      onPaste={onPaste}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-full min-w-0 rounded-dpe-md border border-dpe-ink-200 bg-dpe-surface px-2 py-1.5 text-sm text-dpe-ink-900 outline-none focus:border-dpe-ink-400"
    />
  );
}

// ── 선 컨트롤 ────────────────────────────────────────────────────────────────

function RuleControl({
  label,
  rule,
  fallbackColor,
  onChange,
}: {
  label: string;
  rule: TableRule;
  fallbackColor: string;
  onChange: (next: TableRule) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <ToggleButton
        active={rule !== null}
        onClick={() =>
          onChange(rule === null ? { color: fallbackColor, width: 1 } : null)
        }
        title={label}
      >
        {label}
      </ToggleButton>
      {rule ? (
        <ColorInput
          value={rule.color}
          onChange={(color) => onChange({ ...rule, color })}
        />
      ) : null}
    </div>
  );
}

// ── 인스펙터 ────────────────────────────────────────────────────────────────

export const TableInspector = observer(function TableInspector({
  store,
  el,
  spec,
  prompting,
}: {
  store: StoreLike;
  el: ElementLike;
  spec: TableSpec;
  prompting?: SpecEditPrompting;
}) {
  const { t } = useTranslation("branding");
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (patch: Partial<TableSpec>) => {
    syncTableGroup(store, el, { ...spec, ...patch });
  };
  const setData = (data: TableData) => apply({ data });
  const setOptions = (patch: Partial<TableSpec["options"]>) =>
    apply({ options: { ...spec.options, ...patch } });
  const setStyle = (patch: Partial<TableStyle>) =>
    apply({ style: { ...spec.style, ...patch } });

  const resolved = resolveTable(spec);
  const rowCount = spec.data.rows.length;
  const columnCount = resolved.columnCount;
  const isGrid = spec.kind === "grid";

  /** 스프레드시트에서 붙여넣기 — 표 전체를 갈아 끼운다. */
  const onPaste = (event: React.ClipboardEvent) => {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    // 한 칸짜리 값은 그냥 입력이다. 여러 칸/여러 줄일 때만 표로 해석한다.
    if (!text.includes("\t") && !text.includes("\n")) return;
    const parsed = parseTableGrid(text);
    if (!parsed) return;
    event.preventDefault();
    setNotice(t("detailPage.table.pasted", { count: parsed.rows.length }));
    apply({ data: parsed });
  };

  return (
    <>
      {prompting?.generatedId ? (
        <Section title={t("detailPage.specPromptEdit.section")}>
          <SpecPromptEditPanel
            generatedId={prompting.generatedId}
            specKind="table"
            elementId={String(el.id ?? "")}
            currentSpec={spec}
            // 서버가 준 스펙도 사용자가 고친 것과 같은 경로로 적용한다 — 그리는 곳이
            // 하나여야 값과 그림이 안 어긋난다.
            onApplied={(next) => syncTableGroup(store, el, next as TableSpec)}
            editsUsed={prompting.usage?.textUsed}
            editLimit={prompting.usage?.textLimit}
            unlimited={prompting.usage?.unlimited}
            onUsage={prompting.onUsage}
            onBuyMore={prompting.onBuyMore}
          />
        </Section>
      ) : null}

      <Section title={t("detailPage.table.kind")}>
        <div className="grid grid-cols-2 gap-1.5">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={kind === spec.kind}
              onClick={() => apply({ kind })}
              className={`h-8 rounded-dpe-md border text-xs transition-colors ${
                kind === spec.kind
                  ? "border-dpe-ink-300 bg-dpe-ink-100 font-dpe-semibold text-dpe-ink-900"
                  : "border-dpe-ink-200 bg-dpe-surface text-dpe-ink-600 hover:bg-dpe-ink-50"
              }`}
            >
              {t(`detailPage.table.kinds.${kind}`)}
            </button>
          ))}
        </div>
        {spec.kind === "keyvalue" && spec.data.columns.length > 2 ? (
          <p className="mt-2 text-[11px] text-dpe-warn-600">
            {t("detailPage.table.hiddenColumns", {
              count: spec.data.columns.length - 2,
            })}
          </p>
        ) : null}
      </Section>

      <Section title={t("detailPage.table.data")}>
        <div>
          {/* 머리글 행 — grid에서만 실제로 그려진다. */}
          {isGrid ? (
            <div className="flex items-center gap-1.5 pb-1.5">
              {Array.from({ length: columnCount }, (_, column) => (
                <div key={column} className="min-w-0 flex-1">
                  <Cell
                    ariaLabel={t("detailPage.table.columnNameAria", {
                      column: column + 1,
                    })}
                    value={spec.data.columns[column] ?? ""}
                    placeholder={t("detailPage.table.columnName")}
                    onPaste={onPaste}
                    onCommit={(next) => setData(withColumnName(spec.data, column, next))}
                  />
                </div>
              ))}
              <button
                type="button"
                aria-label={t("detailPage.table.removeColumn")}
                title={t("detailPage.table.removeColumn")}
                disabled={columnCount <= 1}
                onClick={() =>
                  apply({
                    data: withColumnRemoved(spec.data, columnCount - 1),
                    options: {
                      ...spec.options,
                      align: alignAfterColumnRemove(spec.options.align, columnCount - 1),
                    },
                  })
                }
                className="shrink-0 rounded-dpe-md p-1.5 text-dpe-ink-400 hover:bg-dpe-ink-100 hover:text-dpe-ink-700 disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            {spec.data.rows.map((cells, row) => (
              <div key={row} className="flex items-center gap-1.5">
                {Array.from({ length: columnCount }, (_, column) => (
                  <div key={column} className="min-w-0 flex-1">
                    <Cell
                      ariaLabel={t("detailPage.table.cellAria", {
                        row: row + 1,
                        column: column + 1,
                      })}
                      value={cells[column] ?? ""}
                      onPaste={onPaste}
                      onCommit={(next) => setData(withCell(spec.data, row, column, next))}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  aria-label={t("detailPage.table.removeRow")}
                  title={t("detailPage.table.removeRow")}
                  disabled={rowCount <= 1}
                  onClick={() => apply({ data: withRowRemoved(spec.data, row) })}
                  className="shrink-0 rounded-dpe-md p-1.5 text-dpe-ink-400 hover:bg-dpe-ink-100 hover:text-dpe-ink-700 disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={rowCount >= MAX_ROWS}
              onClick={() => apply({ data: withRowAdded(spec.data) })}
              className="flex flex-1 items-center justify-center gap-1 rounded-dpe-md border border-dpe-ink-200 py-1.5 text-xs text-dpe-ink-600 hover:bg-dpe-ink-50 disabled:opacity-40"
            >
              <Rows3 className="h-3.5 w-3.5" />
              {t("detailPage.table.addRow")}
            </button>
            <button
              type="button"
              disabled={!isGrid || columnCount >= MAX_COLUMNS}
              onClick={() => apply({ data: withColumnAdded(spec.data) })}
              title={isGrid ? undefined : t("detailPage.table.addColumnGridOnly")}
              className="flex flex-1 items-center justify-center gap-1 rounded-dpe-md border border-dpe-ink-200 py-1.5 text-xs text-dpe-ink-600 hover:bg-dpe-ink-50 disabled:opacity-40"
            >
              <Columns3 className="h-3.5 w-3.5" />
              {t("detailPage.table.addColumn")}
            </button>
          </div>

          <p className="mt-2 text-[11px] text-dpe-ink-400">
            {notice ?? `${t("detailPage.table.pasteHint")} ${t("detailPage.table.canvasHint")}`}
          </p>
        </div>
      </Section>

      <Section title={t("detailPage.table.layout")}>
        <div className="flex flex-col gap-2">
          {isGrid ? (
            <ToggleButton
              active={spec.options.headerRow}
              onClick={() => setOptions({ headerRow: !spec.options.headerRow })}
              title={t("detailPage.table.headerRow")}
            >
              {t("detailPage.table.headerRow")}
            </ToggleButton>
          ) : null}
          <ToggleButton
            active={spec.options.zebra}
            onClick={() => setOptions({ zebra: !spec.options.zebra })}
            title={t("detailPage.table.zebra")}
          >
            {t("detailPage.table.zebra")}
          </ToggleButton>

          {/* 캔버스에서 열 경계를 끌면 폭이 스펙에 박힌다. 그때 "첫 칸 폭"을 그대로 두면
              눌러도 아무 일이 안 일어나는 컨트롤이 된다 — 대신 자동으로 되돌리는 버튼을
              보여 주고, 되돌리면 아래 컨트롤이 다시 살아난다. */}
          {spec.style.columnWidths ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => apply(autoColumnWidths(spec))}
                className="flex items-center gap-1 rounded-dpe-md border border-dpe-ink-200 px-2 py-1.5 text-xs text-dpe-ink-600 hover:bg-dpe-ink-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("detailPage.table.autoWidths")}
              </button>
              <span className="text-[11px] text-dpe-ink-400">
                {t("detailPage.table.autoWidthsHint")}
              </span>
            </div>
          ) : (
            /* 첫 칸 고정폭 — 브랜드가 190px로 맞춰 쓰는 값. 끄면 모든 열이 같은 폭이다. */
            <div className="flex items-center gap-2">
              <ToggleButton
                active={spec.style.firstWidth !== null}
                onClick={() =>
                  setStyle({ firstWidth: spec.style.firstWidth === null ? 190 : null })
                }
                title={t("detailPage.table.firstWidth")}
              >
                {t("detailPage.table.firstWidth")}
              </ToggleButton>
              {spec.style.firstWidth !== null ? (
                <NumberField
                  value={spec.style.firstWidth}
                  min={40}
                  max={480}
                  step={2}
                  onChange={(firstWidth) => setStyle({ firstWidth })}
                />
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="w-16 shrink-0 text-[11px] text-dpe-ink-500">
              {t("detailPage.table.align")}
            </span>
            <div className="flex flex-1 gap-1">
              {ALIGNS.map((align) => (
                <button
                  key={align}
                  type="button"
                  aria-label={t(`detailPage.table.aligns.${align}`)}
                  aria-pressed={(spec.options.align[columnCount - 1] ?? "left") === align}
                  onClick={() => {
                    const next = [...spec.options.align];
                    while (next.length < columnCount) next.push("left");
                    next[columnCount - 1] = align;
                    setOptions({ align: next });
                  }}
                  className={`h-7 flex-1 rounded-dpe-md border text-[11px] ${
                    (spec.options.align[columnCount - 1] ?? "left") === align
                      ? "border-dpe-ink-300 bg-dpe-ink-100 font-dpe-semibold text-dpe-ink-900"
                      : "border-dpe-ink-200 bg-dpe-surface text-dpe-ink-600 hover:bg-dpe-ink-50"
                  }`}
                >
                  {t(`detailPage.table.aligns.${align}`)}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-dpe-ink-400">
            {t("detailPage.table.alignHint")}
          </p>
        </div>
      </Section>

      <Section title={t("detailPage.table.lines")}>
        <div className="flex flex-col gap-2">
          <RuleControl
            label={t("detailPage.table.topRule")}
            rule={spec.style.topRule}
            fallbackColor={spec.style.firstColor}
            onChange={(topRule) => setStyle({ topRule })}
          />
          <RuleControl
            label={t("detailPage.table.rowRule")}
            rule={spec.style.rowRule}
            fallbackColor="#E3E5E8"
            onChange={(rowRule) => setStyle({ rowRule })}
          />
          <RuleControl
            label={t("detailPage.table.columnRule")}
            rule={spec.style.columnRule}
            fallbackColor="#E3E5E8"
            onChange={(columnRule) => setStyle({ columnRule })}
          />
          <div className="flex items-center gap-2">
            <ToggleButton
              active={spec.style.outerBorder !== null}
              onClick={() =>
                setStyle({
                  outerBorder:
                    spec.style.outerBorder === null
                      ? { color: "#E3E5E8", width: 1, radius: 4 }
                      : null,
                })
              }
              title={t("detailPage.table.outerBorder")}
            >
              {t("detailPage.table.outerBorder")}
            </ToggleButton>
            {spec.style.outerBorder ? (
              <ColorInput
                value={spec.style.outerBorder.color}
                onChange={(color) => {
                  const border = spec.style.outerBorder;
                  if (border) setStyle({ outerBorder: { ...border, color } });
                }}
              />
            ) : null}
          </div>
        </div>
      </Section>

      <Section title={t("detailPage.table.colors")}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ToggleButton
              active={spec.style.firstFill !== null}
              onClick={() =>
                setStyle({ firstFill: spec.style.firstFill === null ? "#F5F6F8" : null })
              }
              title={t("detailPage.table.firstFill")}
            >
              {t("detailPage.table.firstFill")}
            </ToggleButton>
            {spec.style.firstFill ? (
              <ColorInput
                value={spec.style.firstFill}
                onChange={(firstFill) => setStyle({ firstFill })}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11px] text-dpe-ink-500">
              {t("detailPage.table.firstColor")}
            </span>
            <ColorInput
              value={spec.style.firstColor}
              onChange={(firstColor) => setStyle({ firstColor })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11px] text-dpe-ink-500">
              {t("detailPage.table.textColor")}
            </span>
            <ColorInput
              value={spec.style.color}
              onChange={(color) => setStyle({ color })}
            />
          </div>
          <div className="flex items-center gap-2">
            <ToggleButton
              active={spec.style.bodyFill !== null}
              onClick={() =>
                setStyle({ bodyFill: spec.style.bodyFill === null ? "#FFFFFF" : null })
              }
              title={t("detailPage.table.bodyFill")}
            >
              {t("detailPage.table.bodyFill")}
            </ToggleButton>
            {spec.style.bodyFill ? (
              <ColorInput
                value={spec.style.bodyFill}
                onChange={(bodyFill) => setStyle({ bodyFill })}
              />
            ) : null}
          </div>
        </div>
      </Section>

      <Section title={t("detailPage.table.type")}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11px] text-dpe-ink-500">
              {t("detailPage.table.fontSize")}
            </span>
            <NumberField
              value={spec.style.fontSize}
              min={9}
              max={40}
              step={1}
              onChange={(fontSize) => setStyle({ fontSize })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11px] text-dpe-ink-500">
              {t("detailPage.table.padX")}
            </span>
            <NumberField
              value={spec.style.padX}
              min={0}
              max={60}
              step={2}
              onChange={(padX) => setStyle({ padX })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11px] text-dpe-ink-500">
              {t("detailPage.table.padY")}
            </span>
            <NumberField
              value={spec.style.padY}
              min={0}
              max={64}
              step={2}
              onChange={(padY) => setStyle({ padY })}
            />
          </div>
        </div>
      </Section>

      <Section title={t("detailPage.table.detach")}>
        <button
          type="button"
          onClick={() => detachTable(el)}
          className="flex w-full items-center justify-center gap-1.5 rounded-dpe-md border border-dpe-ink-200 py-1.5 text-xs text-dpe-ink-600 hover:bg-dpe-ink-50"
        >
          <Unlink className="h-3.5 w-3.5" />
          {t("detailPage.table.detachAction")}
        </button>
        <p className="mt-1.5 text-[11px] text-dpe-ink-400">
          {t("detailPage.table.detachHint")}
        </p>
      </Section>
    </>
  );
});
