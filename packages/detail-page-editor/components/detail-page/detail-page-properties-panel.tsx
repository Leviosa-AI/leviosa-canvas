// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
"use client";

import { useCallback, useState } from "react";
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
  Copy,
  Trash2,
  Ungroup,
  Type as TypeIcon,
  Image as ImageIcon,
  ImagePlus,
  Film,
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
  historyOf,
  transact,
  useGestureTransaction,
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
import { elementRect, type Rect, type RectSource } from "@leviosa-ai/canvas/edit/rect";
import { groupResizePatches } from "@leviosa-ai/canvas/render/interaction";
import type { CanvasElement } from "@leviosa-ai/canvas/store";
import { selectedElementsDeep } from "./detail-page-selection";
import { useEditorAi } from "./editor-ai-context";
import { parseAuthoringImageSrc } from "../../lib/detail-page/authoring-image-src";
import { PromptEditPanel } from "./prompt-edit-panel";
import { SvgPromptEditPanel } from "./svg-prompt-edit-panel";
import { GroupPromptEditPanel } from "./group-prompt-edit-panel";
import { useDetailPageEditUsage } from "./edit-quota-ui";
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
} from "./ai-generate-panel";
import { toHexColor } from "../../lib/detail-page/css-color";
import { detailPageEditorProfile } from "../../lib/detail-page/editor-profile";
import { setZ as setElementZ, zOrderOf } from "../../lib/detail-page/z-order";
import {
  canDistribute,
  distributeCoords,
} from "../../lib/detail-page/distribute";
import { useDetailPageHost } from "./detail-page-host-context";
import type {
  DetailPageHost,
  DetailPageGroupEditItem,
  DetailPageGroupEditResultItem,
} from "./detail-page-host-context";
import { isGifSrc } from "../../lib/detail-page-canvas/export/gif-plan";
import { DetailPageFontPicker } from "./detail-page-font-picker";
import { normalizeFontWeight } from "../../lib/detail-page-canvas/font-catalog";
import {
  closestEditorFontWeight,
  getEditorFont,
  loadEditorFont,
} from "../../lib/detail-page-canvas/editor-fonts";
import {
  type ElementLike,
  type StoreLike,
  type PageLike,
  num,
  str,
  resolveReferenceSrc,
} from "./inspectors/shared";
import {
  CellGridGifSection,
  CountUpGifSection,
  ImageGifSection,
  ShapeGifSection,
  TextGifSection,
} from "./inspectors/gif-sections";
// 옮기기 전 이름으로 이 파일에서 꺼내 쓰던 곳(테스트 등)이 그대로 돌게 다시 내보낸다.
export {
  BgRemoveSection,
  GIF_EFFECT_LABEL_KEYS,
  textGifLines,
} from "./inspectors/gif-sections";

/**
 * Figma-style properties inspector for the detail-page Canvas editor.
 *
 * Replaces the stock editor's top ``<Toolbar>``: instead of a horizontal bar above the
 * canvas, the selected element's formatting lives in the right column and reads
 * straight off ``store.selectedElements`` (mobx — so this observer re-renders as
 * the selection or its props change). Mirrors the cardnews layer-editor layout
 * (``text-layer-editor.tsx``) but targets the stock editor's element model.
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

// 여러 요소에 같은 값을 넣는다. 요소마다 set 이 undo 단계를 만들지 않게 한 번에 묶는다.
function setAll(els: ElementLike[], props: Record<string, unknown>) {
  transact(historyOf(els[0]), () => {
    for (const el of els) el.set(props);
  });
}

/**
 * Turn the marker highlight on (a colour) or off (``null``) on each element.
 * Stored on ``custom.highlightColor`` so the per-line band renderers own it, and
 * the native Canvas ``backgroundEnabled`` box is cleared so the two never double
 * up (legacy solid-background highlights migrate to the band on first edit).
 */
function setHighlight(els: ElementLike[], color: string | null) {
  transact(historyOf(els[0]), () => {
    for (const el of els) {
      const custom = { ...((el.custom ?? {}) as Record<string, unknown>) };
      if (color) custom.highlightColor = color;
      else delete custom.highlightColor;
      el.set({ custom, backgroundEnabled: false });
    }
  });
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

/** GIF로 삽입된 이미지 요소인지(우측 인스펙터를 GIF 전용으로 바꾼다). */
function isGifElement(el: ElementLike): boolean {
  if (el.custom && (el.custom as { detailPageGif?: unknown }).detailPageGif) return true;
  return (el.type === "image" || el.type === "svg") && isGifSrc(str(el.src));
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
    const rect = rectOf(sib);
    const start = axis === "x" ? rect.x : rect.y;
    const size = axis === "x" ? rect.width : rect.height;
    lo = Math.min(lo, start);
    hi = Math.max(hi, start + size);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  return { start: lo, size: hi - lo };
}

/**
 * 요소가 **보이는** 네모(부모 좌표). 그룹은 자기 x/y·폭·높이를 안 믿으므로(자식이 좌표를
 * 들고, 그룹 폭·높이는 0일 수 있다) x/width를 그대로 읽으면 정렬이 그룹을 날려 보낸다.
 * 캔버스가 정렬·스냅에 쓰는 `elementRect`로 잰다.
 */
function rectOf(el: unknown): Rect {
  return elementRect(el as RectSource);
}

/** 보이는 네모의 축 시작이 `coord`에 오게 하는 x(또는 y) 값. */
function placeAt(el: ElementLike, axis: AlignAxis, coord: number): number {
  return num(el[axis]) + coord - rectOf(el)[axis];
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
  transact(historyOf(els[0]), () => {
    for (const el of els) {
      const frame = frameOf(store, el, axis);
      if (!frame) continue;
      const rect = rectOf(el);
      const size = axis === "x" ? rect.width : rect.height;
      const coord = Math.round(placeAt(el, axis, alignedCoord(frame, size, where)));
      el.set(axis === "x" ? { x: coord } : { y: coord });
    }
  });
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
    const rect = rectOf(el);
    const size = axis === "x" ? rect.width : rect.height;
    if (frame.size - size < 1) return null; // 상자를 꽉 채움: 정렬 구분 무의미
    const coord = rect[axis];
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
  // 보이는 네모로 잰다 — 그룹이 섞여 있어도 같은 자로 벌린다.
  const items = els.map((el) => {
    const rect = rectOf(el);
    return { id: el.id, start: rect[axis], size: axis === "x" ? rect.width : rect.height };
  });
  const coords = distributeCoords(items);
  if (!coords) return;
  transact(historyOf(els[0]), () => {
    for (const el of els) {
      const coord = coords.get(el.id);
      if (coord == null) continue;
      const next = Math.round(placeAt(el, axis, coord));
      el.set(axis === "x" ? { x: next } : { y: next });
    }
  });
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
      className={`flex h-8 flex-1 items-center justify-center rounded-le-md border transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? "border-le-ink-300 bg-le-ink-100 text-le-ink-900"
          : "border-le-ink-200 bg-le-surface text-le-ink-600 hover:bg-le-ink-50 hover:text-le-ink-900"
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
      className="flex h-8 flex-1 items-center justify-center rounded-le-md border border-le-ink-200 bg-le-surface text-le-ink-600 transition-colors hover:bg-le-ink-50 hover:text-le-ink-900 disabled:cursor-not-allowed disabled:opacity-30"
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
        <span className="ml-1 shrink-0 rounded-le-md bg-le-ink-100 px-1.5 py-0.5 text-[11px] font-le-medium tabular-nums text-le-ink-500">
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
  const gesture = useGestureTransaction(historyOf(els[0]));
  const opacity = num(els[0]?.opacity, 1);
  return (
    <Section title={t("detailPage.properties.opacity")}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={t("detailPage.properties.opacity")}
          min={0}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(e) => {
            const opacity = Number(e.target.value) / 100;
            gesture.change(() => setAll(els, { opacity }));
          }}
          className="min-w-0 flex-1 accent-le-ink-900"
        />
        <span className="w-10 text-right text-sm tabular-nums text-le-ink-700">
          {Math.round(opacity * 100)}%
        </span>
      </div>
    </Section>
  );
});

// 모서리 둥글기(사진·도형 공용). 드래그 한 번이 undo 한 단계다.
const CornerRadiusRow = observer(function CornerRadiusRow({ els }: { els: ElementLike[] }) {
  const { t } = useTranslation("branding");
  const gesture = useGestureTransaction(historyOf(els[0]));
  const radius = num(els[0]?.cornerRadius, 0);
  return (
    <Section title={t("detailPage.properties.cornerRadius")}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={t("detailPage.properties.cornerRadius")}
          min={0}
          max={200}
          value={radius}
          onChange={(e) => {
            const cornerRadius = Number(e.target.value);
            gesture.change(() => setAll(els, { cornerRadius }));
          }}
          className="min-w-0 flex-1 accent-le-ink-900"
        />
        <span className="w-12 text-right text-sm tabular-nums text-le-ink-700">
          {radius}px
        </span>
      </div>
    </Section>
  );
});

/**
 * 가운데를 축으로 돌렸을 때의 x/y. 엔진은 요소를 왼쪽 위(x,y)를 축으로 돌리므로
 * 회전만 바꾸면 요소가 옆으로 날아간다 — 캔버스 회전 손잡이처럼 가운데를 제자리에 둔다.
 */
export function rotateAboutCenter(
  box: { x: number; y: number; width: number; height: number; rotation: number },
  next: number,
): { x: number; y: number; rotation: number } {
  const hw = box.width / 2;
  const hh = box.height / 2;
  const at = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return { x: hw * Math.cos(r) - hh * Math.sin(r), y: hw * Math.sin(r) + hh * Math.cos(r) };
  };
  const from = at(box.rotation);
  const to = at(next);
  return {
    x: box.x + from.x - to.x,
    y: box.y + from.y - to.y,
    rotation: next,
  };
}

const SHADOW_DEFAULTS = {
  shadowEnabled: true,
  shadowColor: "#000000",
  shadowBlur: 12,
  shadowOffsetX: 0,
  shadowOffsetY: 4,
  shadowOpacity: 0.3,
};

/**
 * 효과: 그림자·외곽선·회전. 렌더러(`canvas/render/attrs.ts` shadowProps·textStroke,
 * FigureBody)가 이미 읽는 속성만 쓴다. 외곽선은 텍스트·도형(figure)만 그려서 그때만 보인다.
 */
const EffectsSection = observer(function EffectsSection({
  els,
  shadow = true,
  stroke = false,
}: {
  els: ElementLike[];
  /** 렌더러가 그림자를 그리는 타입(텍스트·사진·도형)일 때만. */
  shadow?: boolean;
  stroke?: boolean;
}) {
  const { t } = useTranslation("branding");
  const ref = els[0];
  const history = historyOf(ref);
  const gesture = useGestureTransaction(history);
  if (!ref) return null;
  const shadowOn = ref.shadowEnabled === true;
  const strokeWidth = num(ref.strokeWidth, 0);
  const strokeColor = str(ref.stroke) || "#000000";
  const single = els.length === 1 ? ref : null;
  const setRotation = (deg: number) =>
    transact(history, () => {
      for (const el of els) {
        el.set(
          rotateAboutCenter(
            {
              x: num(el.x),
              y: num(el.y),
              width: num(el.width),
              height: num(el.height),
              rotation: num(el.rotation),
            },
            deg,
          ),
        );
      }
    });

  return (
    <Section title={t("detailPage.properties.effects")}>
      <div className="flex flex-col gap-2">
        {shadow ? (
          <div className="flex items-center gap-2">
            <div className="w-20 shrink-0">
              <ToggleButton
                active={shadowOn}
                title={t("detailPage.properties.shadow")}
                onClick={() =>
                  setAll(els, shadowOn ? { shadowEnabled: false } : SHADOW_DEFAULTS)
                }
              >
                <span className="text-xs">{t("detailPage.properties.shadow")}</span>
              </ToggleButton>
            </div>
            {shadowOn ? (
              <ColorInput
                value={str(ref.shadowColor) || "#000000"}
                onChange={(c) => gesture.change(() => setAll(els, { shadowColor: c }))}
              />
            ) : null}
          </div>
        ) : null}
        {shadow && shadowOn ? (
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField
              label={t("detailPage.properties.shadowBlur")}
              value={num(ref.shadowBlur)}
              min={0}
              history={history}
              onChange={(v) => setAll(els, { shadowBlur: v })}
            />
            <NumberField
              label="X"
              value={num(ref.shadowOffsetX)}
              history={history}
              onChange={(v) => setAll(els, { shadowOffsetX: v })}
            />
            <NumberField
              label="Y"
              value={num(ref.shadowOffsetY)}
              history={history}
              onChange={(v) => setAll(els, { shadowOffsetY: v })}
            />
          </div>
        ) : null}
        {stroke ? (
          <div className="flex items-center gap-2">
            <div className="w-24 shrink-0">
              <NumberField
                label={t("detailPage.properties.strokeWidth")}
                value={strokeWidth}
                min={0}
                history={history}
                onChange={(v) =>
                  setAll(els, { strokeWidth: v, ...(v > 0 ? { stroke: strokeColor } : {}) })
                }
              />
            </div>
            {strokeWidth > 0 ? (
              <ColorInput
                value={strokeColor}
                onChange={(c) => gesture.change(() => setAll(els, { stroke: c }))}
              />
            ) : null}
          </div>
        ) : null}
        {single ? (
          <div className="w-28">
            <NumberField
              label={t("detailPage.properties.rotation")}
              value={num(single.rotation)}
              suffix="°"
              history={history}
              onChange={(v) => setRotation(((v % 360) + 360) % 360)}
            />
          </div>
        ) : null}
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
  // 그룹은 자기 x/y·폭·높이를 안 믿는다 — 보이는 네모를 보여 주고, 고치면 그 네모가
  // 움직이거나 커지게 한다(자손까지 같이). 잎은 제 값 그대로.
  const group = el.type === "group" && Array.isArray(el.children);
  const rect = group ? rectOf(el) : null;
  const field = (label: string, key: "width" | "height" | "x" | "y") => (
    <NumberField
      label={label}
      value={rect ? Math.round(rect[key] * 100) / 100 : num(el[key])}
      min={key === "width" || key === "height" ? 1 : undefined}
      history={historyOf(el)}
      onChange={(v) => {
        if (!rect) el.set({ [key]: Math.round(v) });
        else if (key === "x" || key === "y") el.set({ [key]: Math.round(placeAt(el, key, v)) });
        else resizeGroup(el, key, v);
      }}
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

/** 그룹의 보이는 폭(또는 높이)을 `size`로 — 자손을 같이 늘리고 왼쪽 위는 제자리에 둔다. */
function resizeGroup(el: ElementLike, key: "width" | "height", size: number) {
  const before = rectOf(el);
  const scale = size / (key === "width" ? before.width : before.height);
  if (!Number.isFinite(scale) || scale <= 0) return;
  const group = el as unknown as CanvasElement;
  transact(historyOf(el), () => {
    const patches = groupResizePatches(group, {
      x: num(el.x),
      y: num(el.y),
      width: num(el.width),
      height: num(el.height),
      rotation: num(el.rotation),
      scaleX: key === "width" ? scale : 1,
      scaleY: key === "height" ? scale : 1,
    });
    for (const { id, patch } of patches) group.store.getElementById(id)?.set(patch);
    // 자손 좌표는 그룹 원점 기준으로 곱해지므로 보이는 왼쪽 위가 밀린다 — 되돌린다.
    const after = rectOf(el);
    el.set({ x: num(el.x) + before.x - after.x, y: num(el.y) + before.y - after.y });
  });
}

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
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-le-md border border-le-ink-200 bg-le-surface text-sm font-le-semibold text-le-ink-700 hover:bg-le-ink-50"
          >
            <Ungroup aria-hidden="true" size={15} />
            {t("detailPage.properties.ungroup")}
          </button>
        )}
        <button
          type="button"
          onClick={() => store.deleteElements?.(els.map((e) => e.id))}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-le-md border border-le-danger-200 bg-le-danger-50 text-sm font-le-semibold text-le-danger-600 hover:bg-le-danger-100"
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
  const history = historyOf(ref);
  // 연달아 들어오는 입력(타이핑·색 끌기)은 undo 한 단계로 묶는다.
  const gesture = useGestureTransaction(history);
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
            aria-label={t("detailPage.properties.content")}
            onChange={(e) => {
              const text = e.target.value;
              gesture.change(() => single.set({ text }));
            }}
            rows={3}
            className="w-full resize-y rounded-le-md border border-le-ink-200 bg-le-surface px-2 py-2 text-sm text-le-ink-900 outline-none focus:border-le-ink-400"
          />
          {/* 프롬프트로 편집은 캔버스 위 띠로 옮겼다(`ElementAiEditPanel`) — 고른 자리
              바로 위에서 열린다. 같은 일을 두 군데 두면 사용량 표시가 갈라진다. */}
        </Section>
      ) : null}

      <Section title={t("detailPage.properties.font")}>
        <div className="grid grid-cols-[1fr_84px] gap-2">
          <DetailPageFontPicker
            value={fontFamily}
            text={str(ref.text)}
            documentFamilies={fonts}
            onSelect={applyFontFamily}
          />
          <NumberField
            value={fontSize}
            min={1}
            step={1}
            ariaLabel={t("detailPage.properties.fontSize")}
            history={history}
            onChange={(v) => setAll(els, { fontSize: v })}
          />
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <select
            aria-label={t("detailPage.properties.fontWeight")}
            value={displayedWeight}
            disabled={fontBusy}
            onChange={(event) => void applyFontWeight(Number(event.target.value))}
            className="h-8 min-w-0 flex-1 rounded-le-md border border-le-ink-200 bg-le-surface px-2 text-xs text-le-ink-700 outline-none focus:border-le-ink-400 disabled:opacity-50"
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
              { value: "left", key: "textAlignLeft", icon: <AlignLeft size={15} /> },
              { value: "center", key: "textAlignCenter", icon: <AlignCenter size={15} /> },
              { value: "right", key: "textAlignRight", icon: <AlignRight size={15} /> },
              { value: "justify", key: "textAlignJustify", icon: <AlignJustify size={15} /> },
            ] as const
          ).map((opt) => (
            <ToggleButton
              key={opt.value}
              active={align === opt.value}
              title={t(`detailPage.properties.${opt.key}`)}
              onClick={() => setAll(els, { align: opt.value })}
            >
              {opt.icon}
            </ToggleButton>
          ))}
        </div>
      </Section>

      <Section title={t("detailPage.properties.color")}>
        <FillControl
          value={fill}
          onChange={(c) => gesture.change(() => setAll(els, { fill: c }))}
        />
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
              onChange={(c) => gesture.change(() => setHighlight(els, c))}
            />
          ) : (
            <span className="text-[11px] text-le-ink-400">
              {t("detailPage.properties.highlightHint")}
            </span>
          )}
        </div>
      </Section>

      <Section title={t("detailPage.properties.spacing")}>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <span className="w-10 text-xs text-le-ink-500">{t("detailPage.properties.lineHeight")}</span>
            <NumberField
              value={lineHeight}
              step={0.1}
              min={0.1}
              history={history}
              onChange={(v) => setAll(els, { lineHeight: v })}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-10 text-xs text-le-ink-500">{t("detailPage.properties.letterSpacing")}</span>
            <NumberField
              value={letterSpacing}
              step={0.5}
              history={history}
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

      <EffectsSection els={els} stroke />
      <OpacityRow els={els} />
      <DeleteRow store={store} els={els} />
    </>
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

  return (
    <>
      <CornerRadiusRow els={els} />
      <EffectsSection els={els} />
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
  } catch (error) {
    // 저장 실패는 편집 흐름을 막지 않지만, 조용히 넘기면 저장된 줄 안다.
    console.error("Failed to save shape to my shapes", error);
    if (!silent) host.toast.error(t("detailPage.properties.shapeSaveFailed"));
  }
}

/**
 * 저작 사진을 브랜드 라이브러리에 남기는 버튼.
 *
 * 저작 사진은 잡 아래 산다. 고른 잡은 이제 만료하지 않으니 사진이 죽지는 않지만, 그
 * 사진은 여전히 **그 잡의 것**이라 다음 상품을 만들 때 라이브러리에서 고를 수 없다.
 * 승격은 한 장을 브랜드 자산으로 복사해 그 벽을 없앤다.
 *
 * 전부 자동으로 복사하지 않는 이유는 저작 한 번에 십수 장이 들어와 라이브러리가
 * 폐기물로 차기 때문이다 — **셀러가 누르는 행위 자체가 신호다.**
 *
 * 사진의 `src` 가 저작 주소로 파싱될 때만 뜬다. 셀러가 직접 올린 것, 브랜드에서 가져온
 * 것, 이미 브랜드에 들어간 AI 이미지는 승격할 이유가 없다.
 */
const SaveImageToBrandButton = observer(function SaveImageToBrandButton({
  src,
  label,
}: {
  src: string;
  label: string;
}) {
  const { t } = useTranslation("branding");
  const host = useDetailPageHost();
  const { brand } = host;
  const [saving, setSaving] = useState(false);

  const ref = parseAuthoringImageSrc(src);
  const brandId = brand.getStoredActiveBrandId() ?? "";
  const promote = host.api.promoteAuthoringImageToBrand;
  // 브랜드가 안 골라져 있으면 넣을 곳이 없다. 버튼을 띄워 놓고 누른 뒤에 알려 주면
  // 셀러는 저장이 실패했다고 읽는다. 호스트가 승격을 안 붙였을 때도 마찬가지다.
  if (!ref || !brandId || !promote) return null;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await promote({
        job_id: ref.jobId,
        name: ref.name,
        sig: ref.sig,
        brand_id: brandId,
        display_name: label,
      });
      host.toast.success(
        res.reused
          ? t("detailPage.properties.saveToBrandDuplicate")
          : t("detailPage.properties.saveToBrandDone"),
      );
    } catch {
      host.toast.error(t("detailPage.properties.saveToBrandFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-le-ink-200 px-4 py-2">
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="flex w-full items-center justify-center gap-1.5 rounded-le-lg border border-le-ink-200 py-2 text-xs font-le-medium text-le-ink-600 hover:border-le-ink-400 hover:bg-le-ink-50 disabled:opacity-50"
      >
        <ImagePlus size={13} />
        {saving
          ? t("detailPage.properties.saveToBrandSaving")
          : t("detailPage.properties.saveToBrand")}
      </button>
    </div>
  );
});

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
  const gesture = useGestureTransaction(historyOf(el));

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
            onChange={(next) => gesture.change(() => setColor(original, next))}
          />
        ))}
      </div>
      {replaced.size ? (
        <button
          type="button"
          onClick={() => el.set({ colorsReplace: {} })}
          className="mt-2 w-full rounded-le-md border border-le-ink-200 py-1.5 text-[11px] font-le-medium text-le-ink-500 hover:border-le-ink-400 hover:bg-le-ink-50"
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
      <EffectsSection els={els} shadow={false} />
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
        <div className="border-t border-le-ink-200 px-4 py-2">
          <button
            type="button"
            onClick={() => void saveShapeToMyShapes(host, currentSvg, "manual_save", t)}
            className="flex w-full items-center justify-center gap-1.5 rounded-le-lg border border-le-ink-200 py-2 text-xs font-le-medium text-le-ink-600 hover:border-le-ink-400 hover:bg-le-ink-50"
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
  const gesture = useGestureTransaction(historyOf(ref));
  return (
    <>
      <Section title={t("detailPage.properties.color")}>
        <FillControl
          value={fill}
          onChange={(c) => gesture.change(() => setAll(els, { fill: c }))}
        />
      </Section>
      <CornerRadiusRow els={els} />
      <EffectsSection els={els} stroke />
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
          className="h-9 shrink-0 rounded-le-md border border-le-ink-200 bg-le-surface px-2.5 text-xs font-le-semibold text-le-ink-700 hover:bg-le-ink-50 disabled:cursor-not-allowed disabled:text-le-ink-300"
        >
          {t("detailPage.properties.pageHeightFit")}
        </button>
      </div>
      <p className="mt-2 text-xs text-le-ink-400">
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
  const gesture = useGestureTransaction(historyOf(store));
  return (
    <>
      {/* 배경. 엔진은 page.background 를 Konva Rect fill 로 그대로 칠해서 단색만 된다
          (그라데이션 문자열은 안 그려진다) — 그래서 FillControl 이 아니라 단색 입력이다. */}
      {page?.set ? (
        <Section title={t("detailPage.properties.pageBackground")}>
          <ColorInput
            value={toHexColor(page.background, "#ffffff")}
            onChange={(c) => gesture.change(() => page.set?.({ background: c }))}
          />
        </Section>
      ) : null}
      {profile.page.fixed ? null : <PageHeightSection page={page} />}
      {/* 화면을 통째로 다루는 두 가지. 예전에는 캔버스 옆 세로 띠에 있었는데, 판을
          가리는 데 비해 여기가 이미 «이 화면» 을 다루는 자리다. */}
      <Section title={t("detailPage.properties.pageActions")}>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!page?.clone || store.pages.length >= profile.maxPages}
            onClick={() => page?.clone?.()}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-le-md border border-le-ink-200 bg-le-surface text-xs font-le-semibold text-le-ink-700 hover:bg-le-ink-50 disabled:cursor-not-allowed disabled:text-le-ink-300"
          >
            <Copy aria-hidden="true" size={15} />
            {t("detailPage.pageToolbar.duplicate")}
          </button>
          <button
            type="button"
            disabled={store.pages.length <= 1}
            onClick={() => page && store.deletePages?.([page.id])}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-le-md border border-le-ink-200 bg-le-surface text-xs font-le-semibold text-le-ink-700 hover:bg-le-danger-50 hover:text-le-danger-700 disabled:cursor-not-allowed disabled:text-le-ink-300"
          >
            <Trash2 aria-hidden="true" size={15} />
            {t("detailPage.pageToolbar.delete")}
          </button>
        </div>
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

const FILLABLE = new Set(["text", "figure"]);
const SHADOWABLE = new Set(["text", "image", "figure"]);

/**
 * 타입이 섞인 선택. 모두가 가진 것만 보여 준다 — 채우기(전부 텍스트·도형), 효과(전부
 * 그림자를 그리는 타입), 불투명도, 삭제.
 */
const MixedInspector = observer(function MixedInspector({
  store,
  els,
}: {
  store: StoreLike;
  els: ElementLike[];
}) {
  const { t } = useTranslation("branding");
  const gesture = useGestureTransaction(historyOf(els[0]));
  const fillable = els.every((el) => FILLABLE.has(el.type));
  const shadowable = els.every((el) => SHADOWABLE.has(el.type));
  return (
    <>
      {fillable ? (
        <Section title={t("detailPage.properties.color")}>
          <FillControl
            value={str(els[0].fill, "#000000")}
            onChange={(c) => gesture.change(() => setAll(els, { fill: c }))}
          />
        </Section>
      ) : null}
      {shadowable ? <EffectsSection els={els} stroke={fillable} /> : null}
      <OpacityRow els={els} />
      <DeleteRow store={store} els={els} />
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
    async ({ prompt, tier, brandId, annotatedImage, signal }) => {
      // 문서 id 는 없어도 된다 — 그림과 지시만으로 도는 일이다(캐러셀이 그렇다).
      if (!single) return [];
      const src = str(single.src);
      const isData = src.startsWith("data:");
      try {
        const res = await api.promptEditDetailPageImage(generatedId ?? null, {
          slot_role: slotRole,
          current_image_url: isData ? undefined : src,
          current_image_base64: isData ? src.split(",")[1] : undefined,
          instruction: prompt,
          // 마킹본은 원본과 **함께** 간다. 마킹만 보내면 모델이 빨간 자국을 그림의
          // 일부로 읽는다 — 서버 계약이 막으려던 바로 그 실패다.
          annotated_image: annotatedImage,
          tier,
          brand_id: brandId,
        }, signal);
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
    async ({ prompt, referenceImages, transparent, brandId, signal }) => {
      if (!single || !onGenerateGif) return [];
      const reference = await resolveReferenceSrc(str(single.src));
      return onGenerateGif({
        prompt,
        referenceImages: reference ? [reference, ...referenceImages] : referenceImages,
        transparent,
        brandId,
        signal,
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
        <h4 className="flex items-center gap-1.5 px-4 pt-3 text-[11px] font-le-semibold uppercase tracking-[0.06em] text-le-ink-400">
          <Sparkles size={13} className="text-le-ai" />
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
          tiers={ai.imageTiers}
          creditCost={ai.imageCreditCost}
          creditBalance={ai.imageCreditBalance}
          onBuyCredits={ai.onBuyCredits}
        />
        <SaveImageToBrandButton
          src={str(single.src)}
          label={str(singleCustom.leviosaSlot ?? "")}
        />
      </section>
    );
  }

  if (single.type === "svg") {
    const currentSvg = decodeSvgDataUri(str(single.src));
    if (!currentSvg) return null;
    return (
      <div className="px-3 py-3">
        <h4 className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-le-semibold uppercase tracking-[0.06em] text-le-ink-400">
          <Sparkles size={13} className="text-le-ai" />
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
        <h4 className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-le-semibold uppercase tracking-[0.06em] text-le-ink-400">
          <Sparkles size={13} className="text-le-ai" />
          {t("detailPage.groupEdit.title")}
        </h4>
        <p className="mb-2 px-1 text-xs text-le-ink-400">
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
      label = t("detailPage.properties.typeGif");
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
      label = t("detailPage.properties.typeElement");
    }
  } else if (els.length > 1) {
    label = t("detailPage.properties.selectionCount", { count: els.length });
  }
  return (
    <div className="flex items-center gap-2 border-b border-le-ink-200 px-4 py-3 text-sm font-le-semibold text-le-ink-950">
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
              <MixedInspector store={s} els={els} />
            )}
          </>
        )}
      </div>
    </div>
  );
});
DetailPageProperties.displayName = "DetailPageProperties";
