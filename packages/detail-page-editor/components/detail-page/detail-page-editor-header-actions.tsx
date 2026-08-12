"use client";

import { useState } from "react";

import { CreditBalanceButton } from "@/components/app/credit-balance-button";
import { LanguageSelect } from "@/components/app/language-select";
import { NotificationInboxButton } from "@/components/app/notifications/notification-inbox-button";

/** Shared authenticated header chrome for production and /dev-canvas editors. */
export function DetailPageEditorHeaderActions() {
  const [notificationOpen, setNotificationOpen] = useState(false);

  return (
    <>
      <CreditBalanceButton />
      <NotificationInboxButton
        open={notificationOpen}
        onOpenChange={setNotificationOpen}
      />
      <LanguageSelect iconOnly />
    </>
  );
}
