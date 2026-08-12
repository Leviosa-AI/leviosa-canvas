"use client";

import { useMemo, useState } from "react";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PanelSearchInput } from "./panel-search-input";
import { insertShape } from "../../lib/detail-page/insert-shape";
import {
  BASIC_SHAPES,
  NATIVE_SHAPE_IDS,
  SHAPE_CATEGORIES,
  SHAPE_FILL,
  shapeMarkup,
  shapeMatches,
  type BasicShape,
} from "../../lib/detail-page/basic-shapes";

/**
 * 기본 도형 — 스톡 `ElementsSection`의 도형/선 그리드를 대신한다.
 *
 * 네모와 동그라미는 **네이티브 `figure`**로 넣는다(색·모서리·그림자를 우측 패널이 바로
 * 만진다). 나머지는 `svg`로 넣는다 — 우리 렌더러가 아는 `subType`은 네모와 타원 둘뿐이고,
 * 나머지를 subType으로 늘리면 **문서 포맷이 갈라진다**(하드룰 2: Canvas JSON이 계약).
 * svg는 양쪽 렌더러가 모두 그대로 그린다.
 *
 * 카탈로그와 검색 사전은 `@/lib/detail-page/basic-shapes`에 있다 — 캔버스를 모르는
 * 순수 목록이라 렌더 없이 테스트할 수 있다.
 *
 * 검색은 아이콘과 달리 **서버를 안 탄다.** 목록이 70개 고정이라 브라우저에서 거르는
 * 편이 빠르고, 오프라인에서도 산다.
 */

type PageLike = {
  computedWidth: number;
  computedHeight: number;
  addElement: (opts: Record<string, unknown>) => unknown;
};
type StoreLike = { activePage?: PageLike; pages: PageLike[] };

export function insertFigure(
  store: unknown,
  patch: Record<string, unknown>,
): void {
  const s = store as StoreLike;
  const page = s.activePage ?? s.pages[0];
  if (!page) return;
  const size = Math.round(Math.min(page.computedWidth * 0.28, 260));
  page.addElement({
    type: "figure",
    subType: "rect",
    fill: SHAPE_FILL,
    width: size,
    height: size,
    x: Math.round((page.computedWidth - size) / 2),
    y: Math.round((page.computedHeight - size) / 2),
    ...patch,
  });
}

const FIGURE_PATCH: Record<string, Record<string, unknown>> = {
  rect: {},
  rounded: { cornerRadius: 24 },
  circle: { subType: "circle" },
};

const CELL =
  "flex aspect-square items-center justify-center rounded-lg border border-neutral-200 p-2 hover:border-neutral-400";

function FigureCell({ id, store }: { id: string; store: unknown }) {
  const { t } = useTranslation("branding");
  return (
    <button
      type="button"
      onClick={() => insertFigure(store, FIGURE_PATCH[id] ?? {})}
      title={t("detailPage.shapes.insertHint")}
      aria-label={t(`detailPage.shapes.basic.${id}`)}
      className={CELL}
    >
      <span
        aria-hidden="true"
        className="block h-7 w-7 bg-neutral-300"
        style={{
          borderRadius: id === "circle" ? "9999px" : id === "rounded" ? 8 : 0,
        }}
      />
    </button>
  );
}

function ShapeCell({ shape, store }: { shape: BasicShape; store: unknown }) {
  const { t } = useTranslation("branding");
  const markup = shapeMarkup(shape);
  return (
    <button
      type="button"
      onClick={() => insertShape(store, markup, shape.viewBox)}
      title={t("detailPage.shapes.insertHint")}
      aria-label={t(`detailPage.shapes.basic.${shape.id}`)}
      className={CELL}
    >
      <span
        aria-hidden="true"
        className="block h-7 w-7 [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </button>
  );
}

export function DetailPageBasicShapes({ store }: { store: unknown }) {
  const { t } = useTranslation("branding");
  const [query, setQuery] = useState("");

  const found = useMemo(() => {
    const text = query.trim();
    if (!text) return null;
    return {
      figures: NATIVE_SHAPE_IDS.filter((id) => shapeMatches(id, text)),
      shapes: BASIC_SHAPES.filter((shape) => shapeMatches(shape.id, text)),
    };
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3">
        <PanelSearchInput
          value={query}
          onChange={setQuery}
          placeholder={t("detailPage.shapes.searchPlaceholder")}
          label={t("detailPage.shapes.searchLabel")}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {found ? (
          found.figures.length + found.shapes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-neutral-400">
              <ImageOff aria-hidden="true" size={20} />
              <p className="text-xs">{t("detailPage.shapes.searchEmpty")}</p>
            </div>
          ) : (
            // 검색 중에는 갈래 제목을 안 세운다 — 두세 개짜리 묶음이 일곱 개면
            // 결과보다 제목이 더 많아진다.
            <div className="grid grid-cols-4 gap-2">
              {found.figures.map((id) => (
                <FigureCell key={id} id={id} store={store} />
              ))}
              {found.shapes.map((shape) => (
                <ShapeCell key={shape.id} shape={shape} store={store} />
              ))}
            </div>
          )
        ) : (
          SHAPE_CATEGORIES.map((category) => {
            const shapes = BASIC_SHAPES.filter((shape) => shape.category === category);
            if (!shapes.length) return null;
            return (
              <div key={category} className="mb-4 last:mb-0">
                <p className="mb-2 text-xs font-medium text-neutral-500">
                  {t(`detailPage.shapes.categories.${category}`)}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {category === "basic"
                    ? NATIVE_SHAPE_IDS.map((id) => (
                        <FigureCell key={id} id={id} store={store} />
                      ))
                    : null}
                  {shapes.map((shape) => (
                    <ShapeCell key={shape.id} shape={shape} store={store} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
