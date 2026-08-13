"use client";

import { useEffect, useState, type ComponentType } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import { selectedElementsDeep } from "./detail-page-selection";
import { setHoveredLayerId } from "./hovered-layer";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Film,
  Folder,
  Image as ImageIcon,
  Lock,
  Minus,
  Shapes,
  Square,
  Type as TypeIcon,
  Trash2,
  Unlock,
} from "lucide-react";
import { isGifSrc } from "../../lib/detail-page-canvas/export/gif-plan";
import { dropSpot, moveLayer, type DropZone } from "../../lib/detail-page/layer-move";

/**
 * Figma-style layers tree for the detail-page Canvas editor.
 *
 * Replaces the stock editor's stock ``LayersSection`` panel, which renders a *flat* list
 * of ``activePage.children`` — so a page built out of nested groups reads as an
 * undifferentiated stack with no visible parent/child hierarchy (the user's
 * complaint). This panel walks groups recursively, indents by depth, and lets
 * each group collapse, mirroring Figma's layer tree. Front-most element sits at
 * the top (children array is drawn back-to-front, so we render it reversed).
 *
 * Reordering lives in the right-hand properties inspector (정렬 순서 section) via
 * ``parent.setElementZIndex`` — the one reorder API both Page and Group expose;
 * ``element.moveUp()`` is unreliable for grouped elements because it targets the
 * page, not the immediate group.
 *
 * Rows also drag: drop on the upper/lower edge of a row to reorder, or on the
 * middle of a group row to move *into* that group. The move itself lives in
 * ``@/lib/detail-page/layer-move`` (Canvas has no reparent API — see there).
 * Backspace/Delete removes the focused row, matching the canvas.
 */

type ElementLike = {
  id: string;
  type: string;
  name?: string;
  text?: string;
  src?: string;
  custom?: Record<string, unknown> | null;
  /** 문서에 **없는 것이 정상**이다 — 숨긴 적이 있는 요소만 이 필드를 갖는다. */
  visible?: boolean;
  locked?: boolean;
  /**
   * 셋 다 **문서에 없는 것이 정상**이다 — 분해기가 플래그를 박아 둔 요소만 갖는다.
   * 그래서 `!el.selectable` 같은 참/거짓 판정을 쓰면 안 된다(아래 `=== false` 참고).
   */
  removable?: boolean;
  selectable?: boolean;
  children?: ElementLike[];
  set: (props: Record<string, unknown>) => void;
};

type StoreLike = {
  activePage?: { children?: ElementLike[] };
  selectedElements?: ElementLike[];
  selectedElementsIds?: string[];
  getElementById?: (id: string) => ElementLike | undefined;
  selectElements: (ids: string[]) => void;
  deleteElements: (ids: string[]) => void;
};

/** 행 위 커서 위치 → 놓을 자리. 그룹 행 가운데는 "그 안으로". */
export function zoneAt(ratio: number, isGroup: boolean): DropZone {
  if (isGroup && ratio > 0.3 && ratio < 0.7) return "inside";
  return ratio < 0.5 ? "before" : "after";
}

type DragState = {
  id: string | null;
  over: { id: string; zone: DropZone } | null;
  start: (id: string) => void;
  hover: (id: string, zone: DropZone) => void;
  drop: (id: string, zone: DropZone) => void;
  end: () => void;
};

type IconType = ComponentType<{ size?: number; className?: string }>;

type TFn = (key: string) => string;

/** GIF로 삽입된 요소인지(레이어 아이콘·라벨을 이미지 대신 GIF로 쓴다). */
function isGifLayer(el: ElementLike): boolean {
  if (el.custom && (el.custom as { detailPageGif?: unknown }).detailPageGif) return true;
  return (el.type === "image" || el.type === "svg") && isGifSrc(el.src);
}

function layerMeta(type: string, t: TFn): { Icon: IconType; label: string } {
  switch (type) {
    case "group":
      return { Icon: Folder, label: t("detailPage.layers.group") };
    case "text":
      return { Icon: TypeIcon, label: t("detailPage.layers.text") };
    case "image":
      return { Icon: ImageIcon, label: t("detailPage.layers.image") };
    case "svg":
      return { Icon: Shapes, label: t("detailPage.layers.shape") };
    case "figure":
      return { Icon: Square, label: t("detailPage.layers.shape") };
    case "line":
      return { Icon: Minus, label: t("detailPage.layers.line") };
    default:
      return { Icon: Square, label: type };
  }
}

// 텍스트 레이어는 내용을, 나머지는 이름을 라벨로. 편집기에서 요소를 짚어내기 쉽게.
function displayName(el: ElementLike, t: TFn): string {
  if (el.type === "text") {
    const raw = (el.text ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (raw) return raw;
  }
  const name = (el.name ?? "").trim();
  if (name) return name;
  if (isGifLayer(el)) return "GIF";
  return layerMeta(el.type, t).label;
}

// 잠금 토글: 스톡 편집기에는 단일 locked 세터가 없다. 스톡 레이어 패널과 동일하게
// 네 편집 플래그를 현재 locked 값으로 되돌린다(locked=true면 모두 true→해제).
function toggleLock(el: ElementLike) {
  el.set({
    draggable: el.locked,
    contentEditable: el.locked,
    styleEditable: el.locked,
    resizable: el.locked,
    removable: el.locked,
  });
}

function IconButton({
  title,
  onClick,
  disabled,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "flex h-6 w-6 items-center justify-center rounded transition-colors",
        active ? "text-dpe-ink-800" : "text-dpe-ink-400",
        disabled
          ? "cursor-not-allowed opacity-30"
          : "hover:bg-dpe-ink-200/70 hover:text-dpe-ink-800",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/**
 * The rows to tint as "the group you are working inside".
 *
 * With a group selected — or one shape inside it — the tree gives no clue which of
 * the surrounding rows belong to that group; a decomposed chart is a dozen sibling
 * rows all reading "도형". So the whole subtree of the ACTIVE group is washed in a
 * pale sky, and the actually-selected row keeps the solid blue: at a glance you see
 * both what you picked and what it lives in.
 *
 * The active group is the selected element itself when it IS a group, otherwise the
 * group that contains it.
 */
type TreeNode = { id: string; type: string; children?: readonly TreeNode[] };

export function groupContextIds(
  children: ReadonlyArray<TreeNode>,
  selectedIds: ReadonlyArray<string>,
): Set<string> {
  const out = new Set<string>();
  if (!selectedIds.length) return out;
  const wanted = new Set(selectedIds);

  const subtree = (el: TreeNode) => {
    out.add(el.id);
    for (const c of el.children ?? []) subtree(c);
  };

  // `parent` is the nearest enclosing group, or null at the top level.
  const walk = (els: ReadonlyArray<TreeNode>, parent: TreeNode | null) => {
    for (const el of els) {
      if (wanted.has(el.id)) {
        const active = el.type === "group" && el.children ? el : parent;
        if (active) subtree(active);
      }
      if (el.children?.length) walk(el.children, el);
    }
  };
  walk(children, null);
  return out;
}

/**
 * Groups to force open so the current selection is actually visible: every ancestor
 * group on the path down to a selected element, plus a selected group itself.
 *
 * Groups start collapsed; selecting a group (in the tree or on the canvas) opens it.
 * Callers only ever ADD these ids to the open set — never remove — so the expansion
 * is *sticky*: picking a different group later can't collapse one you already opened
 * (no accordion). A nested selection opens the whole chain so the picked row shows.
 */
export function selectionExpandIds(
  children: ReadonlyArray<TreeNode>,
  selectedIds: ReadonlyArray<string>,
): Set<string> {
  const out = new Set<string>();
  if (!selectedIds.length) return out;
  const wanted = new Set(selectedIds);

  const walk = (els: ReadonlyArray<TreeNode>, ancestors: readonly string[]) => {
    for (const el of els) {
      const isGroup = el.type === "group" && !!el.children;
      if (wanted.has(el.id)) {
        for (const a of ancestors) out.add(a);
        if (isGroup) out.add(el.id);
      }
      if (el.children?.length) {
        walk(el.children, isGroup ? [...ancestors, el.id] : ancestors);
      }
    }
  };
  walk(children, []);
  return out;
}

/**
 * 화면에 실제로 보이는 줄들을, 보이는 순서대로.
 *
 * 예전에는 행이 자기 자식을 직접 그렸다. 그러면 "3번째와 10번째 사이"를 물어볼 자리가
 * 없다 — 트리 어디에도 **평평한 순서**가 없기 때문이다. 범위 선택(⇧클릭)을 하려면
 * 그 순서가 먼저 있어야 한다.
 *
 * 규칙은 그리던 것 그대로다. 앞(위)에 그려지는 것이 목록 위로 오고(역순), 접힌 그룹의
 * 자식은 안 세고, 선택 불가로 **못 박은** 요소만 뺀다(`=== false` — 필드가 없는 것이
 * 정상이다).
 */
export function flattenLayers<
  T extends { id: string; type: string; selectable?: boolean; children?: T[] },
>(children: readonly T[], expanded: ReadonlySet<string>): Array<{ el: T; depth: number }> {
  const out: Array<{ el: T; depth: number }> = [];
  const walk = (list: readonly T[], depth: number) => {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const el = list[i];
      if (el.selectable === false) continue;
      out.push({ el, depth });
      const isGroup = el.type === "group" && Array.isArray(el.children);
      if (isGroup && expanded.has(el.id)) walk(el.children ?? [], depth + 1);
    }
  };
  walk(children, 0);
  return out;
}

/**
 * 두 줄 사이(양끝 포함)의 id들. 피그마의 ⇧클릭이 그렇다 — 3번째를 누르고 10번째를
 * ⇧클릭하면 3~10이 통째로 잡힌다.
 *
 * 기준점이 목록에서 사라졌으면(그룹을 접었다든가) 누른 줄 하나만 준다.
 */
export function rangeIds(
  rows: ReadonlyArray<{ el: { id: string } }>,
  anchorId: string | null,
  targetId: string,
): string[] {
  const to = rows.findIndex((row) => row.el.id === targetId);
  if (to < 0) return [targetId];
  const from = anchorId ? rows.findIndex((row) => row.el.id === anchorId) : -1;
  if (from < 0) return [targetId];
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return rows.slice(lo, hi + 1).map((row) => row.el.id);
}

/** 누른 줄 하나를 선택에서 넣거나 뺀다(⌘/Ctrl 클릭). */
export function toggleId(selected: readonly string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((one) => one !== id)
    : [...selected, id];
}

const LayerRow = observer(function LayerRow({
  el,
  depth,
  store,
  expanded,
  onToggle,
  onSelect,
  context,
  drag,
}: {
  el: ElementLike;
  depth: number;
  store: StoreLike;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string, mods: { shift: boolean; meta: boolean }) => void;
  context: Set<string>;
  drag: DragState;
}) {
  const { t } = useTranslation("branding");

  const isGroup = el.type === "group" && Array.isArray(el.children);
  // Groups start collapsed; only an explicit toggle or a selection opens them.
  const isCollapsed = !expanded.has(el.id);
  // Resolve through selectedElementsIds so a GROUP CHILD reads as selected —
  // the stock editor's selectedElements getter only sees top-level page children.
  const selected = selectedElementsDeep(store).some((e) => e.id === el.id);
  // GIF는 이미지 아이콘 대신 필름 아이콘으로 구분한다.
  const { Icon } = isGifLayer(el) ? { Icon: Film } : layerMeta(el.type, t);
  const label = displayName(el, t);
  // `!el.visible`이 아니다. 분해기가 만든 문서에는 `visible` 필드가 아예 없어서
  // undefined가 오고, 그러면 **모든 레이어가 숨김으로 읽힌다**(취소선 + 눈 감은 아이콘).
  // 숨김의 정의는 렌더러가 갖고 있다 — `element-view.tsx`도 `=== false`에서만 안 그린다.
  const hidden = el.visible === false;
  const dragging = drag.id === el.id;
  const over = drag.over?.id === el.id && drag.id && drag.id !== el.id ? drag.over.zone : null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        draggable={!el.locked}
        onDragStart={(e) => {
          drag.start(el.id);
          if (!e.dataTransfer) return;
          e.dataTransfer.effectAllowed = "move";
          // 파이어폭스는 데이터가 없으면 드래그를 시작하지 않는다.
          e.dataTransfer.setData("text/plain", el.id);
        }}
        onDragOver={(e) => {
          if (!drag.id || drag.id === el.id) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
          e.preventDefault();
          // 놓을 자리부터 정한다. dataTransfer는 환경에 따라 없을 수 있어 나중에 만진다.
          drag.hover(el.id, zoneAt(ratio, isGroup));
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const zone = drag.over?.id === el.id ? drag.over.zone : "after";
          drag.drop(el.id, zone);
        }}
        onDragEnd={() => drag.end()}
        onClick={(e) =>
          onSelect(el.id, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey })
        }
        // A dozen rows all read "도형" — light the layer up on the canvas so the
        // user can see which one this is without selecting (and disturbing) it.
        onMouseEnter={() => setHoveredLayerId(el.id)}
        onMouseLeave={() => setHoveredLayerId(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(el.id, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
            return;
          }
          // 캔버스에서 되는 삭제가 레이어 패널에서도 되게 한다. Backspace는 막지
          // 않으면 브라우저 뒤로가기로 새기도 한다.
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            if (el.removable === false) return;
            store.deleteElements([el.id]);
          }
        }}
        className={[
          "group relative flex items-center gap-1 rounded-dpe-md pr-1.5 text-dpe-ink-700",
          "min-h-[30px] cursor-default select-none",
          dragging ? "opacity-40" : "",
          over === "inside" ? "ring-2 ring-inset ring-dpe-select-400" : "",
          selected
            ? "bg-dpe-select-200 text-dpe-select-950"
            : context.has(el.id)
              ? "bg-dpe-select-50 text-dpe-select-900 hover:bg-dpe-select-100"
              : "hover:bg-dpe-ink-100",
        ].join(" ")}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {over === "before" || over === "after" ? (
          <span
            aria-hidden="true"
            data-testid={`drop-line-${over}`}
            className={[
              "pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-dpe-select-500",
              over === "before" ? "top-0" : "bottom-0",
            ].join(" ")}
          />
        ) : null}

        {isGroup ? (
          <button
            type="button"
            title={isCollapsed ? t("detailPage.layers.expand") : t("detailPage.layers.collapse")}
            aria-label={isCollapsed ? t("detailPage.layers.expand") : t("detailPage.layers.collapse")}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(el.id);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-dpe-ink-400 hover:bg-dpe-ink-200/70 hover:text-dpe-ink-700"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" aria-hidden="true" />
        )}

        <Icon
          size={14}
          className={["shrink-0", selected ? "text-dpe-select-500" : "text-dpe-ink-400"].join(" ")}
        />

        <span
          className={[
            "flex-1 truncate text-[13px]",
            hidden ? "text-dpe-ink-300 line-through" : "",
          ].join(" ")}
          title={label}
        >
          {label}
        </span>

        <div
          className={[
            "flex shrink-0 items-center gap-0.5 transition-opacity",
            hidden || selected
              ? "opacity-100"
              : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
          ].join(" ")}
        >
          <IconButton
            title={hidden ? t("detailPage.layers.show") : t("detailPage.layers.hide")}
            active={hidden}
            onClick={() => el.set({ visible: hidden })}
          >
            {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </IconButton>
          <IconButton
            title={el.locked ? t("detailPage.layers.unlock") : t("detailPage.layers.lock")}
            active={el.locked}
            onClick={() => toggleLock(el)}
          >
            {el.locked ? <Lock size={14} /> : <Unlock size={14} />}
          </IconButton>
          <IconButton
            title={t("detailPage.layers.delete")}
            disabled={el.removable === false}
            onClick={() => store.deleteElements([el.id])}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>

    </>
  );
});

export const DetailPageLayersPanel = observer(function DetailPageLayersPanel({
  store,
}: {
  store: unknown;
}) {
  const { t } = useTranslation("branding");
  const s = store as StoreLike;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; zone: DropZone } | null>(null);

  const children = s.activePage?.children ?? [];
  // 화면 최상단(앞) 요소가 목록 맨 위로. 접힌 그룹의 자식은 안 들어온다.
  const rows = flattenLayers(children, expanded);
  /** ⇧클릭이 "여기서부터"로 삼을 줄. 평범한 클릭이 여기를 옮긴다. */
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const drag: DragState = {
    id: dragId,
    over,
    start: (id) => {
      setDragId(id);
      setOver(null);
    },
    hover: (id, zone) =>
      setOver((prev) => (prev?.id === id && prev.zone === zone ? prev : { id, zone })),
    drop: (id, zone) => {
      const page = s.activePage;
      const spot = dragId && page ? dropSpot(page, id, zone, dragId) : null;
      if (spot && dragId) moveLayer(s, dragId, spot);
      setDragId(null);
      setOver(null);
    },
    end: () => {
      setDragId(null);
      setOver(null);
    },
  };
  // Selection resolved deep (a group CHILD is invisible to the stock editor's own getter).
  const selectedIds = selectedElementsDeep(s).map((e) => e.id);
  const context = groupContextIds(children, selectedIds);

  /**
   * 줄 하나를 눌렀을 때. 캔버스와 손이 같아야 한다 — 거기서 ⇧클릭으로 여럿을 잡을 수
   * 있는데 목록에서만 한 개씩이면 같은 문서를 두 가지 규칙으로 만지는 셈이 된다.
   *
   *  - 그냥 클릭: 그 줄만. 여기가 다음 범위의 기준점이 된다.
   *  - ⇧클릭: 기준점부터 여기까지 통째로(피그마와 같다).
   *  - ⌘/Ctrl 클릭: 그 줄만 넣거나 뺀다.
   */
  const onSelect = (id: string, mods: { shift: boolean; meta: boolean }) => {
    if (mods.shift) {
      s.selectElements(rangeIds(rows, anchorId, id));
      // 기준점은 그대로 둔다 — 범위를 잡았다 놨다 하며 늘릴 수 있어야 한다.
      return;
    }
    if (mods.meta) {
      s.selectElements(toggleId(selectedIds, id));
      setAnchorId(id);
      return;
    }
    s.selectElements([id]);
    setAnchorId(id);
  };

  // Selecting a group (in the tree or on the canvas) opens it, and opening is
  // sticky — we only ADD the path-to-selection to the open set, never remove — so
  // picking another group can't collapse one you already opened.
  const selectionKey = selectedIds.join(",");
  useEffect(() => {
    const want = selectionExpandIds(children, selectedIds);
    if (!want.size) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of want) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // `children`/`selectedIds` are fresh every render; the selection string is the
    // real trigger, so key the effect on it alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 text-[11px] font-dpe-semibold uppercase tracking-[0.06em] text-dpe-ink-400">
        <span>{t("detailPage.layers.title")}</span>
        {/* 머리글 숫자는 **맨 위 층의 줄 수**다. 그룹을 펴면 줄은 늘지만 레이어 수는
            그대로다 — 펼침 상태에 따라 숫자가 오르내리면 그건 개수가 아니다. */}
        <span className="tabular-nums text-dpe-ink-300">
          {rows.filter((row) => row.depth === 0).length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-dpe-ink-400">
            {t("detailPage.layers.empty")}
          </p>
        ) : (
          rows.map(({ el, depth }) => (
            <LayerRow
              key={el.id}
              el={el}
              depth={depth}
              store={s}
              expanded={expanded}
              onToggle={toggle}
              onSelect={onSelect}
              context={context}
              drag={drag}
            />
          ))
        )}
      </div>
    </div>
  );
});
DetailPageLayersPanel.displayName = "DetailPageLayersPanel";
