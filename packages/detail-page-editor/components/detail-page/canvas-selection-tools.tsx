"use client";

/**
 * 고른 것에 딸린 도구들을 한 자리에 모은다 — 띠, 그 아래 열리는 창, 그리고 자르기.
 *
 * 무엇을 띄울지는 `lib/detail-page/selection-actions.ts`가 정하고(그려 보지 않고 잴 수
 * 있게), 자리 잡기는 `selection-quick-toolbar.tsx`가, 실제 편집 부품은 우측 패널이
 * 쓰던 것을 그대로 부른다. 여기서는 **잇기만** 한다.
 */

import { useCallback, useEffect, useState, type RefObject } from "react";
import { Crop, Eraser, MoreHorizontal, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { observer } from "./canvas-observer";
import { CANVAS_MENU_ICONS } from "./canvas-context-menu";
import { ImageCropOverlay, type CropElement } from "./image-crop-overlay";
import {
  SelectionQuickToolbar,
  useQuickPopoverPlacement,
  type QuickToolbarItem,
} from "./selection-quick-toolbar";
import { selectedElementsDeep, type SelectableElement } from "./detail-page-selection";
import { useEditorAi } from "./editor-ai-context";
import {
  BgRemoveSection,
  ElementAiEditPanel,
} from "./detail-page-properties-panel";
import {
  quickActions,
  type ActionElement,
  type QuickActionId,
} from "../../lib/detail-page/selection-actions";
import {
  canvasMenuItems,
  runCanvasMenuAction,
  type CanvasMenuStore,
} from "../../lib/detail-page/canvas-menu";

type ToolStore = CanvasMenuStore & {
  selectedElements?: SelectableElement[];
  selectedElementsIds?: string[];
  getElementById?: (id: string) => SelectableElement | undefined;
};

/**
 * 창 하나. 안에 들어가는 것은 우측 패널이 쓰던 부품 그대로다.
 *
 * 붙는 자리는 띠가 정한다(`useQuickPopoverPlacement`). 아래가 좁으면 위로 뒤집고,
 * 높이는 그 자리에 실제로 남은 만큼으로 잘린다 — 넘치는 만큼은 스스로 스크롤한다.
 * 60vh·520px 상한은 그대로 두되, 남은 자리가 더 좁으면 그쪽이 이긴다.
 */
function Popover({
  children,
  width = 360,
}: {
  children: React.ReactNode;
  width?: number;
}) {
  const { side, maxHeight } = useQuickPopoverPlacement();
  return (
    <div
      data-dp-quick-popover=""
      data-dp-quick-popover-side={side}
      style={{ width, maxHeight: `min(60vh, 520px, ${maxHeight}px)` }}
      className={[
        "overflow-y-auto rounded-le-xl border border-le-ink-200 bg-le-surface shadow-lg",
        side === "above" ? "absolute bottom-full left-0 mb-1.5" : "mt-1.5",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export const CanvasSelectionTools = observer(function CanvasSelectionTools({
  store,
  containerRef,
  scrollRef,
}: {
  store: unknown;
  containerRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation("branding");
  const s = store as ToolStore;
  const ai = useEditorAi();
  const els = selectedElementsDeep(s);
  const key = els.map((el) => el.id).join(",");
  const [open, setOpen] = useState<QuickActionId | null>(null);
  const [cropId, setCropId] = useState<string | null>(null);

  // 고른 것이 바뀌면 열려 있던 창은 남의 요소를 만지게 된다 — 닫는다.
  useEffect(() => {
    setOpen(null);
    setCropId(null);
  }, [key]);

  const closeCrop = useCallback(() => setCropId(null), []);

  const actions = quickActions(els as unknown as ActionElement[], {
    hasGeneration: Boolean(ai.generatedId),
    canRemoveBackground: Boolean(ai.onRemoveBackground),
  });

  const single = els.length === 1 ? els[0] : null;
  const cropTarget = cropId
    ? ((s.getElementById?.(cropId) ?? null) as CropElement | null)
    : null;

  const toggle = (id: QuickActionId) => setOpen((prev) => (prev === id ? null : id));

  const label: Record<QuickActionId, string> = {
    crop: t("detailPage.quickToolbar.crop"),
    bgRemove: t("detailPage.quickToolbar.bgRemove"),
    promptEdit: t("detailPage.quickToolbar.promptEdit"),
    more: t("detailPage.quickToolbar.more"),
  };

  const items: QuickToolbarItem[] = actions.map((id) => {
    if (id === "crop") {
      return {
        key: id,
        label: label[id],
        icon: <Crop aria-hidden="true" size={15} />,
        onClick: () => {
          setOpen(null);
          if (single) setCropId(single.id);
        },
      };
    }
    if (id === "bgRemove") {
      return {
        key: id,
        label: label[id],
        icon: <Eraser aria-hidden="true" size={15} />,
        active: open === id,
        onClick: () => toggle(id),
      };
    }
    if (id === "promptEdit") {
      return {
        key: id,
        label: label[id],
        icon: <Sparkles aria-hidden="true" size={15} className="text-le-ai" />,
        active: open === id,
        onClick: () => toggle(id),
      };
    }
    return {
      key: id,
      label: label[id],
      icon: <MoreHorizontal aria-hidden="true" size={16} />,
      active: open === id,
      separated: actions.length > 1,
      onClick: () => toggle(id),
    };
  });

  // 자르는 동안에는 띠를 숨긴다 — 자르기 줄이 그 자리에 뜬다.
  if (cropTarget) {
    return (
      <ImageCropOverlay
        el={cropTarget}
        containerRef={containerRef}
        scrollRef={scrollRef}
        onClose={closeCrop}
      />
    );
  }

  return (
    <SelectionQuickToolbar
      els={els}
      items={items}
      containerRef={containerRef}
      scrollRef={scrollRef}
    >
      {open === "promptEdit" ? (
        <Popover>
          <ElementAiEditPanel
            store={s as never}
            els={els as never}
          />
        </Popover>
      ) : null}

      {open === "bgRemove" && single && ai.onRemoveBackground ? (
        <Popover width={300}>
          <BgRemoveSection
            el={single as never}
            onRemove={ai.onRemoveBackground}
            creditCost={ai.bgRemoveCreditCost}
          />
        </Popover>
      ) : null}

      {open === "more" ? (
        <Popover width={200}>
          <div role="menu" className="py-1">
            {canvasMenuItems(s).map((item) => {
              const Icon = CANVAS_MENU_ICONS[item.action];
              return (
                <div key={item.action}>
                  {item.separated ? (
                    <div className="my-1 border-t border-le-ink-100" />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    data-dp-quick-menu-action={item.action}
                    disabled={item.disabled}
                    onClick={() => {
                      runCanvasMenuAction(s, item.action);
                      setOpen(null);
                    }}
                    className="flex h-[30px] w-full items-center gap-2.5 px-3 text-left text-[13px] text-le-ink-700 transition-colors hover:bg-le-ink-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Icon size={14} className="shrink-0 text-le-ink-500" />
                    {t(`detailPage.canvasMenu.${item.action}`)}
                  </button>
                </div>
              );
            })}
          </div>
        </Popover>
      ) : null}
    </SelectionQuickToolbar>
  );
});
CanvasSelectionTools.displayName = "CanvasSelectionTools";
