"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";

import {
  collectTextMatches,
  replaceInText,
  stepIndex,
  totalOccurrences,
  type SearchPage,
  type TextMatch,
} from "../../lib/detail-page/find-replace";

/**
 * ⌘F로 뜨는 찾기·바꾸기 패널.
 *
 * 좌측 사이드바에 안 넣는다 — 탭이 이미 12개다. 캔버스 우상단에 떠 있는 편이
 * "지금 문서를 훑는 중"이라는 상태와도 맞다.
 *
 * 훑기는 **요소 단위**다. Konva 캔버스에서 글자 일부만 하이라이트할 수가 없어서,
 * 같은 요소 안 두 번째 등장으로 "이동"해 봐야 화면이 그대로다. 대신 전체 등장
 * 횟수를 따로 보여 준다 — 그게 실제로 바뀔 자리 수다.
 */

type PanelElement = {
  id: string;
  text?: string;
  set?: (props: Record<string, unknown>) => void;
};

type PanelStore = {
  pages?: SearchPage[];
  getElementById?: (id: string) => PanelElement | undefined;
  selectElements?: (ids: string[]) => void;
  selectPage?: (id: string) => void;
  history?: { startTransaction?: () => void; endTransaction?: () => void };
};

/** 그 자리로 화면을 옮긴다. 섹션을 먼저 고르면 워크스페이스가 거기로 스크롤한다. */
export function revealMatch(store: PanelStore, match: TextMatch): void {
  store.selectPage?.(match.pageId);
  store.selectElements?.([match.elementId]);
}

export const FindReplacePanel = observer(function FindReplacePanel({
  store,
}: {
  store: unknown;
}) {
  const { t } = useTranslation("branding");
  const s = store as PanelStore;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [cursor, setCursor] = useState(0);

  const matches = useMemo(
    () => (open ? collectTextMatches(s.pages ?? [], query, { caseSensitive }) : []),
    // 관찰형이라 텍스트가 바뀌면 이 memo도 다시 돈다(pages는 mobx 배열).
    [s, open, query, caseSensitive],
  );
  const total = totalOccurrences(matches);
  const at = matches.length ? Math.min(cursor, matches.length - 1) : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "f" || e.shiftKey) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const step = useCallback(
    (direction: 1 | -1) => {
      const next = stepIndex(at, matches.length, direction);
      if (next == null) return;
      setCursor(next);
      revealMatch(s, matches[next]);
    },
    [at, matches, s],
  );

  const replaceOne = useCallback(() => {
    const match = matches[at];
    if (!match) return;
    const el = s.getElementById?.(match.elementId);
    if (typeof el?.text !== "string") return;
    el.set?.({ text: replaceInText(el.text, query, replacement, { caseSensitive }) });
    // 그 요소가 목록에서 빠지면 같은 자리에 다음 것이 올라온다 — cursor는 그대로 둔다.
  }, [matches, at, s, query, replacement, caseSensitive]);

  const replaceAll = useCallback(() => {
    if (!matches.length) return;
    // ⌘Z 한 번에 전부 되돌아가게 묶는다.
    s.history?.startTransaction?.();
    try {
      for (const match of matches) {
        const el = s.getElementById?.(match.elementId);
        if (typeof el?.text !== "string") continue;
        el.set?.({
          text: replaceInText(el.text, query, replacement, { caseSensitive }),
        });
      }
    } finally {
      s.history?.endTransaction?.();
    }
    setCursor(0);
  }, [matches, s, query, replacement, caseSensitive]);

  if (!open) return null;

  const field =
    "h-8 w-full rounded-md border border-neutral-200 px-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400";
  const button =
    "flex h-8 items-center justify-center rounded-md border border-neutral-200 px-2.5 text-[12px] text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      data-dp-find-replace
      className="absolute right-4 top-4 z-40 w-[292px] rounded-lg border border-neutral-200 bg-white p-3 shadow-lg"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
        if (e.key === "Enter") step(e.shiftKey ? -1 : 1);
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-neutral-500">
          {t("detailPage.findReplace.title")}
        </span>
        <button
          type="button"
          aria-label={t("detailPage.findReplace.close")}
          data-dp-find-close
          onClick={() => setOpen(false)}
          className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- ⌘F는 바로 타이핑을 기대한다 */}
        <input
          autoFocus
          data-dp-find-query
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          placeholder={t("detailPage.findReplace.findPlaceholder")}
          className={field}
        />
        <button
          type="button"
          title={t("detailPage.findReplace.caseSensitive")}
          aria-label={t("detailPage.findReplace.caseSensitive")}
          aria-pressed={caseSensitive}
          data-dp-find-case
          onClick={() => setCaseSensitive((v) => !v)}
          className={`${button} shrink-0 ${caseSensitive ? "bg-neutral-900 text-white hover:bg-neutral-900" : ""}`}
        >
          <CaseSensitive size={15} />
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          data-dp-find-replacement
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder={t("detailPage.findReplace.replacePlaceholder")}
          className={field}
        />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span
          data-dp-find-count
          data-dp-find-current={matches.length ? at + 1 : 0}
          data-dp-find-blocks={matches.length}
          data-dp-find-total={total}
          className="text-[12px] tabular-nums text-neutral-500"
        >
          {matches.length
            ? t("detailPage.findReplace.count", {
                current: at + 1,
                blocks: matches.length,
                total,
              })
            : t(query ? "detailPage.findReplace.none" : "detailPage.findReplace.idle")}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t("detailPage.findReplace.previous")}
            data-dp-find-prev
            disabled={!matches.length}
            onClick={() => step(-1)}
            className={`${button} px-1.5`}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            aria-label={t("detailPage.findReplace.next")}
            data-dp-find-next
            disabled={!matches.length}
            onClick={() => step(1)}
            className={`${button} px-1.5`}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          data-dp-find-replace-one
          disabled={!matches.length}
          onClick={replaceOne}
          className={`${button} flex-1`}
        >
          {t("detailPage.findReplace.replace")}
        </button>
        <button
          type="button"
          data-dp-find-replace-all
          disabled={!matches.length}
          onClick={replaceAll}
          className={`${button} flex-1`}
        >
          {t("detailPage.findReplace.replaceAll")}
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
        {t("detailPage.findReplace.chartHint")}
      </p>
    </div>
  );
});
