"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, QrCode, Shapes, Smile, Sparkles, Table, type LucideIcon } from "lucide-react";

import { DetailPageShapesPanel } from "./detail-page-shapes-panel";
import { DetailPageDecorationsPanel } from "./detail-page-decorations-panel";
import { DetailPageChartsPanel } from "./detail-page-charts-panel";
import { DetailPageTablesPanel } from "./detail-page-tables-panel";
import { DetailPageIconsPanel } from "./detail-page-icons-panel";
import { DetailPageQrPanel } from "./detail-page-qr-panel";
import { ElementRecentsStrip } from "./element-recents-strip";

/**
 * "요소" 패널 — 도형·아이콘·QR·장식·차트·표를 한 탭 안에 접어 넣고, 위쪽 그룹 바에서 가른다.
 *
 * 레일이 14탭까지 늘어나 포화였다. 넣을 것이 아이콘·프레임까지 더 붙으면 레일 자체가
 * 스크롤되어 "어디에 뭐가 있는지"가 무너진다. 그래서 **삽입 대상이 같은 성격인 것**
 * (클릭 한 번으로 캔버스에 놓이는 벡터/데이터 요소)을 한 서랍으로 모은다. 사진·텍스트는
 * 성격이 달라 그대로 둔다 — 사진은 검색·업로드가 붙고 텍스트는 스타일 프리셋이다.
 *
 * 맨 위의 "즐겨찾기 · 최근" 스트립은 그룹과 무관하게 항상 같은 자리에 있다 — 상세페이지는
 * 같은 배지·아이콘을 20섹션 내내 반복해서 넣으므로 **검색의 절반은 다시 안 찾는 것**이다.
 * 탭이 아니라 스트립인 이유는 레일 상한(12)이다.
 */

export type ElementsGroupId =
  | "shapes"
  | "icons"
  | "qr"
  | "decorations"
  | "charts"
  | "tables";

/**
 * 그룹 바는 3열 두 줄이다. 순서가 곧 자리라서 **도형 바로 아래 칸이 장식**이 된다 —
 * 둘은 같은 열에 세로로 붙어 있어야 "도형에서 갈라져 나온 것"으로 읽힌다.
 */
const GROUPS: ReadonlyArray<{
  id: ElementsGroupId;
  labelKey: string;
  Icon: LucideIcon;
}> = [
  { id: "shapes", labelKey: "detailPage.sidebar.shapes", Icon: Shapes },
  { id: "icons", labelKey: "detailPage.sidebar.icons", Icon: Smile },
  { id: "qr", labelKey: "detailPage.sidebar.qr", Icon: QrCode },
  { id: "decorations", labelKey: "detailPage.sidebar.decorations", Icon: Sparkles },
  { id: "charts", labelKey: "detailPage.sidebar.charts", Icon: BarChart3 },
  { id: "tables", labelKey: "detailPage.sidebar.tables", Icon: Table },
];

/**
 * 마지막으로 본 그룹. 모듈 전역인 이유는 껍데기가 **열린 패널 하나만 렌더**하기
 * 때문이다 — 다른 탭에 갔다 오면 이 컴포넌트는 언마운트됐다가 새로 뜬다. 탭이 셋으로
 * 갈려 있을 때는 레일이 이 기억을 대신했으니, 접은 뒤에도 그 감각은 남겨 둔다.
 * 세션 안에서만 살면 충분해서 저장소까지 가지 않는다.
 */
let lastGroup: ElementsGroupId = "shapes";

export function DetailPageElementsPanel({
  store,
  defaultGroup,
}: {
  store: unknown;
  /** 처음 열 그룹. 안 주면 이 세션에서 마지막으로 봤던 그룹으로 돌아간다. */
  defaultGroup?: ElementsGroupId;
}) {
  const { t } = useTranslation("branding");
  const [group, setGroup] = useState<ElementsGroupId>(defaultGroup ?? lastGroup);

  const select = useCallback((next: ElementsGroupId) => {
    lastGroup = next;
    setGroup(next);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <ElementRecentsStrip store={store} />
      <div
        role="tablist"
        aria-label={t("detailPage.sidebar.elements")}
        className="grid shrink-0 grid-cols-3 gap-0.5 border-b border-neutral-200 p-2"
      >
        {GROUPS.map(({ id, labelKey, Icon }) => {
          const active = id === group;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(id)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              <Icon aria-hidden="true" size={14} />
              {t(labelKey)}
            </button>
          );
        })}
      </div>
      {/* 그룹 패널은 저마다 h-full 스크롤러라 남은 높이를 통째로 넘긴다. */}
      <div className="min-h-0 flex-1">
        {group === "shapes" ? <DetailPageShapesPanel store={store} /> : null}
        {group === "icons" ? <DetailPageIconsPanel store={store} /> : null}
        {group === "qr" ? <DetailPageQrPanel store={store} /> : null}
        {group === "decorations" ? <DetailPageDecorationsPanel store={store} /> : null}
        {group === "charts" ? <DetailPageChartsPanel store={store} /> : null}
        {group === "tables" ? <DetailPageTablesPanel store={store} /> : null}
      </div>
    </div>
  );
}
