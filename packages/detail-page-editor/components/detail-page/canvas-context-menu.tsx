"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Group,
  Lock,
  Paintbrush,
  PaintBucket,
  Trash2,
  Ungroup,
  Unlock,
  type LucideIcon,
} from "lucide-react";

import { frontmostPath, type DrillElement } from "./group-drill-in";
import { konvaClientRect } from "./element-rects";
import {
  canvasMenuItems,
  runCanvasMenuAction,
  type CanvasMenuAction,
  type CanvasMenuStore,
} from "../../lib/detail-page/canvas-menu";

/**
 * 캔버스 우클릭 메뉴.
 *
 * 스톡 편집기의 ``<Page>``는 ``contextmenu``를 안 단다 — 스톡 ``<Workspace>``가 달던 것이고
 * 우리는 그걸 갈아치웠다(``stacked-canvas-workspace.tsx``). 그래서 워크스페이스
 * 컨테이너에 우리가 직접 단다.
 *
 * 어느 요소를 대상으로 삼는지는 **스톡 편집기의 좌클릭과 같은 규칙**을 따른다: 커서 아래
 * 최상위 요소. 다만 이미 그 안쪽(드릴인한 자식)이 선택돼 있으면 선택을 안 건드린다 —
 * 그룹 안 도형을 골라 놓고 우클릭했는데 그룹으로 되돌아가면 메뉴가 남의 것을 만진다.
 *
 * 히트테스트는 ``GroupDrillIn``의 ``frontmostPath``를 그대로 쓴다. 스톡 편집기가 Konva
 * 그룹에 요소 id를 안 박기 때문에 잎(leaf)부터 찾아 올라가야 한다.
 */

type MenuStore = CanvasMenuStore & {
  pages?: Array<{ id: string; children?: DrillElement[] }>;
  selectElements?: (ids: string[]) => void;
};

const ICONS: Record<CanvasMenuAction, LucideIcon> = {
  duplicate: Copy,
  lock: Lock,
  unlock: Unlock,
  delete: Trash2,
  copyFormat: Paintbrush,
  pasteFormat: PaintBucket,
  front: ChevronsUp,
  forward: ChevronUp,
  backward: ChevronDown,
  back: ChevronsDown,
  group: Group,
  ungroup: Ungroup,
};

const MENU_WIDTH = 200;
/** 화면 밖으로 안 나가게 미는 여백. */
const EDGE = 8;

/** 커서 자리에서 시작하되, 뷰포트를 넘으면 안쪽으로 당긴다. */
export function menuPosition(
  point: { x: number; y: number },
  viewport: { width: number; height: number },
  size: { width: number; height: number },
): { left: number; top: number } {
  const left = Math.max(
    EDGE,
    Math.min(point.x, viewport.width - size.width - EDGE),
  );
  const top = Math.max(
    EDGE,
    Math.min(point.y, viewport.height - size.height - EDGE),
  );
  return { left, top };
}

/**
 * 우클릭이 가리키는 요소 id. 선택을 안 바꿔도 되면 null.
 *
 * 커서 아래 아무것도 없으면 ``{ hit: false }`` — 메뉴를 안 연다.
 */
export function contextTarget(
  pages: ReadonlyArray<{ children?: DrillElement[] }>,
  rectOf: (id: string) => { left: number; top: number; right: number; bottom: number } | null,
  point: { x: number; y: number },
  selectedIds: ReadonlyArray<string>,
): { hit: boolean; select: string | null } {
  for (const page of pages) {
    const path = frontmostPath(page.children ?? [], rectOf, point);
    if (!path) continue;
    const top = path[0];
    // 선택이 이미 이 최상위 요소 안에 있으면 그대로 둔다(드릴인·다중선택 보존).
    const inside = new Set<string>();
    const collect = (el: DrillElement) => {
      inside.add(el.id);
      for (const c of el.children ?? []) collect(c);
    };
    collect(top);
    if (selectedIds.some((id) => inside.has(id))) return { hit: true, select: null };
    return { hit: true, select: top.id };
  }
  return { hit: false, select: null };
}

export const CanvasContextMenu = observer(function CanvasContextMenu({
  store,
  containerRef,
}: {
  store: unknown;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation("branding");
  const s = store as MenuStore;
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const close = useCallback(() => setAt(null), []);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const onContextMenu = (e: MouseEvent) => {
      const point = { x: e.clientX, y: e.clientY };
      const target = contextTarget(
        s.pages ?? [],
        konvaClientRect,
        point,
        s.selectedElementsIds ?? [],
      );
      if (!target.hit) {
        // 빈 캔버스: 브라우저 기본 메뉴에 맡긴다(새로고침·검사 등이 여전히 쓸모 있다).
        setAt(null);
        return;
      }
      e.preventDefault();
      if (target.select) s.selectElements?.([target.select]);
      setAt(point);
    };

    host.addEventListener("contextmenu", onContextMenu);
    return () => host.removeEventListener("contextmenu", onContextMenu);
  }, [s, containerRef]);

  // 스크롤·줌·리사이즈로 캔버스가 움직이면 메뉴가 엉뚱한 자리를 가리킨다 — 닫는다.
  useEffect(() => {
    if (!at) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close);
    };
  }, [at, close]);

  const items = at ? canvasMenuItems(s) : [];
  if (!at || items.length === 0) return null;

  // 항목 높이 30 + 구분선 9 + 상하 여백 8. 실측 대신 계산으로 충분하다(살짝 어긋나도
  // 화면 안이면 그만).
  const height =
    items.length * 30 + items.filter((i) => i.separated).length * 9 + 8;
  const { left, top } = menuPosition(
    at,
    { width: window.innerWidth, height: window.innerHeight },
    { width: MENU_WIDTH, height },
  );

  // 워크스페이스 **바깥**(body)에 그린다. 안에 두면 배경막을 누르는 pointerdown이
  // GroupDrillIn의 캡처 리스너에 먼저 걸려, 메뉴를 닫으려는 클릭이 그룹 안 도형을
  // 골라 버린다. 어차피 fixed 배치라 DOM 위치는 상관없다.
  return createPortal(
    <>
      {/* 바깥 아무 데나 누르면 닫힌다. 우클릭도 잡아야 메뉴가 겹쳐 뜨지 않는다. */}
      <div
        data-dp-menu-backdrop
        className="fixed inset-0 z-[70]"
        onPointerDown={close}
        onContextMenu={(e) => {
          e.preventDefault();
          close();
        }}
      />
      <div
        role="menu"
        data-dp-canvas-menu
        style={{ left, top, width: MENU_WIDTH }}
        className="fixed z-[71] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
      >
        {items.map((item) => {
          const Icon = ICONS[item.action];
          const label = t(`detailPage.canvasMenu.${item.action}`);
          return (
            <div key={item.action}>
              {item.separated ? (
                <div className="my-1 border-t border-neutral-100" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                data-dp-menu-action={item.action}
                disabled={item.disabled}
                onClick={() => {
                  runCanvasMenuAction(s, item.action);
                  close();
                }}
                className="flex h-[30px] w-full items-center gap-2.5 px-3 text-left text-[13px] text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Icon size={14} className="shrink-0 text-neutral-500" />
                {label}
              </button>
            </div>
          );
        })}
      </div>
    </>,
    document.body,
  );
});
