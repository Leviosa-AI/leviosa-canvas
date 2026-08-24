"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  BarChart3,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Sparkles,
  Trash2,
  Ungroup,
  Type as TypeIcon,
  Image as ImageIcon,
  Film,
  Eraser,
  Square,
  Table as TableIcon,
  Shapes,
  Layers,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
} from "lucide-react";

import { ColorInput } from "../cardnews/color-input";
import { FillControl } from "./fill-control";
import { ChartInspector } from "./chart-inspector";
import { TableInspector } from "./table-inspector";
import {
  readChartSpec,
  type ElementLike as ChartElementLike,
  type StoreLike as ChartStoreLike,
} from "../../lib/detail-page/chart/sync";
import {
  harvestTableGroup,
  readTableSpec,
  type ElementLike as TableElementLike,
} from "../../lib/detail-page/table/sync";
import {
  NumberField,
  Section,
  ToggleButton,
} from "./inspector-controls";
import {
  MAX_SECTION_HEIGHT,
  MIN_SECTION_HEIGHT,
  applySectionHeight,
  sectionContentBottom,
} from "../../lib/detail-page/section-height";
import {
  effectiveColor,
  extractSvgColors,
} from "../../lib/detail-page/svg-colors";
import { readColorReplace } from "@leviosa-ai/canvas/render/svg-source";
import { selectedElementsDeep } from "./detail-page-selection";
import { useEditorAi } from "./editor-ai-context";
import { PromptEditPanel } from "./prompt-edit-panel";
import { SvgPromptEditPanel } from "./svg-prompt-edit-panel";
import { GroupPromptEditPanel } from "./group-prompt-edit-panel";
import {
  useDetailPageEditUsage,
  type EditUsageState,
} from "./edit-quota-ui";
import {
  decodeSvgDataUri,
  encodeSvgDataUri,
} from "../../lib/detail-page-canvas/export/svg";
import {
  AiGeneratePanel,
  type GenerateImageFn,
  type GenerateGifFn,
  type GenerateTextGifFn,
  type GenerateImageGifFn,
  type GenerateDataGifFn,
  type RemoveBackgroundFn,
} from "./ai-generate-panel";
import { toHexColor } from "../../lib/detail-page/css-color";
import { editorAssetBase } from "../../lib/detail-page/runtime-config";
import { detailPageEditorProfile } from "../../lib/detail-page/editor-profile";
import { setZ as setElementZ, zOrderOf } from "../../lib/detail-page/z-order";
import {
  canDistribute,
  distributeCoords,
  toItems,
  type DistributeElement,
} from "../../lib/detail-page/distribute";
import {
  parseCountUpText,
  parseFilledRows,
  textAnchorOf,
} from "../../lib/detail-page/data-gif-payload";
import { insertPersonalImage } from "../../lib/detail-page/insert-image";
import {
  replaceWithGif,
  unionBox,
  type Box,
  type ElementLike as ReplaceElementLike,
} from "../../lib/detail-page/replace-with-gif";
import {
  createCanvasMeasure,
  estimateMeasure,
  gifBleed,
  layoutTextLines,
  toFontWeight,
  type TextElementLike,
} from "../../lib/detail-page/text-gif-layout";
import {
  shapeSourceImage,
  type ShapeElementLike,
} from "../../lib/detail-page/shape-to-image";
import { useDetailPageHost } from "./detail-page-host-context";
import type {
  DetailPageHost,
  DetailPageGroupEditItem,
  DetailPageGroupEditResultItem,
} from "./detail-page-host-context";
import type { ImageTier } from "../../lib/detail-page/image-credit";
import { isGifSrc } from "../../lib/detail-page-canvas/export/gif-plan";
import { DetailPageFontPicker } from "./detail-page-font-picker";
import {
  normalizeFontWeight,
  type FontCatalogStore,
} from "../../lib/detail-page-canvas/font-catalog";
import {
  closestEditorFontWeight,
  getEditorFont,
  loadEditorFont,
} from "../../lib/detail-page-canvas/editor-fonts";
import { resolveGifWebFonts } from "../../lib/detail-page-canvas/gif-web-fonts";
import {
  GifEffectPicker,
  type GifEffectOption,
} from "./gif-effect-picker";

/**
 * Figma-style properties inspector for the detail-page Canvas editor.
 *
 * Replaces the stock editor's top ``<Toolbar>``: instead of a horizontal bar above the
 * canvas, the selected element's formatting lives in the right column and reads
 * straight off ``store.selectedElements`` (mobx — so this observer re-renders as
 * the selection or its props change). Mirrors the cardnews layer-editor layout
 * (``text-layer-editor.tsx``) but targets the stock editor's element model.
 */

type ParentLike = {
  /** "group" for a group parent; a page has no type. */
  type?: string;
  children?: ElementLike[];
  setElementZIndex?: (id: string, index: number) => void;
};
type ElementLike = {
  id: string;
  type: string;
  set: (props: Record<string, unknown>) => void;
  /** mobx view: 부모(그룹 또는 페이지) 내에서의 인덱스. 0 = 맨 뒤. */
  zIndex?: number;
  /** mobx view: 직접 부모(그룹 또는 페이지). setElementZIndex로 재정렬. */
  parent?: ParentLike;
  [key: string]: unknown;
};
type PageLike = {
  id: string;
  background?: string;
  width?: number;
  height?: number;
  computedWidth?: number;
  computedHeight?: number;
  set?: (props: Record<string, unknown>) => void;
  children?: ElementLike[];
};
type StoreLike = {
  selectedElements?: ElementLike[];
  selectedElementsIds?: string[];
  getElementById?: (id: string) => ElementLike | undefined;
  activePage?: PageLike;
  pages: PageLike[];
  fonts?: FontCatalogStore["fonts"];
  addFont?: FontCatalogStore["addFont"];
  deleteElements?: (ids: string[]) => void;
  ungroupElements?: (ids: string[]) => void;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function setAll(els: ElementLike[], props: Record<string, unknown>) {
  for (const el of els) el.set(props);
}

/**
 * Turn the marker highlight on (a colour) or off (``null``) on each element.
 * Stored on ``custom.highlightColor`` so the per-line band renderers own it, and
 * the native Canvas ``backgroundEnabled`` box is cleared so the two never double
 * up (legacy solid-background highlights migrate to the band on first edit).
 */
function setHighlight(els: ElementLike[], color: string | null) {
  for (const el of els) {
    const custom = { ...((el.custom ?? {}) as Record<string, unknown>) };
    if (color) custom.highlightColor = color;
    else delete custom.highlightColor;
    el.set({ custom, backgroundEnabled: false });
  }
}

function documentFonts(store: StoreLike, current?: string): string[] {
  const set = new Set<string>();
  if (current) set.add(current);
  for (const page of store.pages) {
    for (const child of page.children ?? []) {
      if (child.type === "text" && typeof child.fontFamily === "string") {
        set.add(child.fontFamily);
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" ? v : fallback;

/** GIF로 삽입된 이미지 요소인지(우측 인스펙터를 GIF 전용으로 바꾼다). */
function isGifElement(el: ElementLike): boolean {
  if (el.custom && (el.custom as { detailPageGif?: unknown }).detailPageGif) return true;
  return (el.type === "image" || el.type === "svg") && isGifSrc(str(el.src));
}

// 편집기 선택 이미지 src를 GIF 참조로 쓸 수 있게 정규화한다. 백엔드는 data:/http(s)를
// 받으므로: data URI는 그대로, 그 외(상대경로·blob·동일출처 프록시)는 fetch해서 data URI로
// 변환한다(원본 바이트라 alpha 보존). 교차출처 http(s)라 fetch가 CORS로 막히면 원본 URL을
// 그대로 넘겨 백엔드가 서버측에서 내려받게 한다. 못 구하면 null.
async function resolveReferenceSrc(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:")) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    // 교차출처 등으로 클라 fetch 실패 → 백엔드가 직접 받을 수 있는 http(s)면 원본 URL.
    return /^https?:\/\//.test(src) ? src : null;
  }
}

// 그룹(중첩 포함) 안의 편집 가능한 요소(텍스트 + SVG 도형)를 문서 순서대로 모은다.
// 이미지·마크업 없는 figure는 건너뛴다 — 그룹을 통째로 골라도 안의 텍스트·도형을 한
// 번에 프롬프트로 수정하기 위한 것.
function collectEditableDescendants(root: ElementLike): ElementLike[] {
  const out: ElementLike[] = [];
  const walk = (node: ElementLike) => {
    for (const child of (node.children as ElementLike[] | undefined) ?? []) {
      if (child.type === "text" || child.type === "svg") out.push(child);
      else if (child.type === "group") walk(child);
    }
  };
  walk(root);
  return out;
}

// 요소가 속한 페이지(섹션)를 찾는다 — 정렬 기준이 되는 폭/높이를 얻기 위해.
function pageOf(store: StoreLike, el: ElementLike): PageLike | undefined {
  const hit = (children?: ElementLike[]): boolean =>
    (children ?? []).some(
      (child) => child.id === el.id || hit(child.children as ElementLike[]),
    );
  return store.pages.find((p) => hit(p.children)) ?? store.activePage ?? store.pages[0];
}

type AlignAxis = "x" | "y";
type AlignWhere = "start" | "center" | "end";
/** The box an element aligns inside, in the SAME coordinate space as its x/y. */
export type AlignFrame = { start: number; size: number };

/**
 * The frame a nested element aligns within: its GROUP, not the page.
 *
 * A group child's x/y live in the group's local space, so aligning it against the
 * page would fling it out of its group. The group's own x/y/width/height are not
 * usable either — the decomposer pins a group to the origin and leaves the
 * children carrying the real coordinates — so derive the frame from the sibling
 * bounding box, which is what the group visually *is*.
 */
export function groupFrame(
  siblings: ReadonlyArray<Record<string, unknown>>,
  axis: AlignAxis,
): AlignFrame | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const sib of siblings) {
    const start = num(axis === "x" ? sib.x : sib.y);
    const size = num(axis === "x" ? sib.width : sib.height);
    lo = Math.min(lo, start);
    hi = Math.max(hi, start + size);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  return { start: lo, size: hi - lo };
}

/** Where a box of `size` lands when aligned inside `frame`. */
export function alignedCoord(
  frame: AlignFrame,
  size: number,
  where: AlignWhere,
): number {
  if (where === "start") return frame.start;
  if (where === "end") return frame.start + frame.size - size;
  return frame.start + (frame.size - size) / 2;
}

// 정렬 기준 상자: 그룹 안 요소는 그 **그룹**, 최상위 요소는 자신이 속한 섹션(페이지).
function frameOf(
  store: StoreLike,
  el: ElementLike,
  axis: AlignAxis,
): AlignFrame | null {
  const parent = el.parent;
  if (parent?.type === "group" && parent.children?.length) {
    return groupFrame(parent.children, axis);
  }
  const page = pageOf(store, el);
  if (!page) return null;
  const size = num(
    axis === "x"
      ? (page.computedWidth ?? page.width)
      : (page.computedHeight ?? page.height),
  );
  return { start: 0, size };
}

// 각 선택 요소를 자신의 정렬 기준 상자(그룹 > 섹션) 안에서 정렬한다.
function alignInFrame(
  store: StoreLike,
  els: ElementLike[],
  axis: AlignAxis,
  where: AlignWhere,
) {
  for (const el of els) {
    const frame = frameOf(store, el, axis);
    if (!frame) continue;
    const size = num(axis === "x" ? el.width : el.height);
    const coord = Math.round(alignedCoord(frame, size, where));
    el.set(axis === "x" ? { x: coord } : { y: coord });
  }
}

// 선택 요소가 이미 어느 정렬 상태인지 — 툴바가 현재 상태(눌린/회색 버튼)를 보여줄 수
// 있도록. 모든 선택 요소가 자기 기준 상자 안에서 같은 정렬일 때만 그 값을, 섞였거나
// 어느 쪽도 아니거나 요소가 상자를 꽉 채워(start=center=end 구분 불가) 애매하면 null.
function currentAlign(
  store: StoreLike,
  els: ElementLike[],
  axis: AlignAxis,
): AlignWhere | null {
  if (els.length === 0) return null;
  let agreed: AlignWhere | null = null;
  for (const el of els) {
    const frame = frameOf(store, el, axis);
    if (!frame) return null;
    const size = num(axis === "x" ? el.width : el.height);
    if (frame.size - size < 1) return null; // 상자를 꽉 채움: 정렬 구분 무의미
    const coord = num(axis === "x" ? el.x : el.y);
    let where: AlignWhere | null = null;
    for (const w of ["start", "center", "end"] as const) {
      if (Math.abs(alignedCoord(frame, size, w) - coord) <= 1) {
        where = w;
        break;
      }
    }
    if (!where) return null;
    if (agreed === null) agreed = where;
    else if (agreed !== where) return null;
  }
  return agreed;
}

// 선택 요소끼리 간격을 고르게. 양 끝은 그대로 두고 사이 여백만 나눈다(distribute.ts).
function spreadEvenly(els: ElementLike[], axis: "x" | "y") {
  const items = toItems(els as DistributeElement[], axis);
  const coords = items && distributeCoords(items);
  if (!coords) return;
  for (const el of els) {
    const coord = coords.get(el.id);
    if (coord == null) continue;
    el.set(axis === "x" ? { x: coord } : { y: coord });
  }
}

function AlignButton({
  title,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 flex-1 items-center justify-center rounded-dpe-md border transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? "border-dpe-ink-300 bg-dpe-ink-100 text-dpe-ink-900"
          : "border-dpe-ink-200 bg-dpe-surface text-dpe-ink-600 hover:bg-dpe-ink-50 hover:text-dpe-ink-900"
      }`}
    >
      {children}
    </button>
  );
}

// 정렬. 기준 상자는 요소마다 다르다: 그룹 안 요소는 그 그룹, 최상위 요소는 섹션.
// 제목도 기준을 그대로 말해줘서, 그룹 자식을 섹션 폭에 맞춰 날려버리는 오해를 막는다.
const AlignSection = observer(function AlignSection({
  store,
  els,
}: {
  store: StoreLike;
  els: ElementLike[];
}) {
  const { t } = useTranslation("branding");
  const inGroup =
    els.length > 0 && els.every((el) => el.parent?.type === "group");
  // 현재 정렬 상태(관찰형이라 요소 이동 시 자동 갱신). 해당 버튼을 회색으로 표시한다.
  const xAlign = currentAlign(store, els, "x");
  const yAlign = currentAlign(store, els, "y");
  const spreadable = canDistribute(els);
  return (
    <Section
      title={t(
        inGroup
          ? "detailPage.properties.alignInGroup"
          : "detailPage.properties.alignInSection",
      )}
    >
      <div className="flex items-center gap-1.5">
        <AlignButton
          title={t("detailPage.properties.alignLeft")}
          active={xAlign === "start"}
          onClick={() => alignInFrame(store, els, "x", "start")}
        >
          <AlignStartVertical size={15} />
        </AlignButton>
        <AlignButton
          title={t("detailPage.properties.alignHCenter")}
          active={xAlign === "center"}
          onClick={() => alignInFrame(store, els, "x", "center")}
        >
          <AlignCenterVertical size={15} />
        </AlignButton>
        <AlignButton
          title={t("detailPage.properties.alignRight")}
          active={xAlign === "end"}
          onClick={() => alignInFrame(store, els, "x", "end")}
        >
          <AlignEndVertical size={15} />
        </AlignButton>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <AlignButton
          title={t("detailPage.properties.alignTop")}
          active={yAlign === "start"}
          onClick={() => alignInFrame(store, els, "y", "start")}
        >
          <AlignStartHorizontal size={15} />
        </AlignButton>
        <AlignButton
          title={t("detailPage.properties.alignVCenter")}
          active={yAlign === "center"}
          onClick={() => alignInFrame(store, els, "y", "center")}
        >
          <AlignCenterHorizontal size={15} />
        </AlignButton>
        <AlignButton
          title={t("detailPage.properties.alignBottom")}
          active={yAlign === "end"}
          onClick={() => alignInFrame(store, els, "y", "end")}
        >
          <AlignEndHorizontal size={15} />
        </AlignButton>
      </div>
      {/* 간격 고르게. 셋 이상 · 같은 부모일 때만 — 그룹 자식과 최상위가 섞이면
          좌표계가 달라 뒤섞인 결과가 나온다. */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <AlignButton
          title={t("detailPage.properties.spreadH")}
          disabled={!spreadable}
          onClick={() => spreadEvenly(els, "x")}
        >
          <AlignHorizontalDistributeCenter size={15} />
        </AlignButton>
        <AlignButton
          title={t("detailPage.properties.spreadV")}
          disabled={!spreadable}
          onClick={() => spreadEvenly(els, "y")}
        >
          <AlignVerticalDistributeCenter size={15} />
        </AlignButton>
      </div>
    </Section>
  );
});

// 정렬 순서(z-order). 규칙은 z-order.ts 한 벌 — 캔버스 우클릭 메뉴도 같은 걸 쓴다.
const OrderSection = observer(function OrderSection({ els }: { els: ElementLike[] }) {
  const { t } = useTranslation("branding");
  const el = els[0];
  const order = zOrderOf(el);
  if (!order) return null;
  const { z, count, atFront, atBack } = order;
  const setZ = (i: number) => setElementZ(el, i);

  const Btn = ({
    title,
    disabled,
    onClick,
    children,
  }: {
    title: string;
    disabled: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 flex-1 items-center justify-center rounded-dpe-md border border-dpe-ink-200 bg-dpe-surface text-dpe-ink-600 transition-colors hover:bg-dpe-ink-50 hover:text-dpe-ink-900 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );

  return (
    <Section title={t("detailPage.properties.order")}>
      <div className="flex items-center gap-1.5">
        <Btn title={t("detailPage.properties.bringToFront")} disabled={atFront} onClick={() => setZ(count - 1)}>
          <ChevronsUp size={15} />
        </Btn>
        <Btn title={t("detailPage.properties.bringForward")} disabled={atFront} onClick={() => setZ(z + 1)}>
          <ChevronUp size={15} />
        </Btn>
        <Btn title={t("detailPage.properties.sendBackward")} disabled={atBack} onClick={() => setZ(z - 1)}>
          <ChevronDown size={15} />
        </Btn>
        <Btn title={t("detailPage.properties.sendToBack")} disabled={atBack} onClick={() => setZ(0)}>
          <ChevronsDown size={15} />
        </Btn>
        <span className="ml-1 shrink-0 rounded-dpe-md bg-dpe-ink-100 px-1.5 py-0.5 text-[11px] font-dpe-medium tabular-nums text-dpe-ink-500">
          {z + 1}/{count}
        </span>
      </div>
    </Section>
  );
});

// ── Inspectors ──────────────────────────────────────────────────────────────

// observer 필수: 이 컴포넌트가 el.opacity를 읽는 유일한 곳이다. 감싸지 않으면 mobx가
// 그 읽기를 추적하지 못해 opacity가 바뀌어도 리렌더가 안 되고, controlled input의 value가
// 옛 값에 고정된다 → 슬라이더가 아예 안 움직이는(= 클릭이 안 먹는) 것처럼 보인다.
const OpacityRow = observer(function OpacityRow({ els }: { els: ElementLike[] }) {
  const { t } = useTranslation("branding");
  const opacity = num(els[0]?.opacity, 1);
  return (
    <Section title={t("detailPage.properties.opacity")}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(e) => setAll(els, { opacity: Number(e.target.value) / 100 })}
          className="min-w-0 flex-1 accent-dpe-ink-900"
        />
        <span className="w-10 text-right text-sm tabular-nums text-dpe-ink-700">
          {Math.round(opacity * 100)}%
        </span>
      </div>
    </Section>
  );
});

// 크기·위치. 단일 선택일 때만. 폭(W)을 직접 보고 고칠 수 있어야 "텍스트 박스가 왜
// 넘치지" 같은 문제를 사용자가 바로 진단·수정한다. 관찰형이라 드래그·정렬로 값이
// 바뀌면 자동 갱신된다. 기존 NumberField(blur/Enter 커밋, 화살표 스텝)를 재사용.
const SizeSection = observer(function SizeSection({ els }: { els: ElementLike[] }) {
  const { t } = useTranslation("branding");
  const el = els[0];
  if (!el) return null;
  const field = (label: string, key: "width" | "height" | "x" | "y") => (
    <NumberField
      label={label}
      value={num(el[key])}
      min={key === "width" || key === "height" ? 1 : undefined}
      onChange={(v) => el.set({ [key]: Math.round(v) })}
    />
  );
  return (
    <Section title={t("detailPage.properties.size")}>
      <div className="grid grid-cols-2 gap-1.5">
        {field("W", "width")}
        {field("H", "height")}
        {field("X", "x")}
        {field("Y", "y")}
      </div>
    </Section>
  );
});
SizeSection.displayName = "SizeSection";

function DeleteRow({ store, els }: { store: StoreLike; els: ElementLike[] }) {
  const { t } = useTranslation("branding");
  // A single selected group can be split back into its elements. Mirrors the
  // built-in Cmd+G ungroup so the action is discoverable without the shortcut.
  const canUngroup = els.length === 1 && els[0].type === "group";
  return (
    <Section title={t("detailPage.properties.actions")}>
      <div className="flex flex-col gap-2">
        {canUngroup && (
          <button
            type="button"
            onClick={() => store.ungroupElements?.([els[0].id])}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-dpe-md border border-dpe-ink-200 bg-dpe-surface text-sm font-dpe-semibold text-dpe-ink-700 hover:bg-dpe-ink-50"
          >
            <Ungroup aria-hidden="true" size={15} />
            {t("detailPage.properties.ungroup")}
          </button>
        )}
        <button
          type="button"
          onClick={() => store.deleteElements?.(els.map((e) => e.id))}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-dpe-md border border-dpe-danger-200 bg-dpe-danger-50 text-sm font-dpe-semibold text-dpe-danger-600 hover:bg-dpe-danger-100"
        >
          <Trash2 aria-hidden="true" size={15} />
          {t("detailPage.properties.delete")}
        </button>
      </div>
    </Section>
  );
}

const TextInspector = observer(function TextInspector({
  store,
  els,
  onGenerateTextGif,
  textGifCreditCost,
  onGenerateDataGif,
  dataGifCreditCost,
}: {
  store: StoreLike;
  els: ElementLike[];
  onGenerateTextGif?: GenerateTextGifFn;
  textGifCreditCost?: number;
  /** 숫자가 든 텍스트를 카운트업 GIF로. 미지정이면 섹션 숨김. */
  onGenerateDataGif?: GenerateDataGifFn;
  dataGifCreditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const { toast } = useDetailPageHost();
  const single = els.length === 1 ? els[0] : null;
  const ref = els[0];
  const fontFamily = str(ref.fontFamily, "Roboto");
  const currentFontWeight = normalizeFontWeight(ref.fontWeight);
  const fontSize = num(ref.fontSize, 24);
  const fill = str(ref.fill, "#000000");
  const align = str(ref.align, "left");
  const isItalic = str(ref.fontStyle, "normal") === "italic";
  const deco = str(ref.textDecoration, "");
  const lineHeight = num(ref.lineHeight, 1.2);
  const letterSpacing = num(ref.letterSpacing, 0);
  // 텍스트 하이라이트: 줄바꿈돼도 각 줄 글자 폭에 맞는 "마커 밴드"로 그린다
  // (custom.highlightColor 단일 소스). Canvas 네이티브 background* 박스는 줄높이만큼
  // 부풀어 두 줄을 통짜 블록으로 붙여버리므로 쓰지 않는다. 렌더는 편집기
  // (BackgroundAwareText)·내보내기(konva-json-preview) 두 경로에서 밴드로 그린다.
  const refCustom = (ref.custom ?? {}) as Record<string, unknown>;
  // 예전 방식(backgroundEnabled solid)도 켜짐으로 인식해 색을 노출하되, 조작 시
  // custom.highlightColor로 이전(migrate)하고 네이티브는 끈다.
  const legacyBgOn =
    ref.backgroundEnabled === true &&
    !refCustom.backgroundGradient &&
    typeof ref.backgroundColor === "string" &&
    ref.backgroundColor !== "transparent";
  const highlightOn =
    typeof refCustom.highlightColor === "string" || legacyBgOn;
  const highlightColor =
    (typeof refCustom.highlightColor === "string"
      ? refCustom.highlightColor
      : str(ref.backgroundColor)) || "#FFEB3B";
  const fonts = documentFonts(store, fontFamily);
  const catalogFont = getEditorFont(fontFamily);
  const fontWeights = catalogFont ? catalogFont.weights : [400, 700];
  const displayedWeight = catalogFont
    ? closestEditorFontWeight(catalogFont, currentFontWeight)
    : currentFontWeight >= 600
      ? 700
      : 400;
  const [fontBusy, setFontBusy] = useState(false);

  const applyFontFamily = async (family: string) => {
    const nextFont = getEditorFont(family);
    if (!nextFont) {
      setAll(els, { fontFamily: family });
      return;
    }
    const nextWeight = closestEditorFontWeight(nextFont, currentFontWeight);
    await loadEditorFont({
      family,
      weight: nextWeight,
      sample: str(ref.text),
      store,
    });
    setAll(els, { fontFamily: family, fontWeight: String(nextWeight) });
  };

  const applyFontWeight = async (weight: number) => {
    setFontBusy(true);
    try {
      if (catalogFont) {
        await loadEditorFont({
          family: catalogFont.family,
          weight,
          sample: str(ref.text),
          store,
        });
      }
      setAll(els, { fontWeight: String(weight) });
    } catch (fontError) {
      console.error(
        `Failed to load detail-page font weight "${fontFamily} ${weight}"`,
        fontError,
      );
      toast.error(t("detailPage.properties.fontLoadFailed"));
    } finally {
      setFontBusy(false);
    }
  };

  return (
    <>
      {single ? (
        <Section title={t("detailPage.properties.content")}>
          <textarea
            value={str(single.text)}
            onChange={(e) => single.set({ text: e.target.value })}
            rows={3}
            className="w-full resize-y rounded-dpe-md border border-dpe-ink-200 bg-dpe-surface px-2 py-2 text-sm text-dpe-ink-900 outline-none focus:border-dpe-ink-400"
          />
          {/* 프롬프트로 편집은 캔버스 위 띠로 옮겼다(`ElementAiEditPanel`) — 고른 자리
              바로 위에서 열린다. 같은 일을 두 군데 두면 사용량 표시가 갈라진다. */}
        </Section>
      ) : null}

      <Section title={t("detailPage.properties.font")}>
        <div className="grid grid-cols-[1fr_84px] gap-2">
          <DetailPageFontPicker
            value={fontFamily}
            documentFamilies={fonts}
            onSelect={applyFontFamily}
          />
          <NumberField
            value={fontSize}
            min={1}
            step={1}
            onChange={(v) => setAll(els, { fontSize: v })}
          />
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <select
            aria-label={t("detailPage.properties.fontWeight")}
            value={displayedWeight}
            disabled={fontBusy}
            onChange={(event) => void applyFontWeight(Number(event.target.value))}
            className="h-8 min-w-0 flex-1 rounded-dpe-md border border-dpe-ink-200 bg-dpe-surface px-2 text-xs text-dpe-ink-700 outline-none focus:border-dpe-ink-400 disabled:opacity-50"
          >
            {fontWeights.map((weight) => (
              <option key={weight} value={weight}>
                {weight} {t(`detailPage.properties.weight${weight}`)}
              </option>
            ))}
          </select>
          <ToggleButton
            active={isItalic}
            title={t("detailPage.properties.italic")}
            onClick={() => setAll(els, { fontStyle: isItalic ? "normal" : "italic" })}
          >
            <Italic size={15} />
          </ToggleButton>
          <ToggleButton
            active={deco === "underline"}
            title={t("detailPage.properties.underline")}
            onClick={() =>
              setAll(els, { textDecoration: deco === "underline" ? "" : "underline" })
            }
          >
            <Underline size={15} />
          </ToggleButton>
          <ToggleButton
            active={deco === "line-through"}
            title={t("detailPage.properties.strikethrough")}
            onClick={() =>
              setAll(els, {
                textDecoration: deco === "line-through" ? "" : "line-through",
              })
            }
          >
            <Strikethrough size={15} />
          </ToggleButton>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {(
            [
              { value: "left", icon: <AlignLeft size={15} /> },
              { value: "center", icon: <AlignCenter size={15} /> },
              { value: "right", icon: <AlignRight size={15} /> },
              { value: "justify", icon: <AlignJustify size={15} /> },
            ] as const
          ).map((opt) => (
            <ToggleButton
              key={opt.value}
              active={align === opt.value}
              title={opt.value}
              onClick={() => setAll(els, { align: opt.value })}
            >
              {opt.icon}
            </ToggleButton>
          ))}
        </div>
      </Section>

      <Section title={t("detailPage.properties.color")}>
        <FillControl value={fill} onChange={(c) => setAll(els, { fill: c })} />
      </Section>

      <Section title={t("detailPage.properties.highlight")}>
        <div className="flex items-center gap-2">
          <ToggleButton
            active={highlightOn}
            title={t("detailPage.properties.highlight")}
            onClick={() =>
              setHighlight(els, highlightOn ? null : highlightColor)
            }
          >
            <Highlighter size={15} />
          </ToggleButton>
          {highlightOn ? (
            <ColorInput
              value={highlightColor}
              onChange={(c) => setHighlight(els, c)}
            />
          ) : (
            <span className="text-[11px] text-dpe-ink-400">
              {t("detailPage.properties.highlightHint")}
            </span>
          )}
        </div>
      </Section>

      <Section title={t("detailPage.properties.spacing")}>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <span className="w-10 text-xs text-dpe-ink-500">{t("detailPage.properties.lineHeight")}</span>
            <NumberField
              value={lineHeight}
              step={0.1}
              min={0.1}
              onChange={(v) => setAll(els, { lineHeight: v })}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-10 text-xs text-dpe-ink-500">{t("detailPage.properties.letterSpacing")}</span>
            <NumberField
              value={letterSpacing}
              step={0.5}
              onChange={(v) => setAll(els, { letterSpacing: v })}
            />
          </label>
        </div>
      </Section>

      {single && onGenerateTextGif ? (
        <TextGifSection
          store={store}
          els={[single]}
          onGenerate={onGenerateTextGif}
          creditCost={textGifCreditCost}
        />
      ) : null}

      {single && onGenerateDataGif ? (
        <CountUpGifSection
          store={store}
          els={[single]}
          onGenerate={onGenerateDataGif}
          creditCost={dataGifCreditCost}
        />
      ) : null}

      <OpacityRow els={els} />
      <DeleteRow store={store} els={els} />
    </>
  );
});

// 우측 패널 '텍스트를 GIF로': 선택 텍스트를 애니메이션 GIF로 만들어 '내 이미지'에 저장
// 하고 편집기에 삽입한다. 이펙트 목록은 백엔드 카탈로그와 동일한 정적 상수(작고 안정적).
// 이펙트 이름·설명은 화면에 그대로 노출되므로 언어를 따라야 한다. 여기서는 id와 순서만
// 들고, 문구는 `detailPage.gifEffects.*` 에서 꺼낸다.
// previewSrc 는 소싱 저장소의 scripts/detail_page_gif_effect_previews.py 가 구워 둔 자산.
const TEXT_GIF_EFFECT_IDS = [
  "shimmer",
  "blur_in",
  "wave",
  "typewriter",
  "bounce",
  "glow_pulse",
  "wobble",
  "fade_up",
] as const;

/** 번역기 타입 — i18next `t` 를 그대로 받는다. */
type Translate = (key: string) => string;

function textGifEffects(t: Translate): GifEffectOption[] {
  return TEXT_GIF_EFFECT_IDS.map((id) => ({
    id,
    label: t(`detailPage.gifEffects.text.${id}.label`),
    hint: t(`detailPage.gifEffects.text.${id}.hint`),
    previewSrc: `${editorAssetBase("gifEffectPreviews")}/text-${id}.gif`,
  }));
}

/**
 * Canvas 페이지 배경을 GIF 합성 배경색으로 쓴다(엣지 정합).
 *
 * 배경이 그라데이션 문자열이면 접을 수 없으니 흰색으로 떨어진다.
 */
function pageBackgroundColor(store: StoreLike): string {
  const bg = (store as { activePage?: { background?: unknown } }).activePage
    ?.background;
  return toHexColor(bg, "#ffffff");
}

// 우측 인스펙터 '이미지를 GIF로'. 백엔드 카탈로그(/images/image-gif-effects)와 같은
// 정적 목록 — 작고 안정적이라 부팅 시 네트워크를 태우지 않는다. group이 갈리는 이유는
// object 이펙트가 이미지 안의 물체를 찾아(배경제거) 거는 연출이라 성격이 다르기 때문이다.
const IMAGE_GIF_GROUP_KEY = {
  whole: "detailPage.gifEffects.group.whole",
  object: "detailPage.gifEffects.group.object",
} as const;

const IMAGE_GIF_EFFECT_SOURCE: {
  id: string;
  group: keyof typeof IMAGE_GIF_GROUP_KEY;
}[] = [
  { id: "ken_burns", group: "whole" },
  { id: "pulse_zoom", group: "whole" },
  { id: "blur_in", group: "whole" },
  { id: "fade_slide_left", group: "whole" },
  { id: "fade_slide_right", group: "whole" },
  { id: "rise_fall", group: "whole" },
  { id: "shine_sweep", group: "whole" },
  { id: "wipe_reveal", group: "whole" },
  { id: "tilt_parallax", group: "whole" },
  { id: "holo_foil", group: "object" },
  { id: "holo_foil_silver", group: "object" },
  { id: "holo_foil_gold", group: "object" },
];

/**
 * 카탈로그가 실제로 읽는 번역 키 전부(그룹 · 텍스트 · 이미지).
 *
 * 이펙트를 추가하면서 번역을 빠뜨리면 화면에 키가 그대로 노출되므로, 테스트가 ko/en
 * 양쪽 존재를 이 목록으로 확인한다.
 */
export const GIF_EFFECT_LABEL_KEYS: string[] = [
  ...Object.values(IMAGE_GIF_GROUP_KEY),
  ...TEXT_GIF_EFFECT_IDS.flatMap((id) => [
    `detailPage.gifEffects.text.${id}.label`,
    `detailPage.gifEffects.text.${id}.hint`,
  ]),
  ...IMAGE_GIF_EFFECT_SOURCE.flatMap((effect) => [
    `detailPage.gifEffects.image.${effect.id}.label`,
    `detailPage.gifEffects.image.${effect.id}.hint`,
  ]),
];

/**
 * 이미지/도형용 이펙트 목록.
 *
 * 도형(``shape``)에서는 물체 검출(배경제거)이 붙는 홀로그램 계열을 뺀다 — 도형은 이미
 * 배경이 없어서 검출에 크레딧과 시간만 쓰고 얻는 게 없다. 묶음이 하나뿐이라 그룹
 * 라벨도 떼어 낸다.
 */
function imageGifEffects(t: Translate, shape: boolean): GifEffectOption[] {
  return IMAGE_GIF_EFFECT_SOURCE.filter(
    (effect) => !shape || effect.group === "whole",
  ).map((effect) => ({
    id: effect.id,
    label: t(`detailPage.gifEffects.image.${effect.id}.label`),
    hint: t(`detailPage.gifEffects.image.${effect.id}.hint`),
    group: shape ? undefined : t(IMAGE_GIF_GROUP_KEY[effect.group]),
    previewSrc: `${editorAssetBase("gifEffectPreviews")}/image-${effect.id}.gif`,
  }));
}

// 백엔드 stage → 버튼에 띄울 문구 키. 홀로그램은 물체 검출 왕복이 붙어 체감이 길어서,
// 단순 스피너 대신 지금 뭘 하는지 말해줘야 "멈췄나?" 소리가 안 나온다.
const IMAGE_GIF_STAGE_KEY: Record<string, string> = {
  preparing: "detailPage.properties.gifStagePreparing",
  detecting: "detailPage.properties.gifStageDetecting",
  rendering: "detailPage.properties.gifStageRendering",
  encoding: "detailPage.properties.gifStageEncoding",
  uploading: "detailPage.properties.gifStageUploading",
};

/**
 * 우측 인스펙터 '배경 지우기(누끼)'.
 *
 * GIF 계열과 달리 새 요소를 삽입하지 않고 **선택 요소의 src를 갈아 끼운다** — 누끼는
 * 새 소재를 만드는 일이 아니라 지금 놓인 사진을 고치는 일이라, 자리·크기·자르기가
 * 그대로 유지돼야 한다.
 */
export const BgRemoveSection = observer(function BgRemoveSection({
  el,
  onRemove,
  creditCost,
}: {
  el: ElementLike;
  onRemove: RemoveBackgroundFn;
  creditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const { api, brand } = useDetailPageHost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (busy) return;
    // 편집기 src는 상대경로·blob·동일출처 프록시일 수 있다. GIF 참조와 같은 방식으로
    // data URI로 바꾸고, 교차출처 http(s)만 원본 URL 그대로 백엔드가 받게 한다.
    const source = await resolveReferenceSrc(str(el.src));
    if (!source) {
      setError(t("detailPage.properties.gifSourceUnreadable"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = await onRemove({
        sourceImage: source,
        brandId: brand.getStoredActiveBrandId() ?? undefined,
      });
      if (url) {
        el.set({ src: url });
      } else {
        setError(
          t("detailPage.properties.bgRemoveFailed", {
            defaultValue: "배경을 지우지 못했어요.",
          }),
        );
      }
    } catch (err) {
      const short = api.asInsufficientCreditsError(err);
      setError(
        short
          ? short.message
          : err instanceof Error
            ? err.message
            : t("detailPage.properties.bgRemoveFailed", {
                defaultValue: "배경을 지우지 못했어요.",
              }),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, el, onRemove, t]);

  return (
    <Section
      title={t("detailPage.properties.bgRemove", {
        defaultValue: "배경 지우기",
      })}
    >
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-dpe-md bg-dpe-ink-900 px-3 py-1.5 text-sm font-dpe-medium text-dpe-on-accent transition hover:bg-dpe-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Eraser size={14} />
        {busy
          ? t("detailPage.properties.bgRemoveBusy", {
              defaultValue: "배경 지우는 중…",
            })
          : t("detailPage.properties.bgRemoveRun", {
              defaultValue: "배경 지우기",
            })}
        {!busy && creditCost ? ` · ${creditCost}` : ""}
      </button>
      {error ? (
        <p className="mt-1.5 text-[11px] text-dpe-danger-500">{error}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-dpe-ink-400">
          {t("detailPage.properties.bgRemoveHint", {
            defaultValue:
              "피사체만 남기고 배경을 투명하게 만들어요. 자리와 크기는 그대로예요.",
          })}
        </p>
      )}
    </Section>
  );
});

const ImageGifSection = observer(function ImageGifSection({
  store,
  el,
  onGenerate,
  creditCost,
  assetKind = "image",
  title,
  hint,
}: {
  store: StoreLike;
  el: ElementLike;
  onGenerate: GenerateImageGifFn;
  creditCost?: number;
  /** 도형이면 벡터를 투명 PNG로 구워 보내고, 결과는 브랜드 GIF의 도형 구획으로 간다. */
  assetKind?: "image" | "shape";
  title?: string;
  hint?: string;
}) {
  const { t } = useTranslation("branding");
  const { api, brand } = useDetailPageHost();
  const shape = assetKind === "shape";
  const effects = useMemo(() => imageGifEffects(t, shape), [t, shape]);
  const [effect, setEffect] = useState(shape ? "wipe_reveal" : "ken_burns");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<{ stage: string; progress: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selected = effects.find((fx) => fx.id === effect);

  const run = useCallback(async () => {
    if (busy) return;
    // 도형은 벡터라 픽셀이 없다 — 편집기와 같은 규칙(색 치환·그라데이션)으로 투명
    // PNG를 구워 보낸다. 사진은 편집기 src가 상대경로·blob·동일출처 프록시일 수 있어
    // GIF 참조와 같은 방식으로 data URI로 바꾸고, 교차출처 http(s)만 원본 URL 그대로
    // 백엔드가 받게 한다.
    const source = shape
      ? await shapeSourceImage(el as ShapeElementLike)
      : await resolveReferenceSrc(str(el.src));
    if (!source) {
      setError(
        t(
          shape
            ? "detailPage.properties.gifShapeUnreadable"
            : "detailPage.properties.gifSourceUnreadable",
        ),
      );
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setStage({ stage: "preparing", progress: 0 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { urls, maskFallback } = await onGenerate({
        sourceImage: source,
        effect,
        // 도형은 투명하게 굽는다 — 페이지 배경색을 주면 그 색이 배경으로 눌러 붙는다.
        background: shape ? "#00000000" : pageBackgroundColor(store),
        brandId: brand.getStoredActiveBrandId() ?? undefined,
        assetKind,
        onProgress: setStage,
      });
      const url = urls[0];
      if (url) {
        // 원본을 지우고 그 자리·그 크기로 갈아 끼운다. 사진이었다면 자르기(crop)까지
        // 물려받아야 프레이밍이 안 바뀐다 — GIF 프레임은 원본 사진 비율 그대로다.
        replaceWithGif(store, [el as ReplaceElementLike], url, {
          inheritCrop: true,
        });
        if (maskFallback) {
          setNotice(
            t("detailPage.properties.imageGifMaskFallback", {
              defaultValue:
                "물체를 특정하지 못해 이미지 전체에 적용했어요.",
            }),
          );
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return; // 사용자가 취소 → 조용히 끝낸다.
      const short = api.asInsufficientCreditsError(err);
      setError(
        short
          ? short.message
          : err instanceof Error
            ? err.message
            : t("detailPage.properties.gifFailed"),
      );
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStage(null);
    }
  }, [busy, el, effect, onGenerate, shape, assetKind, store, t]);

  const busyFallback = t("detailPage.properties.gifBusy");
  const busyLabel = stage
    ? stage.stage === "rendering" && stage.progress > 0
      ? `${t(IMAGE_GIF_STAGE_KEY.rendering)} ${stage.progress}%`
      : stage.stage in IMAGE_GIF_STAGE_KEY
        ? t(IMAGE_GIF_STAGE_KEY[stage.stage])
        : busyFallback
    : busyFallback;

  return (
    <Section
      title={
        title ??
        t("detailPage.properties.imageGif", {
          defaultValue: "이미지를 GIF로",
        })
      }
    >
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <GifEffectPicker
          value={effect}
          options={effects}
          onChange={setEffect}
          disabled={busy}
        />
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-dpe-md bg-dpe-ink-900 px-3 py-1.5 text-sm font-dpe-medium text-dpe-on-accent transition hover:bg-dpe-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Film size={14} />
          {busy
            ? busyLabel
            : t("detailPage.properties.imageGifMake", {
                defaultValue: "GIF 만들기",
              })}
          {!busy && creditCost ? ` · ${creditCost}` : ""}
        </button>
      </div>
      {busy ? (
        <button
          type="button"
          onClick={() => abortRef.current?.abort()}
          className="mt-1.5 text-[11px] text-dpe-ink-400 underline hover:text-dpe-ink-600"
        >
          {t("detailPage.properties.imageGifCancel", {
            defaultValue: "취소 (만들던 GIF는 '내 이미지'에 저장돼요)",
          })}
        </button>
      ) : error ? (
        <p className="mt-1.5 text-[11px] text-dpe-danger-500">{error}</p>
      ) : notice ? (
        <p className="mt-1.5 text-[11px] text-dpe-warn-600">{notice}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-dpe-ink-400">
          {selected?.hint ?? hint ?? ""}
        </p>
      )}
    </Section>
  );
});

/**
 * 도형을 GIF로 — 벡터를 투명 PNG로 구워 이미지 이펙트 파이프라인에 태운다.
 *
 * 예를 들어 가로 막대에 와이프를 걸면 왼쪽에서 오른쪽으로 차오르는, 수치가 늘어나는
 * 듯한 연출이 된다. 렌더는 이미지 GIF와 같은 잡을 쓰고, 결과만 브랜드 GIF의 도형
 * 구획으로 갈린다.
 */
const ShapeGifSection = observer(function ShapeGifSection(props: {
  store: StoreLike;
  el: ElementLike;
  onGenerate: GenerateImageGifFn;
  creditCost?: number;
}) {
  const { t } = useTranslation("branding");
  return (
    <ImageGifSection
      {...props}
      assetKind="shape"
      title={t("detailPage.properties.shapeGif", {
        defaultValue: "도형을 GIF로",
      })}
      hint={t("detailPage.properties.shapeGifHint", {
        defaultValue: "배경 없는 GIF로 만들어져 브랜드 GIF에 저장돼요.",
      })}
    />
  );
});

/** 편집기가 접어 보여주는 줄 그대로 재는 폭 측정기(브라우저 canvas). */
function measureForGif() {
  return createCanvasMeasure() ?? estimateMeasure;
}

/**
 * 텍스트 요소들 → GIF 요청의 줄 목록(위→아래), **원본 상자 좌표까지 실측**.
 *
 * 요소 하나 안의 줄바꿈은 물론 상자 폭에서 자동으로 접힌 줄까지 쪼갠다 — SVG ``<text>``는
 * 개행도 접기도 안 하기 때문에, 안 쪼개면 두 줄짜리 헤드라인이 한 줄로 늘어져 나온다.
 */
export function textGifLines(els: ElementLike[], box: Box) {
  return layoutTextLines(els as TextElementLike[], box, measureForGif()).map(
    (line) => ({
      ...line,
      // el.fill 은 `rgb(23, 21, 15)` 로도 온다. 백엔드는 SVG 속성에 그대로 박으므로 HEX만 받는다.
      color: toHexColor(line.color, "#26221e"),
    }),
  );
}

/** 서버 스키마의 줄 개수 상한. 넘으면 422가 나므로 미리 안내한다. */
const TEXT_GIF_MAX_LINES = 24;

const TextGifSection = observer(function TextGifSection({
  store,
  els,
  targets,
  onGenerate,
  creditCost,
}: {
  store: StoreLike;
  /** 단일 텍스트, 또는 텍스트만 든 그룹의 자식들(통째로 한 장의 GIF가 된다). */
  els: ElementLike[];
  /**
   * GIF가 대체할 요소들. 그룹이면 자식이 아니라 **그룹 자체**를 지워야 빈 껍데기가
   * 안 남는다. 생략하면 ``els``.
   */
  targets?: ElementLike[];
  onGenerate: GenerateTextGifFn;
  creditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const { api, brand } = useDetailPageHost();
  const effects = useMemo(() => textGifEffects(t), [t]);
  const [effect, setEffect] = useState("shimmer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replaced = targets ?? els;
  // 상자·줄 실측은 매 렌더 다시 하지 않는다(측정은 canvas를 타고, run 의존성도 흔든다).
  const box = useMemo(
    () => unionBox(replaced as ReplaceElementLike[]),
    [replaced],
  );
  const lines = useMemo(() => (box ? textGifLines(els, box) : []), [els, box]);
  const first = lines[0];

  const run = useCallback(async () => {
    if (!first || !box || busy) return;
    if (lines.length > TEXT_GIF_MAX_LINES) {
      setError(
        t("detailPage.properties.textGifTooManyLines", {
          defaultValue: "문구가 너무 길어요. 더 짧은 텍스트를 골라 주세요.",
        }),
      );
      return;
    }
    setBusy(true);
    setError(null);
    // 상자 밖으로 번지는 이펙트(글로우·물결)가 잘리지 않게 두는 여백. 서버와 편집기가
    // **같은 값**을 써야 글자가 제자리에 온다.
    const bleed = gifBleed(lines);
    try {
      // brandId 를 주면 서버가 브랜드 자산 버킷에 직접 쓴다. 예전처럼 결과 URL을
      // 다시 내려받아 재업로드하지 않는다 — 그 왕복이 S3 CORS를 두 번 타서, 한 번만
      // 막혀도 GIF는 만들어졌는데 브랜드 버킷엔 아무것도 안 남았다.
      const urls = await onGenerate({
        // 서버 스키마의 text 는 60자 상한이다(실제로 그려지는 건 lines 쪽).
        text: first.text.slice(0, 60),
        effect,
        color: first.color,
        background: pageBackgroundColor(store),
        fontSize: first.fontSize,
        fontWeight: first.fontWeight,
        fontFamily: first.fontFamily,
        lines,
        // 폰트 파일 주소까지 같이 보낸다 — 서버 컨테이너엔 우리 폰트가 없어서
        // 이름만 보내면 시스템 폴백(픽셀 폰트)으로 그려진다.
        fonts: resolveGifWebFonts(
          lines.map((line) => ({
            family: line.fontFamily,
            weight: line.fontWeight,
          })),
        ),
        // 원본 상자를 그대로 넘긴다 — 서버가 캔버스를 글자 수로 추정하면 결과 비율이
        // 달라져서, 되꽂을 때 글자가 커지고 줄이 밀린다.
        boxWidth: box.width,
        boxHeight: box.height,
        bleed,
        brandId: brand.getStoredActiveBrandId() ?? undefined,
      });
      const url = urls[0];
      if (url) {
        // 원본을 지우고 그 자리·그 크기로 갈아 끼운다(여백만큼만 넓게).
        replaceWithGif(store, replaced as ReplaceElementLike[], url, { bleed });
      }
    } catch (err) {
      const short = api.asInsufficientCreditsError(err);
      setError(
        short
          ? short.message
          : err instanceof Error
            ? err.message
            : t("detailPage.properties.gifFailed"),
      );
    } finally {
      setBusy(false);
    }
  }, [first, box, lines, replaced, busy, onGenerate, effect, store, t]);

  return (
    <Section
      title={t("detailPage.properties.textGif", { defaultValue: "텍스트를 GIF로" })}
    >
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <GifEffectPicker
          value={effect}
          options={effects}
          onChange={setEffect}
          disabled={busy}
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || !first}
          className="inline-flex items-center gap-1.5 rounded-dpe-md bg-dpe-ink-900 px-3 py-1.5 text-sm font-dpe-medium text-dpe-on-accent transition hover:bg-dpe-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Film size={14} />
          {busy
            ? t("detailPage.properties.textGifBusy", { defaultValue: "만드는 중…" })
            : t("detailPage.properties.textGifMake", { defaultValue: "GIF 만들기" })}
          {creditCost ? ` · ${creditCost}` : ""}
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 text-[11px] text-dpe-danger-500">{error}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-dpe-ink-400">
          {lines.length > 1
            ? t("detailPage.properties.textGifGroupHint", {
                defaultValue:
                  "묶인 문구 {{count}}줄이 한 장의 투명 배경 GIF로 만들어져요.",
                count: lines.length,
              })
            : t("detailPage.properties.textGifHint", {
                defaultValue:
                  "선택한 문구가 배경 없는 GIF로 '내 이미지'에 저장돼요.",
              })}
        </p>
      )}
    </Section>
  );
});

/** 칸 모양 선택지. 서버 `GET /images/data-gif-effects` 의 SHAPES 와 같아야 한다. */
const CELL_SHAPES: Array<{ id: string; label: string }> = [
  { id: "circle", label: "동그라미" },
  { id: "square", label: "네모" },
  { id: "rounded", label: "둥근 네모" },
  { id: "diamond", label: "마름모" },
  { id: "hexagon", label: "육각형" },
];

/**
 * 숫자를 카운트업 GIF로 — 선택한 텍스트에서 값을 읽어 **제자리에** 갈아 끼운다.
 *
 * 입력 폼을 따로 두지 않는 게 핵심이다. 캔버스에 이미 적어 둔 "279.45%"를 고르면 목표값·
 * 소수 자릿수·접미사를 거기서 읽는다 — 숫자를 두 번 적게 하면 캔버스 값과 GIF 값이 어긋난
 * 채로 배포된다. 색·크기·굵기·이탤릭·하이라이트도 요소에서 그대로 가져온다.
 *
 * 숫자가 없는 문구면 섹션을 아예 감춘다(눌러봐야 헛것이 나온다).
 */
const CountUpGifSection = observer(function CountUpGifSection({
  store,
  els,
  targets,
  onGenerate,
  creditCost,
}: {
  store: StoreLike;
  els: ElementLike[];
  /** GIF가 대체할 요소들(그룹이면 그룹 자체). 생략하면 ``els``. */
  targets?: ElementLike[];
  onGenerate: GenerateDataGifFn;
  creditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const { api, brand } = useDetailPageHost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replaced = targets ?? els;
  const first = els[0];
  const text = str(first?.text);
  const parsed = useMemo(() => parseCountUpText(text), [text]);
  const box = useMemo(
    () => unionBox(replaced as ReplaceElementLike[]),
    [replaced],
  );

  const run = useCallback(async () => {
    if (!parsed || !first || !box || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fontFamily = str(first.fontFamily);
      // Canvas 는 굵기를 `"normal"`·`"bold"`·`"700"` 처럼 **문자열**로 들고 있고, 아예
      // 안 들고 있으면 굵기가 `fontStyle` 쪽에 실린다. 그냥 Number() 하면 `"normal"` 이
      // NaN 이라 기본값으로 떨어져, 보통 굵기 숫자가 GIF 에서 전부 ExtraBold 로 굳었다.
      const fontWeight = toFontWeight(first.fontWeight ?? first.fontStyle);
      const urls = await onGenerate({
        kind: "count_up",
        ...parsed,
        color: toHexColor(str(first.fill), "#111111"),
        fontSize: Math.round(num(first.fontSize, 42)),
        fontWeight,
        fontFamily,
        letterSpacing: num(first.letterSpacing, 0),
        // 상자가 글자보다 넓으면 정렬이 곧 자리다 — 안 넘기면 왼쪽에 적어 둔 숫자가
        // GIF 안에서 가운데로 옮겨 앉는다.
        anchor: textAnchorOf(first.align),
        italic: /italic/i.test(str(first.fontStyle)),
        // 하이라이트가 걸린 숫자는 그 띠를 GIF 안에 굽는다 — CSS로 두고 글자만 투명
        // 위에 얹으면 1비트 알파가 글자 윗동을 매트색으로 잘라 먹는다.
        marker: first.backgroundEnabled
          ? toHexColor(str(first.backgroundColor), "#f7f14a")
          : "",
        // 원본 상자를 그대로 넘긴다 — 서버가 글자 수로 캔버스를 추정하면 되꽂을 때
        // 글자 크기가 달라진다.
        width: Math.round(box.width),
        height: Math.round(box.height),
        background: pageBackgroundColor(store),
        transparent: true,
        // 폰트 파일 주소까지 보낸다. 이름만 보내면 서버 컨테이너에 그 폰트가 없어
        // 시스템 폴백(픽셀 폰트)으로 그려진다.
        fonts: resolveGifWebFonts([{ family: fontFamily, weight: fontWeight }]),
        brandId: brand.getStoredActiveBrandId() ?? undefined,
      });
      const url = urls[0];
      if (url) replaceWithGif(store, replaced as ReplaceElementLike[], url);
    } catch (err) {
      const short = api.asInsufficientCreditsError(err);
      setError(
        short
          ? short.message
          : err instanceof Error
            ? err.message
            : t("detailPage.properties.gifFailed"),
      );
    } finally {
      setBusy(false);
    }
  }, [parsed, first, box, replaced, busy, onGenerate, store, t]);

  if (!parsed) return null;

  return (
    <Section
      title={t("detailPage.properties.countUpGif", {
        defaultValue: "숫자를 카운트업으로",
      })}
    >
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-dpe-md bg-dpe-ink-900 px-3 py-1.5 text-sm font-dpe-medium text-dpe-on-accent transition hover:bg-dpe-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Film size={14} />
        {busy
          ? t("detailPage.properties.textGifBusy", { defaultValue: "만드는 중…" })
          : t("detailPage.properties.countUpGifMake", {
              defaultValue: "카운트업 GIF 만들기",
            })}
        {creditCost ? ` · ${creditCost}` : ""}
      </button>
      {error ? (
        <p className="mt-1.5 text-[11px] text-dpe-danger-500">{error}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-dpe-ink-400">
          {t("detailPage.properties.countUpGifHint", {
            defaultValue:
              "0에서 {{target}}까지 오른 뒤 2초 멈췄다 반복해요. 이 자리에 그대로 들어갑니다.",
            target: `${parsed.prefix}${parsed.to.toLocaleString(undefined, {
              minimumFractionDigits: parsed.decimals,
              maximumFractionDigits: parsed.decimals,
              useGrouping: parsed.grouping,
            })}${parsed.suffix}`,
          })}
        </p>
      )}
    </Section>
  );
});

/**
 * 셀 차오름 GIF(도트 차트·표 셀·매트릭스) — 새 요소로 캔버스 가운데에 넣는다.
 *
 * 카운트업과 달리 원본이 될 요소가 없어서 선택 인스펙터에는 놓을 자리가 없다. 아무것도
 * 안 골랐을 때 뜨는 페이지 인스펙터가 "새로 만든다"는 뜻과 맞다.
 */
const CellGridGifSection = observer(function CellGridGifSection({
  store,
  onGenerate,
  creditCost,
}: {
  store: StoreLike;
  onGenerate: GenerateDataGifFn;
  creditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const { api, brand } = useDetailPageHost();
  const [rows, setRows] = useState("6,4,2");
  const [cols, setCols] = useState(8);
  const [shape, setShape] = useState("circle");
  const [fill, setFill] = useState("#1b6fd4");
  const [empty, setEmpty] = useState("#e4e4e4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = useMemo(() => parseFilledRows(rows), [rows]);
  // 칸 수보다 많이 채우라는 요청은 서버가 422로 되돌린다 — 버튼에서 미리 막는다.
  const invalid = filled.length === 0 || filled.some((n) => n > cols);

  const run = useCallback(async () => {
    if (invalid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const urls = await onGenerate({
        kind: "cell_grid",
        filled,
        cols,
        shape,
        fill,
        empty,
        background: pageBackgroundColor(store),
        transparent: true,
        brandId: brand.getStoredActiveBrandId() ?? undefined,
      });
      const url = urls[0];
      if (url) insertPersonalImage(store, url, { isGif: true });
    } catch (err) {
      const short = api.asInsufficientCreditsError(err);
      setError(
        short
          ? short.message
          : err instanceof Error
            ? err.message
            : t("detailPage.properties.gifFailed"),
      );
    } finally {
      setBusy(false);
    }
  }, [invalid, busy, onGenerate, filled, cols, shape, fill, empty, store, t]);

  return (
    <Section
      title={t("detailPage.properties.cellGridGif", {
        defaultValue: "셀 차오름 GIF",
      })}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-dpe-ink-500">
            {t("detailPage.properties.cellGridRows", {
              defaultValue: "행별 채울 칸",
            })}
          </span>
          <input
            value={rows}
            onChange={(e) => setRows(e.target.value)}
            placeholder="6,4,2"
            className="h-8 rounded-dpe-md border border-dpe-ink-200 px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-dpe-ink-500">
            {t("detailPage.properties.cellGridCols", { defaultValue: "열 수" })}
          </span>
          <input
            type="number"
            min={1}
            max={40}
            value={cols}
            onChange={(e) => setCols(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 rounded-dpe-md border border-dpe-ink-200 px-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-dpe-ink-500">
            {t("detailPage.properties.cellGridShape", { defaultValue: "모양" })}
          </span>
          <select
            value={shape}
            onChange={(e) => setShape(e.target.value)}
            className="h-8 rounded-dpe-md border border-dpe-ink-200 px-2 text-sm"
          >
            {CELL_SHAPES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <ColorInput value={fill} onChange={setFill} />
        <ColorInput value={empty} onChange={setEmpty} />
      </div>
      <button
        type="button"
        onClick={run}
        disabled={busy || invalid}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-dpe-md bg-dpe-ink-900 px-3 py-1.5 text-sm font-dpe-medium text-dpe-on-accent transition hover:bg-dpe-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Film size={14} />
        {busy
          ? t("detailPage.properties.textGifBusy", { defaultValue: "만드는 중…" })
          : t("detailPage.properties.cellGridGifMake", {
              defaultValue: "차트 GIF 만들기",
            })}
        {creditCost ? ` · ${creditCost}` : ""}
      </button>
      <p className="mt-1.5 text-[11px] text-dpe-ink-400">
        {error ??
          (invalid
            ? t("detailPage.properties.cellGridInvalid", {
                defaultValue: "행별 칸 수는 1개 이상이고 열 수를 넘을 수 없어요.",
              })
            : t("detailPage.properties.cellGridGifHint", {
                defaultValue:
                  "채운 칸이 순서대로 켜진 뒤 2초 멈췄다 반복해요. 축·수치 글자는 캔버스에서 위에 얹으세요.",
              }))}
      </p>
    </Section>
  );
});

const ImageInspector = observer(function ImageInspector({
  store,
  els,
  isGif = false,
  onGenerateImageGif,
  imageGifCreditCost,
}: {
  store: StoreLike;
  els: ElementLike[];
  /** 선택 요소가 GIF면 GIF에 다시 GIF를 굽지 않게 섹션을 숨긴다. */
  isGif?: boolean;
  /** 선택 이미지에 이펙트를 걸어 GIF로. 미지정이면 섹션이 뜨지 않는다. */
  onGenerateImageGif?: GenerateImageGifFn;
  /** 이미지 GIF 1회 비용(크레딧). */
  imageGifCreditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const single = els.length === 1 ? els[0] : null;
  const ref = els[0];
  const radius = num(ref.cornerRadius, 0);

  return (
    <>
      <Section title={t("detailPage.properties.cornerRadius")}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={200}
            value={radius}
            onChange={(e) => setAll(els, { cornerRadius: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-dpe-ink-900"
          />
          <span className="w-12 text-right text-sm tabular-nums text-dpe-ink-700">
            {radius}px
          </span>
        </div>
      </Section>
      <OpacityRow els={els} />
      {/* 배경 지우기와 프롬프트 편집은 캔버스 위 띠로 옮겼다(`ElementAiEditPanel`). */}
      {/* 이미지를 GIF로 — 선택 이미지에 이펙트를 걸어 새 GIF 요소로 삽입한다.
          이미 GIF인 요소에는 숨긴다(GIF에 GIF를 다시 굽지 않게). */}
      {single && !isGif && onGenerateImageGif ? (
        <ImageGifSection
          store={store}
          el={single}
          onGenerate={onGenerateImageGif}
          creditCost={imageGifCreditCost}
        />
      ) : null}
      <DeleteRow store={store} els={els} />
    </>
  );
});

// Canvas svg 요소는 마크업을 src에 data URI로 담는다(bubbleSvgDataUrl과 동일 인코딩).
const svgToDataUri = encodeSvgDataUri;

// 선택 도형을 "내 도형"에 저장한다(개인 폴더, 공용 라이브러리와 분리). 실패해도
// 조용히 넘어가지 않고 토스트로 알린다.
async function saveShapeToMyShapes(
  host: DetailPageHost,
  markup: string,
  origin: string,
  t: (key: string) => string,
  { silent = false }: { silent?: boolean } = {},
): Promise<void> {
  try {
    const activeBrandId = host.brand.getStoredActiveBrandId();
    const res = activeBrandId
      ? {
          success: Boolean(
            await host.brand.uploadBrandAsset(
              activeBrandId,
              new File([markup], `canvas-shape-${Date.now()}.svg`, {
                type: "image/svg+xml",
              }),
              "shape",
              { metadata: { source: "canvas_shape", origin } },
            ),
          ),
          duplicate: false,
          message: undefined,
        }
      : await host.api.savePersonalDetailPageShape({ svg: markup, origin });
    if (silent) return; // 프롬프트 편집 자동 저장은 편집 성공 토스트와 겹치므로 조용히.
    if (res.success) {
      host.toast.success(
        res.duplicate
          ? t("detailPage.properties.shapeSavedDuplicate")
          : t("detailPage.properties.shapeSaved"),
      );
    } else if (res.message) {
      host.toast.error(res.message);
    }
  } catch {
    // 저장 실패는 편집 흐름을 막지 않는다.
  }
}

// svg 도형(벡터 장식)용 인스펙터: 불투명도 + "내 도형에 저장" + 프롬프트 편집(생성
// ID·디코드 가능한 마크업이 있을 때만) + 삭제. figure 등 마크업이 없는 도형은
// 저장/프롬프트 편집을 숨긴다.
/**
 * SVG 도형·아이콘의 색.
 *
 * 렌더러는 `colorsReplace`(`{바꿀색: 새색}`)를 오래전부터 읽고 있었는데 **그 값을 쓰는
 * UI가 하나도 없었다.** 그래서 도형을 넣으면 소스 색 그대로 박제됐고, 서식 복사로 다른
 * 도형의 색을 옮겨오는 우회로만 있었다. 여기가 그 반쪽을 채운다.
 *
 * 마크업에 실제로 쓰인 색을 뽑아 스와치로 세운다(단색 아이콘이면 하나, 다색 도형이면 N개).
 * 표기가 달라도 같은 색이면 한 스와치가 한꺼번에 바꾼다 — 정규화·치환 모두 렌더러 것을
 * 그대로 쓰기 때문이다.
 */
const SvgColorSection = observer(function SvgColorSection({
  el,
  markup,
}: {
  el: ElementLike;
  markup: string;
}) {
  const { t } = useTranslation("branding");
  const originals = extractSvgColors(markup);
  const replaced = readColorReplace(el.colorsReplace);

  if (!originals.length) return null;

  const setColor = (from: string, to: string) => {
    const next: Record<string, string> = {};
    for (const [key, value] of replaced) next[key] = value;
    // 원래 색으로 되돌리면 항목을 지운다 — 빈 치환을 들고 다닐 이유가 없다.
    if (effectiveColor(from, new Map()) === to) delete next[from];
    else next[from] = to;
    el.set({ colorsReplace: next });
  };

  return (
    <Section title={t("detailPage.properties.shapeColors")}>
      <div className="flex flex-col gap-2">
        {originals.map((original) => (
          <ColorInput
            key={original}
            value={effectiveColor(original, replaced)}
            onChange={(next) => setColor(original, next)}
          />
        ))}
      </div>
      {replaced.size ? (
        <button
          type="button"
          onClick={() => el.set({ colorsReplace: {} })}
          className="mt-2 w-full rounded-dpe-md border border-dpe-ink-200 py-1.5 text-[11px] font-dpe-medium text-dpe-ink-500 hover:border-dpe-ink-400 hover:bg-dpe-ink-50"
        >
          {t("detailPage.properties.shapeColorsReset")}
        </button>
      ) : null}
    </Section>
  );
});

const SvgInspector = observer(function SvgInspector({
  store,
  els,
  onGenerateImageGif,
  imageGifCreditCost,
}: {
  store: StoreLike;
  els: ElementLike[];
  onGenerateImageGif?: GenerateImageGifFn;
  imageGifCreditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const host = useDetailPageHost();
  const single = els.length === 1 ? els[0] : null;
  const currentSvg = single ? decodeSvgDataUri(str(single.src)) : null;
  return (
    <>
      {single && currentSvg ? (
        <SvgColorSection el={single} markup={currentSvg} />
      ) : null}
      <OpacityRow els={els} />
      {single && onGenerateImageGif ? (
        <ShapeGifSection
          store={store}
          el={single}
          onGenerate={onGenerateImageGif}
          creditCost={imageGifCreditCost}
        />
      ) : null}
      {single && currentSvg ? (
        <div className="border-t border-dpe-ink-200 px-4 py-2">
          <button
            type="button"
            onClick={() => void saveShapeToMyShapes(host, currentSvg, "manual_save", t)}
            className="flex w-full items-center justify-center gap-1.5 rounded-dpe-lg border border-dpe-ink-200 py-2 text-xs font-dpe-medium text-dpe-ink-600 hover:border-dpe-ink-400 hover:bg-dpe-ink-50"
          >
            <Shapes size={13} />
            {t("detailPage.properties.saveToMyShapes")}
          </button>
        </div>
      ) : null}
      {/* 도형 프롬프트 편집은 캔버스 위 띠로 옮겼다(`ElementAiEditPanel`). */}
      <DeleteRow store={store} els={els} />
    </>
  );
});

// 그룹 인스펙터: 불투명도 + (생성 ID가 있고 편집 가능한 자식이 있으면) 그룹 편집 +
// 그룹 해제/삭제. 그룹을 통째로 고른 채로 안에 든 텍스트·도형을 프롬프트 한 번으로
// 함께 수정한다 — 프롬프트 박스는 딱 하나만 노출한다. 텍스트는 서로 어울리게 한 번에
// 다시 쓰이고, 도형은 같은 지시로 각자 다시 그려진다. 이미지는 대상에서 제외한다.
const GroupInspector = observer(function GroupInspector({
  store,
  els,
  onGenerateTextGif,
  textGifCreditCost,
}: {
  store: StoreLike;
  els: ElementLike[];
  /** 그룹 안이 전부 텍스트면 그룹째로 GIF를 굽는다(카피 그룹 편집과 같은 결). */
  onGenerateTextGif?: GenerateTextGifFn;
  textGifCreditCost?: number;
}) {
  const members = collectEditableDescendants(els[0]);

  // 텍스트만 든 그룹만 GIF로 굽는다 — 도형·이미지가 섞이면 텍스트 렌더러가 그릴 수
  // 없는 것들이 조용히 빠져서 "일부만 담긴 GIF"가 나온다.
  const textOnlyGroup =
    members.length > 0 && members.every((member) => member.type === "text");

  return (
    <>
      <OpacityRow els={els} />
      {textOnlyGroup && onGenerateTextGif ? (
        <TextGifSection
          store={store}
          els={members}
          // 그룹을 통째로 갈아 끼운다 — 자식만 지우면 빈 그룹이 남는다.
          targets={els}
          onGenerate={onGenerateTextGif}
          creditCost={textGifCreditCost}
        />
      ) : null}
      {/* 그룹째 프롬프트 편집은 캔버스 위 띠로 옮겼다(`ElementAiEditPanel`). */}
      <DeleteRow store={store} els={els} />
    </>
  );
});

// 도형(figure) 인스펙터: 채우기(단색/그라데이션) + 모서리 둥글기 + 불투명도 + 삭제.
// figure는 Canvas 네이티브 도형이라 ``fill``에 linear-gradient 문자열을 넣으면 useColor가
// 그라데이션으로 렌더한다(svg 도형은 마크업에 색이 박혀 있어 SvgInspector가 담당).
const FigureInspector = observer(function FigureInspector({
  store,
  els,
  onGenerateImageGif,
  imageGifCreditCost,
}: {
  store: StoreLike;
  els: ElementLike[];
  onGenerateImageGif?: GenerateImageGifFn;
  imageGifCreditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const ref = els[0];
  const fill = str(ref.fill, "rgb(0, 161, 255)");
  const radius = num(ref.cornerRadius, 0);
  return (
    <>
      <Section title={t("detailPage.properties.color")}>
        <FillControl value={fill} onChange={(c) => setAll(els, { fill: c })} />
      </Section>
      <Section title={t("detailPage.properties.cornerRadius")}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={200}
            value={radius}
            onChange={(e) => setAll(els, { cornerRadius: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-dpe-ink-900"
          />
          <span className="w-12 text-right text-sm tabular-nums text-dpe-ink-700">
            {radius}px
          </span>
        </div>
      </Section>
      <OpacityRow els={els} />
      {els.length === 1 && onGenerateImageGif ? (
        <ShapeGifSection
          store={store}
          el={els[0]}
          onGenerate={onGenerateImageGif}
          creditCost={imageGifCreditCost}
        />
      ) : null}
      <DeleteRow store={store} els={els} />
    </>
  );
});

/**
 * 이 화면(섹션)의 높이. 상세페이지 한 장은 세로로 이어 붙는 띠라서 장마다 길이가 다르고,
 * 그 길이 자체가 편집 대상이다 — "여기 좀 답답해요"의 답이 요소 배치가 아니라 높이일 때가
 * 많다. 캔버스 아래 손잡이로도 끌 수 있지만(``stacked-canvas-workspace``), 긴 화면은 아래
 * 끝이 화면 밖이라 숫자로 넣는 길이 항상 열려 있어야 한다.
 */
const PageHeightSection = observer(function PageHeightSection({
  page,
}: {
  page?: PageLike;
}) {
  const { t } = useTranslation("branding");
  const profile = detailPageEditorProfile();
  if (!page) return null;
  const height = Math.round(num(page.computedHeight, MIN_SECTION_HEIGHT));
  const contentBottom = sectionContentBottom(page);
  // 잘리는 것은 경고한다. 편집기 캔버스는 페이지 밖을 안 그리므로, 줄이는 순간 아래 내용이
  // "사라진" 것처럼 보인다 — 지운 게 아니라 화면 밖으로 나간 것이다.
  const overflow = contentBottom > height;
  return (
    <Section
      title={t(
        profile.wording === "section"
          ? "detailPage.properties.pageHeight"
          : "detailPage.properties.plateHeight",
      )}
    >
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <NumberField
            label="H"
            value={height}
            step={10}
            min={MIN_SECTION_HEIGHT}
            max={MAX_SECTION_HEIGHT}
            onChange={(v) => applySectionHeight(page, v)}
          />
        </div>
        <button
          type="button"
          disabled={contentBottom <= 0 || contentBottom === height}
          onClick={() => applySectionHeight(page, contentBottom)}
          className="h-9 shrink-0 rounded-dpe-md border border-dpe-ink-200 bg-dpe-surface px-2.5 text-xs font-dpe-semibold text-dpe-ink-700 hover:bg-dpe-ink-50 disabled:cursor-not-allowed disabled:text-dpe-ink-300"
        >
          {t("detailPage.properties.pageHeightFit")}
        </button>
      </div>
      <p className="mt-2 text-xs text-dpe-ink-400">
        {overflow
          ? t("detailPage.properties.pageHeightOverflow", { px: contentBottom })
          : t("detailPage.properties.pageHeightHint")}
      </p>
    </Section>
  );
});
PageHeightSection.displayName = "PageHeightSection";

const PageInspector = observer(function PageInspector({
  store,
  onGenerateDataGif,
  dataGifCreditCost,
}: {
  store: StoreLike;
  /** 셀 차오름 GIF를 새 요소로 넣는다. 미지정이면 섹션 숨김. */
  onGenerateDataGif?: GenerateDataGifFn;
  dataGifCreditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const profile = detailPageEditorProfile();
  const page = store.activePage ?? store.pages[0];
  const bg = str(page?.background, "#ffffff");
  return (
    <>
      {profile.page.fixed ? null : <PageHeightSection page={page} />}
      <Section title={t("detailPage.properties.pageBackground")}>
        <FillControl value={bg} onChange={(c) => page?.set?.({ background: c })} />
        <p className="mt-2 text-xs text-dpe-ink-400">
          {t("detailPage.properties.pageBackgroundHint")}
        </p>
      </Section>
      {onGenerateDataGif ? (
        <CellGridGifSection
          store={store}
          onGenerate={onGenerateDataGif}
          creditCost={dataGifCreditCost}
        />
      ) : null}
    </>
  );
});

// ── Header + root ─────────────────────────────────────────────────────────────

/**
 * 캔버스 위 띠에서 여는 "프롬프트로 편집".
 *
 * 우측 패널 맨 아래에 있던 넷(글·사진·도형·그룹)을 한 자리로 모았다. **셈은 하나도 안
 * 바꿨다** — 같은 패널 부품에 같은 값을 넘긴다. 달라진 것은 여는 자리뿐이다.
 *
 * 필요한 것(생성 ID·사용량·크레딧)은 컨텍스트에서 집는다. 이 층은 작업 영역 안에 살아서
 * props로 내리면 캔버스 나무가 통째로 다시 만들어진다(`editor-ai-context.tsx`).
 */
export const ElementAiEditPanel = observer(function ElementAiEditPanel({
  store,
  els,
}: {
  store: StoreLike;
  els: ElementLike[];
}) {
  const { t } = useTranslation("branding");
  const host = useDetailPageHost();
  const { api } = host;
  const ai = useEditorAi();
  const generatedId = ai.generatedId;
  const usage = ai.usage;
  const single = els.length === 1 ? els[0] : null;
  const singleCustom = (single?.custom ?? {}) as Record<string, unknown>;
  const slotRole =
    typeof singleCustom.leviosaSlot === "string" ? singleCustom.leviosaSlot : "";
  const onGenerateGif = ai.onGenerateGif;

  // 선택 이미지를 base로 프롬프트 방향으로 재생성(크레딧 과금). data URI면 base64로,
  // http(s) URL이면 그대로 넘긴다. 402는 크레딧 부족 마커로 승격.
  const editImage = useCallback<GenerateImageFn>(
    async ({ prompt, tier, brandId, annotatedImage }) => {
      if (!single || !generatedId) return [];
      const src = str(single.src);
      const isData = src.startsWith("data:");
      try {
        const res = await api.promptEditDetailPageImage(generatedId, {
          slot_role: slotRole,
          current_image_url: isData ? undefined : src,
          current_image_base64: isData ? src.split(",")[1] : undefined,
          instruction: prompt,
          // 마킹본은 원본과 **함께** 간다. 마킹만 보내면 모델이 빨간 자국을 그림의
          // 일부로 읽는다 — 서버 계약이 막으려던 바로 그 실패다.
          annotated_image: annotatedImage,
          tier,
          brand_id: brandId,
        });
        return res.url ? [res.url] : [];
      } catch (err) {
        const short = api.asInsufficientCreditsError(err);
        if (short) {
          throw Object.assign(new Error(short.message), {
            insufficientCredits: true,
          });
        }
        throw err;
      }
    },
    [api, single, generatedId, slotRole],
  );

  // 선택 이미지를 레퍼런스로 넣어 GIF 생성. 백엔드 load_reference_bytes는 data:/http(s)를
  // 받으므로 편집기 src(상대경로·blob·동일출처 프록시)를 data URI로 바꿔 넘긴다(alpha 보존).
  const editGif = useCallback<GenerateGifFn>(
    async ({ prompt, referenceImages, transparent, brandId }) => {
      if (!single || !onGenerateGif) return [];
      const reference = await resolveReferenceSrc(str(single.src));
      return onGenerateGif({
        prompt,
        referenceImages: reference ? [reference, ...referenceImages] : referenceImages,
        transparent,
        brandId,
      });
    },
    [single, onGenerateGif],
  );

  if (!single || !generatedId) return null;

  if (single.type === "text") {
    const slotKind =
      typeof singleCustom.leviosaSlotKind === "string"
        ? singleCustom.leviosaSlotKind
        : undefined;
    return (
      <PromptEditPanel
        generatedId={generatedId}
        slotRole={slotRole}
        currentText={str(single.text)}
        renderKind={slotKind}
        onApplied={(text) => single.set({ text })}
        editsUsed={usage?.textUsed}
        editLimit={usage?.textLimit}
        unlimited={usage?.unlimited}
        onUsage={(used, limit) => ai.applyUsage?.("text", used, limit)}
        onBuyMore={ai.onBuyCredits}
      />
    );
  }

  if (single.type === "image") {
    const isGif = isGifElement(single);
    return (
      <section>
        <h4 className="flex items-center gap-1.5 px-4 pt-3 text-[11px] font-dpe-semibold uppercase tracking-[0.06em] text-dpe-ink-400">
          <Sparkles size={13} className="text-dpe-ai" />
          {isGif
            ? t("detailPage.properties.aiGifEdit")
            : t("detailPage.properties.aiImageEdit")}
        </h4>
        <AiGeneratePanel
          store={store}
          onGenerate={editImage}
          onGenerateGif={onGenerateGif ? editGif : undefined}
          gifCreditCost={ai.gifCreditCost}
          hasImplicitReference
          // 지금 고른 이미지를 예시 입력(참조)으로 패널에 그대로 노출한다.
          implicitReferenceSrc={str(single.src)}
          // 같은 이미지 위에 그림으로 가리켜 고칠 수 있게 한다(마킹본 + 원본 두 장).
          annotateBaseSrc={str(single.src)}
          // GIF 요소를 편집 중이면 GIF 재생성 모드를 기본으로 연다.
          initialMode={isGif ? "gif" : "image"}
          onResult={(src) => single.set({ src })}
          costByTier={ai.imageCostByTier}
          creditCost={ai.imageCreditCost}
          creditBalance={ai.imageCreditBalance}
          onBuyCredits={ai.onBuyCredits}
        />
      </section>
    );
  }

  if (single.type === "svg") {
    const currentSvg = decodeSvgDataUri(str(single.src));
    if (!currentSvg) return null;
    return (
      <div className="px-3 py-3">
        <h4 className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-dpe-semibold uppercase tracking-[0.06em] text-dpe-ink-400">
          <Sparkles size={13} className="text-dpe-ai" />
          {t("detailPage.properties.aiShapeEdit")}
        </h4>
        <SvgPromptEditPanel
          generatedId={generatedId}
          slotRole={slotRole}
          currentSvg={currentSvg}
          onApplied={(svg) => {
            single.set({ src: svgToDataUri(svg) });
            // 프롬프트로 편집한 결과는 "내 도형"에 자동 저장(재사용 가능하게).
            void saveShapeToMyShapes(host, svg, "prompt_edit", t, { silent: true });
          }}
          editsUsed={usage?.svgUsed}
          editLimit={usage?.svgLimit}
          unlimited={usage?.unlimited}
          onUsage={(used, limit) => ai.applyUsage?.("svg", used, limit)}
          onBuyMore={ai.onBuyCredits}
        />
      </div>
    );
  }

  if (single.type === "group") {
    // 그룹 편집 요청 items + id→요소 매핑(svg는 디코드 가능한 마크업이 있을 때만).
    const items: DetailPageGroupEditItem[] = [];
    const byId = new Map<string, ElementLike>();
    for (const el of collectEditableDescendants(single)) {
      const custom = (el.custom ?? {}) as Record<string, unknown>;
      const role = typeof custom.leviosaSlot === "string" ? custom.leviosaSlot : "";
      if (el.type === "text") {
        items.push({
          id: el.id,
          kind: "text",
          current_text: str(el.text),
          slot_role: role,
          render_kind:
            typeof custom.leviosaSlotKind === "string"
              ? custom.leviosaSlotKind
              : undefined,
        });
        byId.set(el.id, el);
      } else if (el.type === "svg") {
        const svg = decodeSvgDataUri(str(el.src));
        if (svg) {
          items.push({ id: el.id, kind: "svg", current_svg: svg, slot_role: role });
          byId.set(el.id, el);
        }
      }
    }
    if (!items.length) return null;

    const applyResults = (results: DetailPageGroupEditResultItem[]) => {
      for (const r of results) {
        const el = byId.get(r.id);
        if (!el) continue;
        if (r.kind === "text" && typeof r.text === "string") {
          el.set({ text: r.text });
        } else if (r.kind === "svg" && typeof r.svg === "string") {
          el.set({ src: svgToDataUri(r.svg) });
          void saveShapeToMyShapes(host, r.svg, "prompt_edit", t, { silent: true });
        }
      }
    };

    const hasText = items.some((item) => item.kind === "text");
    const hasSvg = items.some((item) => item.kind === "svg");

    return (
      <div className="px-3 py-3">
        <h4 className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-dpe-semibold uppercase tracking-[0.06em] text-dpe-ink-400">
          <Sparkles size={13} className="text-dpe-ai" />
          {t("detailPage.groupEdit.title")}
        </h4>
        <p className="mb-2 px-1 text-xs text-dpe-ink-400">
          {hasText && hasSvg
            ? t("detailPage.groupEdit.both")
            : hasSvg
              ? t("detailPage.groupEdit.shapes")
              : t("detailPage.groupEdit.texts")}
        </p>
        <GroupPromptEditPanel
          generatedId={generatedId}
          items={items}
          onApplied={applyResults}
          textUsed={usage?.textUsed}
          textLimit={usage?.textLimit}
          svgUsed={usage?.svgUsed}
          svgLimit={usage?.svgLimit}
          unlimited={usage?.unlimited}
          onUsage={ai.applyUsage}
          onBuyMore={ai.onBuyCredits}
        />
      </div>
    );
  }

  return null;
});
ElementAiEditPanel.displayName = "ElementAiEditPanel";

function InspectorHeader({ els }: { els: ElementLike[] }) {
  const { t } = useTranslation("branding");
  let icon = <Layers aria-hidden="true" size={16} />;
  let label = t("detailPage.properties.selectionNone");
  if (els.length === 1) {
    const type = els[0].type;
    if (isGifElement(els[0])) {
      icon = <Film aria-hidden="true" size={16} />;
      label = "GIF";
    } else if (type === "text") {
      icon = <TypeIcon aria-hidden="true" size={16} />;
      label = t("detailPage.properties.typeText");
    } else if (type === "image") {
      icon = <ImageIcon aria-hidden="true" size={16} />;
      label = t("detailPage.properties.typeImage");
    } else if (type === "svg" || type === "figure") {
      icon = <Square aria-hidden="true" size={16} />;
      label = t("detailPage.properties.typeShape");
    } else if (readChartSpec(els[0])) {
      icon = <BarChart3 aria-hidden="true" size={16} />;
      label = t("detailPage.chart.typeChart");
    } else if (readTableSpec(els[0])) {
      icon = <TableIcon aria-hidden="true" size={16} />;
      label = t("detailPage.table.typeTable");
    } else {
      label = type;
    }
  } else if (els.length > 1) {
    label = t("detailPage.properties.selectionCount", { count: els.length });
  }
  return (
    <div className="flex items-center gap-2 border-b border-dpe-ink-200 px-4 py-3 text-sm font-dpe-semibold text-dpe-ink-950">
      {icon}
      {label}
    </div>
  );
}

export const DetailPageProperties = observer(function DetailPageProperties({
  store,
  generatedId,
  onBuyEditCredits,
  onGenerateTextGif,
  textGifCreditCost,
  onGenerateImageGif,
  imageGifCreditCost,
  onGenerateDataGif,
  dataGifCreditCost,
}: {
  store: unknown;
  generatedId?: string;
  /** 편집 한도 소진 시 "편집 크레딧 추가하기" 목적지(레비오사 결제면). 미지정이면 CTA 비활성. */
  onBuyEditCredits?: () => void;
  /** 텍스트 인스펙터 '텍스트를 GIF로' 콜백. 미지정이면 섹션 숨김. */
  onGenerateTextGif?: GenerateTextGifFn;
  /** 텍스트 GIF 1회 비용(크레딧). */
  textGifCreditCost?: number;
  /** 이미지 인스펙터 '이미지를 GIF로' 콜백. 미지정이면 섹션 숨김. */
  onGenerateImageGif?: GenerateImageGifFn;
  /** 이미지 GIF 1회 비용(크레딧). */
  imageGifCreditCost?: number;
  /** 수치 GIF(카운트업·셀 차오름) 콜백. 미지정이면 두 섹션 모두 숨김. */
  onGenerateDataGif?: GenerateDataGifFn;
  /** 수치 GIF 1회 비용(크레딧). */
  dataGifCreditCost?: number;
}) {
  const s = store as StoreLike;
  // 프롬프트 편집(글·사진·도형·그룹)과 배경 지우기는 캔버스 위 띠로 옮겼다. 여기 남는
  // 것은 표·차트의 스펙 편집이라, 사용량은 **띠와 같은 자리**에서 읽어야 한 쪽이 쓴 횟수를
  // 다른 쪽이 모르는 일이 없다. 컨텍스트가 안 꽂혀 있으면(단독으로 띄운 화면) 직접 조회한다.
  const ai = useEditorAi();
  const shared = Boolean(ai.applyUsage);
  const own = useDetailPageEditUsage(shared ? undefined : generatedId);
  const usage = shared ? ai.usage : own.usage;
  const applyUsage = ai.applyUsage ?? own.applyUsage;
  // Resolve through selectedElementsIds so a GROUP CHILD picked in the layers
  // tree is editable here — the stock editor's selectedElements getter only sees
  // top-level page children and would report "선택 없음".
  const els = selectedElementsDeep(s) as ElementLike[];
  const allText = els.length > 0 && els.every((e) => e.type === "text");
  const allImage = els.length > 0 && els.every((e) => e.type === "image");
  // 단일 GIF면 이미지 인스펙터를 GIF 전용 모드로(AI 편집을 GIF 재생성으로 기본 전환).
  const singleGif = els.length === 1 && isGifElement(els[0]);
  // figure(네이티브 도형)만 골랐으면 채우기(그라데이션)·모서리를 편집한다.
  const allFigure = els.length > 0 && els.every((e) => e.type === "figure");
  // 단일 svg 도형이면 벡터 프롬프트 편집을 붙인다(figure/혼합은 기존 경로 유지).
  const singleSvg = els.length === 1 && els[0].type === "svg";
  // 단일 그룹이면 안에 든 텍스트 카피를 그룹째로 다시 쓸 수 있게 한다.
  const singleGroup = els.length === 1 && els[0].type === "group";
  // 차트도 그룹이라 GroupInspector가 먼저 잡아간다. 스펙이 있으면 차트 인스펙터가 이긴다.
  const chartSpec = els.length === 1 ? readChartSpec(els[0]) : null;
  // 캔버스에서 칸을 직접 고쳤을 수 있다. 저장된 스펙을 그대로 보여 주면 패널이 옛 글자를
  // 띄우고, 그 값으로 AI 편집을 보내면 사용자가 방금 고친 글자가 되돌려진다. 읽는 자리에서
  // 걷어 오면 타이밍을 볼 필요가 없다(쓰지는 않는다 — 쓰는 건 재생성 때 한 번뿐이다).
  const storedTableSpec = els.length === 1 ? readTableSpec(els[0]) : null;
  const tableSpec = storedTableSpec
    ? harvestTableGroup(els[0] as unknown as TableElementLike, storedTableSpec)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InspectorHeader els={els} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {els.length === 0 ? (
          <PageInspector
            store={s}
            onGenerateDataGif={onGenerateDataGif}
            dataGifCreditCost={dataGifCreditCost}
          />
        ) : (
          <>
            {/* 섹션 기준 정렬은 모든 요소 타입에서 노출 */}
            <AlignSection store={s} els={els} />
            {/* 크기·위치(W/H/X/Y)는 단일 선택일 때 — 폭을 직접 보고 고칠 수 있다. */}
            {els.length === 1 ? <SizeSection els={els} /> : null}
            {/* 정렬 순서(z-order)는 단일 선택일 때만 — 다중은 기준이 모호. */}
            {els.length === 1 ? <OrderSection els={els} /> : null}
            {allText ? (
              <TextInspector
                store={s}
                els={els}
                onGenerateTextGif={onGenerateTextGif}
                textGifCreditCost={textGifCreditCost}
                onGenerateDataGif={onGenerateDataGif}
                dataGifCreditCost={dataGifCreditCost}
              />
            ) : allImage ? (
              <ImageInspector
                store={s}
                els={els}
                isGif={singleGif}
                onGenerateImageGif={onGenerateImageGif}
                imageGifCreditCost={imageGifCreditCost}
              />
            ) : singleSvg ? (
              <SvgInspector
                store={s}
                els={els}
                onGenerateImageGif={onGenerateImageGif}
                imageGifCreditCost={imageGifCreditCost}
              />
            ) : allFigure ? (
              <FigureInspector
                store={s}
                els={els}
                onGenerateImageGif={onGenerateImageGif}
                imageGifCreditCost={imageGifCreditCost}
              />
            ) : chartSpec ? (
              <ChartInspector
                // 이 패널의 StoreLike는 페이지 addElement를 안 들고 있다(여기선 쓸 일이
                // 없어서). 차트 sync는 그게 필요하므로 실제 스토어를 그대로 넘긴다.
                store={s as unknown as ChartStoreLike}
                el={els[0] as unknown as ChartElementLike}
                spec={chartSpec}
                prompting={{
                  generatedId,
                  usage: {
                    textUsed: usage?.textUsed,
                    textLimit: usage?.textLimit,
                    unlimited: usage?.unlimited,
                  },
                  // 스펙 편집은 text 버킷을 쓴다(서버와 같은 계약).
                  onUsage: (used: number, limit: number) =>
                    applyUsage?.("text", used, limit),
                  onBuyMore: onBuyEditCredits,
                }}
              />
            ) : tableSpec ? (
              <TableInspector
                // 차트와 같은 이유로 실제 스토어를 그대로 넘긴다(이 패널의 StoreLike에는
                // 페이지 addElement가 없다).
                store={s as unknown as ChartStoreLike}
                el={els[0] as unknown as ChartElementLike}
                spec={tableSpec}
                prompting={{
                  generatedId,
                  usage: {
                    textUsed: usage?.textUsed,
                    textLimit: usage?.textLimit,
                    unlimited: usage?.unlimited,
                  },
                  // 스펙 편집은 text 버킷을 쓴다(서버와 같은 계약).
                  onUsage: (used: number, limit: number) =>
                    applyUsage?.("text", used, limit),
                  onBuyMore: onBuyEditCredits,
                }}
              />
            ) : singleGroup ? (
              <GroupInspector
                store={s}
                els={els}
                onGenerateTextGif={onGenerateTextGif}
                textGifCreditCost={textGifCreditCost}
              />
            ) : (
              <>
                <OpacityRow els={els} />
                <DeleteRow store={s} els={els} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
});
DetailPageProperties.displayName = "DetailPageProperties";
