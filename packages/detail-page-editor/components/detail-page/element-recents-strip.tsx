"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";

import { encodeSvgDataUri } from "../../lib/detail-page-canvas/export/svg";
import { insertShape } from "../../lib/detail-page/insert-shape";
import {
  getElementRecents,
  rememberElement,
  subscribeElementRecents,
  toggleElementPin,
  type ElementRecent,
} from "../../lib/detail-page/element-recents";

/**
 * 요소 서랍 맨 위의 "즐겨찾기 · 최근" 스트립.
 *
 * 상세페이지는 같은 배지·구분선·체크 아이콘을 20섹션 내내 반복해서 넣는다. **검색의
 * 절반은 다시 안 찾는 것**이라 서랍 어느 그룹에 있든 이 줄이 먼저 보인다.
 *
 * 탭으로 만들지 않은 이유는 레일 상한(12)이다 — 지금 11탭이고 남은 한 칸은 규격 검사
 * 몫이다. 스트립은 그룹 바 위에 한 줄로 앉아 자리를 안 먹는다.
 */

const EMPTY: ElementRecent[] = [];
/** 스냅샷은 참조가 안정적이어야 한다 — 매번 새 객체를 주면 무한 렌더가 된다. */
const SERVER_SNAPSHOT = { recent: EMPTY, pinned: EMPTY };

function useRecents() {
  return useSyncExternalStore(
    subscribeElementRecents,
    getElementRecents,
    // 서버에서는 저장소가 없다. 빈 상태로 그리고 물 주입 뒤에 채운다.
    () => SERVER_SNAPSHOT,
  );
}

export function ElementRecentsStrip({ store }: { store: unknown }) {
  const { t } = useTranslation("branding");
  const { recent, pinned } = useRecents();

  const insert = useCallback(
    (entry: ElementRecent) => {
      insertShape(store, entry.markup, entry.viewBox);
      rememberElement(entry);
    },
    [store],
  );

  // 즐겨찾기가 먼저, 그 뒤에 최근. 이미 꽂힌 것은 최근 쪽에서 뺀다.
  const pinnedKeys = new Set(pinned.map((entry) => entry.key));
  const items = [
    ...pinned.map((entry) => ({ entry, isPinned: true })),
    ...recent
      .filter((entry) => !pinnedKeys.has(entry.key))
      .map((entry) => ({ entry, isPinned: false })),
  ];

  if (!items.length) return null;

  return (
    <div className="shrink-0 border-b border-dpe-ink-200 px-2 py-2">
      <p className="mb-1.5 px-0.5 text-[11px] font-dpe-medium text-dpe-ink-500">
        {t("detailPage.recents.title")}
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {items.map(({ entry, isPinned }) => (
          <div key={entry.key} className="group relative shrink-0">
            <button
              type="button"
              onClick={() => insert(entry)}
              title={entry.label ?? entry.key}
              aria-label={entry.label ?? entry.key}
              className="flex h-11 w-11 items-center justify-center rounded-dpe-lg border border-dpe-ink-200 bg-dpe-surface p-1.5 hover:border-dpe-ink-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={encodeSvgDataUri(entry.markup)}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            </button>
            <button
              type="button"
              onClick={() => toggleElementPin(entry)}
              aria-label={t(
                isPinned ? "detailPage.recents.unpin" : "detailPage.recents.pin",
              )}
              aria-pressed={isPinned}
              className={`absolute -right-1 -top-1 rounded-full border border-dpe-ink-200 bg-dpe-surface p-0.5 transition-opacity ${
                isPinned
                  ? "text-dpe-warn-500 opacity-100"
                  : "text-dpe-ink-300 opacity-0 group-hover:opacity-100"
              }`}
            >
              <Star aria-hidden="true" size={10} fill={isPinned ? "currentColor" : "none"} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
