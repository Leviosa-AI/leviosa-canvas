// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
"use client";

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * 지우기 전에 한 번 묻는 버튼.
 *
 * 서버 자산·화면처럼 되돌릴 수 없는(또는 되돌리기 번거로운) 것을 한 번 눌러 지우면
 * 휴지통 아이콘을 스치기만 해도 사라진다. `window.confirm` 은 쓰지 않는다 — 앱 크롬
 * 밖의 OS 대화상자가 뜨고, 호스트에 확인 대화상자 계약도 없다. 대신 그 자리에서
 * «삭제? 확인 / 취소» 로 바뀐다.
 */
export function ConfirmDeleteButton({
  label,
  onConfirm,
  disabled,
  className,
  confirmClassName = "",
  children,
}: {
  /** 휴지통 버튼의 이름(aria-label·title). */
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  /** 묻는 동안의 자리. 평소 버튼이 호버에만 보이는 자리라면 여기서 늘 보이게 한다. */
  confirmClassName?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("branding");
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setAsking(true);
        }}
        className={className}
      >
        {children}
      </button>
    );
  }

  return (
    <span
      role="group"
      aria-label={label}
      // 줄·카드 자체의 클릭(선택·삽입)으로 새지 않게 막는다.
      onClick={(event) => event.stopPropagation()}
      className={`flex items-center gap-1 rounded-le-md border border-le-ink-200 bg-le-surface px-1.5 py-0.5 text-[11px] shadow-sm ${confirmClassName}`}
    >
      <span className="text-le-ink-600">{t("detailPage.confirmDelete.ask")}</span>
      <button
        type="button"
        autoFocus
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        className="font-le-semibold text-le-danger-600 hover:underline"
      >
        {t("detailPage.confirmDelete.confirm")}
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="text-le-ink-500 hover:underline"
      >
        {t("detailPage.confirmDelete.cancel")}
      </button>
    </span>
  );
}
