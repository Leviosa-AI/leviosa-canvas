"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { encodeSvgDataUri } from "../../lib/detail-page-canvas/export/svg";
import { insertShape } from "../../lib/detail-page/insert-shape";
import { rememberElement } from "../../lib/detail-page/element-recents";
import { ean13Svg, qrCodeSvg } from "../../lib/detail-page/qr-code";
import { ColorInput } from "../cardnews/color-input";

/**
 * "요소 · QR" 그룹 — QR 코드와 EAN-13 바코드.
 *
 * **서버도 크레딧도 안 든다.** 전부 브라우저 안에서 SVG로 만들어 도형과 같은 길
 * (`insertShape`)로 넣는다. 그래서 우측 색 컨트롤도 그대로 붙는다.
 *
 * 미리보기와 실제 삽입이 **같은 마크업**을 쓴다 — 눌러 보고 다른 것이 나오면 안 된다
 * (기본 도형 패널이 세운 규칙과 같다).
 */

type CodeKind = "qr" | "ean13";

export function DetailPageQrPanel({ store }: { store: unknown }) {
  const { t } = useTranslation("branding");
  const [kind, setKind] = useState<CodeKind>("qr");
  const [value, setValue] = useState("");
  const [foreground, setForeground] = useState("#111111");
  const [background, setBackground] = useState("#ffffff");

  const built = useMemo((): {
    markup: string;
    viewBox: string;
    /** EAN-13일 때만 — 검증번호까지 채운 실제 값. */
    value?: string;
  } | null => {
    const colors = { foreground, background };
    return kind === "qr" ? qrCodeSvg(value, colors) : ean13Svg(value, colors);
  }, [kind, value, foreground, background]);

  const trimmed = value.trim();
  const invalid = trimmed.length > 0 && built === null;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div role="group" aria-label={t("detailPage.qr.kindLabel")} className="flex rounded-le-md border border-le-ink-200 p-0.5">
        {(["qr", "ean13"] as const).map((option) => {
          const active = option === kind;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => setKind(option)}
              className={`flex-1 rounded px-2 py-1 text-[11px] font-le-medium transition-colors ${
                active ? "bg-le-ink-900 text-le-on-accent" : "text-le-ink-500 hover:bg-le-ink-100"
              }`}
            >
              {t(option === "qr" ? "detailPage.qr.kindQr" : "detailPage.qr.kindEan")}
            </button>
          );
        })}
      </div>

      <label className="grid gap-1 text-[11px] font-le-medium text-le-ink-500">
        {t(kind === "qr" ? "detailPage.qr.valueLabel" : "detailPage.qr.eanLabel")}
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t(
            kind === "qr" ? "detailPage.qr.valuePlaceholder" : "detailPage.qr.eanPlaceholder",
          )}
          inputMode={kind === "ean13" ? "numeric" : "text"}
          className="rounded-le-lg border border-le-ink-200 px-2.5 py-2 text-sm placeholder:text-le-ink-400 focus:border-le-ink-400 focus:outline-none"
        />
      </label>

      {invalid ? (
        <p className="text-xs text-le-danger-600">
          {t(kind === "qr" ? "detailPage.qr.qrInvalid" : "detailPage.qr.eanInvalid")}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-[11px] font-le-medium text-le-ink-500">
          {t("detailPage.qr.foreground")}
          <ColorInput value={foreground} onChange={setForeground} />
        </label>
        <label className="grid gap-1 text-[11px] font-le-medium text-le-ink-500">
          {t("detailPage.qr.background")}
          <ColorInput value={background} onChange={setBackground} />
        </label>
      </div>

      <div className="flex min-h-24 items-center justify-center rounded-le-lg border border-dashed border-le-ink-200 p-3">
        {built ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={encodeSvgDataUri(built.markup)}
            alt={t("detailPage.qr.previewAlt")}
            className="max-h-40 max-w-full object-contain"
          />
        ) : (
          <p className="text-xs text-le-ink-400">{t("detailPage.qr.previewEmpty")}</p>
        )}
      </div>

      {/* EAN-13은 12자리를 넣으면 체크디짓을 채워 준다. 무엇이 들어갔는지 보여 준다. */}
      {built?.value ? (
        <p className="text-center text-xs tabular-nums text-le-ink-500">{built.value}</p>
      ) : null}

      <button
        type="button"
        disabled={!built}
        onClick={() => {
          if (!built) return;
          insertShape(store, built.markup, built.viewBox);
          rememberElement({
            key: `${kind}:${trimmed}`,
            markup: built.markup,
            viewBox: built.viewBox,
            label: trimmed,
          });
        }}
        className="rounded-le-lg bg-le-ink-900 px-3 py-2 text-sm font-le-semibold text-le-on-accent hover:bg-le-ink-800 disabled:cursor-not-allowed disabled:bg-le-ink-200 disabled:text-le-ink-400"
      >
        {t("detailPage.qr.insert")}
      </button>

      <p className="mt-auto px-1 text-[11px] leading-relaxed text-le-ink-500">
        {t("detailPage.qr.hint")}
      </p>
    </div>
  );
}
