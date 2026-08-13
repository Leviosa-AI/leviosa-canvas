"use client";

import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import { Redo2, Undo2 } from "lucide-react";

import {
  safeRedo,
  safeUndo,
  type HistoryStore,
} from "./editor-history";

/**
 * 되돌리기 / 다시 실행 버튼. Canvas store의 관측 가능한 ``history.canUndo`` /
 * ``history.canRedo``를 읽어 비활성 상태를 반응형으로 갱신하고, 클릭 시
 * 되돌리기/다시 실행을 실행한다. 실제 호출은 ``safeUndo`` / ``safeRedo``를 거치는데,
 * 선택이 살아 있는 채로 undo하면 스톡 편집기가 MST assertion으로 죽기 때문이다
 * (editor-history.ts 참고). 단축키(⌘/Ctrl+Z 등)는 ``EditorHotkeys``가 처리한다.
 */

type HistoryStoreLike = {
  history: {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
  };
};

function HistoryButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-9 w-9 items-center justify-center rounded-dpe-md transition-colors",
        disabled
          ? "cursor-not-allowed text-dpe-ink-300"
          : "text-dpe-ink-600 hover:bg-dpe-ink-100 hover:text-dpe-ink-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export const DetailPageHistoryButtons = observer(function DetailPageHistoryButtons({
  store,
}: {
  store: unknown;
}) {
  const { t } = useTranslation("branding");
  const { history } = store as HistoryStoreLike;
  const s = store as HistoryStore;
  return (
    <div className="flex items-center">
      <HistoryButton
        label={t("editor.undo")}
        onClick={() => safeUndo(s)}
        disabled={!history.canUndo}
      >
        <Undo2 size={17} />
      </HistoryButton>
      <HistoryButton
        label={t("editor.redo")}
        onClick={() => safeRedo(s)}
        disabled={!history.canRedo}
      >
        <Redo2 size={17} />
      </HistoryButton>
    </div>
  );
});
DetailPageHistoryButtons.displayName = "DetailPageHistoryButtons";
