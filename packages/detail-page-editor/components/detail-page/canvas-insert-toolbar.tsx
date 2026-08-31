"use client";

/**
 * 캔버스 아래 삽입 띠.
 *
 * 글상자 하나, 네모 하나를 넣으려고 좌측 패널을 열고 → 갈래를 찾고 → 격자에서 고르는
 * 왕복이 매번 붙었다. 가장 자주 넣는 것 둘(텍스트·기본 도형)만 손이 있는 자리로 내린다.
 * **좌측 패널을 대신하지 않는다** — 카탈로그 전체는 여전히 거기 있고, 여기 드롭다운
 * 마지막 줄이 그 자리로 데려간다.
 *
 * 넣는 셈은 좌측 패널과 **같은 함수**를 부른다(`insertText`·`insertFigure`·`insertShape`).
 * 두 벌로 적으면 크기·자리 규칙이 갈라지고, 그건 눈으로는 한참 뒤에야 보인다.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Shapes, Type as TypeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FIGURE_PATCH, insertFigure } from "./detail-page-basic-shapes";
import { TEXT_SIZE_PRESETS, insertText } from "./detail-page-text-panel";
import { insertShape } from "../../lib/detail-page/insert-shape";
import {
  BASIC_SHAPES,
  NATIVE_SHAPE_IDS,
  shapeMarkup,
} from "../../lib/detail-page/basic-shapes";

type StoreLike = {
  selectElements?: (ids: string[]) => void;
  openSidePanel?: (name: string) => void;
};

/** 띠에 내리는 도형. 카탈로그 70개 중 손이 제일 자주 가는 것만 고른다. */
const QUICK_SHAPE_IDS = ["triangle", "diamond", "pentagon", "hexagon", "ring", "pill"];

function selectInserted(store: unknown, created: unknown) {
  const id = (created as { id?: string } | null)?.id;
  if (id) (store as StoreLike).selectElements?.([id]);
}

function Menu({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      role="menu"
      className="absolute bottom-11 left-1/2 z-10 w-44 -translate-x-1/2 rounded-le-lg border border-le-ink-200 bg-le-surface py-1 shadow-lg"
    >
      {children}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-dp-insert-item={testId}
      onClick={onClick}
      className="flex h-[30px] w-full items-center gap-2 px-3 text-left text-[13px] text-le-ink-700 transition-colors hover:bg-le-ink-100"
    >
      {children}
      {label}
    </button>
  );
}

/**
 * 갈래 하나. 본체를 누르면 기본값이 바로 들어가고, 화살표를 누르면 목록이 열린다 —
 * 두 손짓을 한 버튼에 겹치면 "누르면 무엇이 나오는지"를 매번 확인하게 된다.
 */
function InsertGroup({
  label,
  icon,
  onPrimary,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: ReactNode;
  onPrimary: () => void;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        data-dp-insert-primary={label}
        onClick={onPrimary}
        className="flex h-9 items-center gap-1.5 rounded-l-le-lg px-2.5 text-[13px] font-le-medium text-le-ink-700 transition-colors hover:bg-le-ink-100 hover:text-le-ink-900"
      >
        {icon}
        {label}
      </button>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} …`}
        onClick={onToggle}
        className={[
          "flex h-9 w-6 items-center justify-center rounded-r-le-lg text-le-ink-500 transition-colors hover:bg-le-ink-100 hover:text-le-ink-900",
          open ? "bg-le-ink-100 text-le-ink-900" : "",
        ].join(" ")}
      >
        <ChevronDown aria-hidden="true" size={13} />
      </button>
      <Menu open={open}>{children}</Menu>
    </div>
  );
}

export function CanvasInsertToolbar({ store }: { store: unknown }) {
  const { t } = useTranslation("branding");
  const [open, setOpen] = useState<"text" | "shape" | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // 바깥을 누르면 닫는다. 캔버스에서 요소를 고르는 손짓과 겹치면 안 되므로 캡처가 아니라
  // 보통 단계에서 듣는다.
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const addText = (preset: (typeof TEXT_SIZE_PRESETS)[number]) => {
    selectInserted(
      store,
      insertText(store, t(`detailPage.text.${preset.key}`), {
        fontSize: preset.fontSize,
        fontWeight: preset.fontWeight,
      }),
    );
    setOpen(null);
  };

  const addFigure = (id: string) => {
    selectInserted(store, insertFigure(store, FIGURE_PATCH[id] ?? {}));
    setOpen(null);
  };

  const addShape = (id: string) => {
    const shape = BASIC_SHAPES.find((item) => item.id === id);
    if (!shape) return;
    selectInserted(store, insertShape(store, shapeMarkup(shape), shape.viewBox));
    setOpen(null);
  };

  const openPanel = (name: string) => {
    (store as StoreLike).openSidePanel?.(name);
    setOpen(null);
  };

  return (
    <div
      ref={root}
      data-dp-insert-toolbar=""
      className="flex items-center gap-0.5 rounded-le-xl border border-le-ink-200 bg-le-surface/95 px-1 py-1 shadow-md backdrop-blur-sm"
    >
      <InsertGroup
        label={t("detailPage.insert.text")}
        icon={<TypeIcon aria-hidden="true" size={15} />}
        // 기본값은 본문이다 — 가장 자주 쓰고, 크기는 넣은 뒤 우측에서 바로 고칠 수 있다.
        onPrimary={() => addText(TEXT_SIZE_PRESETS[2] ?? TEXT_SIZE_PRESETS[0])}
        open={open === "text"}
        onToggle={() => setOpen((prev) => (prev === "text" ? null : "text"))}
      >
        {TEXT_SIZE_PRESETS.map((preset) => (
          <MenuItem
            key={preset.key}
            testId={`text-${preset.key}`}
            label={t(`detailPage.text.${preset.key}`)}
            onClick={() => addText(preset)}
          />
        ))}
        <div className="my-1 border-t border-le-ink-100" />
        <MenuItem
          testId="text-panel"
          label={t("detailPage.insert.moreText")}
          onClick={() => openPanel("text")}
        />
      </InsertGroup>

      <InsertGroup
        label={t("detailPage.insert.shape")}
        icon={<Shapes aria-hidden="true" size={15} />}
        onPrimary={() => addFigure("rect")}
        open={open === "shape"}
        onToggle={() => setOpen((prev) => (prev === "shape" ? null : "shape"))}
      >
        {NATIVE_SHAPE_IDS.map((id) => (
          <MenuItem
            key={id}
            testId={`figure-${id}`}
            label={t(`detailPage.shapes.basic.${id}`)}
            onClick={() => addFigure(id)}
          >
            <span
              aria-hidden="true"
              className="block h-3.5 w-3.5 shrink-0 bg-le-ink-300"
              style={{
                borderRadius: id === "circle" ? "9999px" : id === "rounded" ? 4 : 0,
              }}
            />
          </MenuItem>
        ))}
        <div className="my-1 border-t border-le-ink-100" />
        {QUICK_SHAPE_IDS.map((id) => {
          const shape = BASIC_SHAPES.find((item) => item.id === id);
          if (!shape) return null;
          return (
            <MenuItem
              key={id}
              testId={`shape-${id}`}
              label={t(`detailPage.shapes.basic.${id}`)}
              onClick={() => addShape(id)}
            >
              <span
                aria-hidden="true"
                className="block h-3.5 w-3.5 shrink-0 [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: shapeMarkup(shape) }}
              />
            </MenuItem>
          );
        })}
        <div className="my-1 border-t border-le-ink-100" />
        <MenuItem
          testId="shape-panel"
          label={t("detailPage.insert.moreShapes")}
          onClick={() => openPanel("elements")}
        />
      </InsertGroup>
    </div>
  );
}
