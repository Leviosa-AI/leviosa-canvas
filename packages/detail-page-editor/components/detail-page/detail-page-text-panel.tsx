"use client";

import { useTranslation } from "react-i18next";

import { documentFontFamily } from "../../lib/detail-page/spec-group/sync";
import type { StoreLike } from "../../lib/detail-page/spec-group/sync";
import {
  REFERENCE_WIDTH,
  TEXT_PRESETS,
  insertTextPreset,
  type TextPreset,
} from "../../lib/detail-page/text-presets";

/**
 * "텍스트" 패널 — 스톡 `TextSection`을 대신한다.
 *
 * 위: 크기별 글상자 하나. 아래: **여러 줄이 한 덩어리로 들어가는 프리셋**.
 * 스톡 패널도 아래쪽에 같은 성격의 격자를 달고 있었지만 벤더 서버에서 받아 오는
 * 영문 포스터 디자인이라 우리 상세페이지에 쓸 자리가 없었다 — 짜임을 우리 것으로
 * 다시 적었다(`lib/detail-page/text-presets.ts`).
 *
 * 넣는 글자는 **문서에서 가장 많이 쓰인 서체**로 들어간다(표·차트와 같은 규칙).
 * 서체·색은 넣은 뒤 우측 인스펙터에서 고른다 — 여기서 미리 고르게 하면 같은 일을
 * 두 군데서 하게 된다.
 */

type PageLike = {
  computedWidth: number;
  computedHeight: number;
  addElement: (opts: Record<string, unknown>) => unknown;
};

type Preset = {
  key: string;
  fontSize: number;
  fontWeight: number;
  /** 미리보기에 쓰는 화면 크기(실제 삽입 크기와 별개). */
  previewSize: number;
};

const PRESETS: Preset[] = [
  { key: "heading", fontSize: 48, fontWeight: 700, previewSize: 22 },
  { key: "subheading", fontSize: 28, fontWeight: 600, previewSize: 17 },
  { key: "body", fontSize: 18, fontWeight: 400, previewSize: 14 },
  { key: "caption", fontSize: 13, fontWeight: 400, previewSize: 12 },
];

/** 미리보기 칸의 폭(px). 프리셋 좌표를 이 폭에 맞춰 줄인다. */
const PREVIEW_WIDTH = 232;

export function insertText(
  store: unknown,
  text: string,
  { fontSize, fontWeight }: { fontSize: number; fontWeight: number },
): void {
  const s = store as { activePage?: PageLike; pages: PageLike[] };
  const page = s.activePage ?? s.pages[0];
  if (!page) return;
  const width = Math.round(page.computedWidth * 0.7);
  // 한 줄 높이는 폰트 크기의 1.3배 — 넣자마자 상자가 글자를 자르지 않게.
  const height = Math.round(fontSize * 1.3);
  page.addElement({
    type: "text",
    text,
    fontFamily: "Pretendard",
    fontSize,
    fontWeight,
    fill: "#111111",
    align: "center",
    width,
    height,
    x: Math.round((page.computedWidth - width) / 2),
    y: Math.round((page.computedHeight - height) / 2),
  });
}

/**
 * 프리셋 미리보기.
 *
 * 별도 자산이 아니라 **카탈로그를 그대로 축소해** 그린다 — 프리셋을 고치면 미리보기가
 * 저절로 따라오고, 목록과 실제 결과가 어긋나지 않는다.
 */
function PresetPreview({
  preset,
  label,
}: {
  preset: TextPreset;
  label: (nodeKey: string) => string;
}) {
  const scale = PREVIEW_WIDTH / REFERENCE_WIDTH;
  return (
    <div
      aria-hidden="true"
      className="relative w-full"
      style={{ height: preset.height * scale }}
    >
      {preset.nodes.map((node) => (
        <div
          key={node.key}
          className="absolute truncate"
          style={{
            top: node.y * scale,
            left: (node.x ?? 0) * scale,
            width: (node.width ?? REFERENCE_WIDTH) * scale,
            fontSize: Math.max(7, node.fontSize * scale),
            fontWeight: node.fontWeight,
            color: node.fill ?? "#111111",
            textAlign: node.align,
            letterSpacing: node.letterSpacing
              ? node.letterSpacing * scale
              : undefined,
          }}
        >
          {label(node.key)}
        </div>
      ))}
    </div>
  );
}

export function DetailPageTextPanel({ store }: { store: unknown }) {
  const { t } = useTranslation("branding");

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
      {PRESETS.map((preset) => {
        const label = t(`detailPage.text.${preset.key}`);
        return (
          <button
            key={preset.key}
            type="button"
            onClick={() =>
              insertText(store, label, {
                fontSize: preset.fontSize,
                fontWeight: preset.fontWeight,
              })
            }
            className="rounded-lg border border-neutral-200 px-3 py-3 text-left text-neutral-900 hover:border-neutral-400"
            style={{
              fontSize: preset.previewSize,
              fontWeight: preset.fontWeight,
            }}
          >
            {label}
          </button>
        );
      })}

      <p className="mt-2 px-1 text-xs font-medium text-neutral-500">
        {t("detailPage.textPresets.title")}
      </p>
      {TEXT_PRESETS.map((preset) => {
        const label = (nodeKey: string) =>
          t(`detailPage.textPresets.${preset.key}.${nodeKey}`);
        return (
          <button
            key={preset.key}
            type="button"
            title={t(`detailPage.textPresets.${preset.key}.name`)}
            onClick={() =>
              insertTextPreset(store as StoreLike, preset, {
                text: label,
                fontFamily: documentFontFamily(store as StoreLike),
                name: t(`detailPage.textPresets.${preset.key}.name`),
              })
            }
            className="rounded-lg border border-neutral-200 px-3 py-3 hover:border-neutral-400"
          >
            <PresetPreview preset={preset} label={label} />
          </button>
        );
      })}

      <p className="mt-1 px-1 text-xs leading-relaxed text-neutral-500">
        {t("detailPage.text.hint")}
      </p>
    </div>
  );
}
