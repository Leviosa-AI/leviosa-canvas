// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DESIGN_REFERENCE_ASPECTS,
  MAX_DESIGN_REFERENCES,
  REFERENCE_ACCEPT_ATTR,
  estimateBriefCredits,
  finalizeReferenceDataUri,
  planReferenceTokens,
  readReferenceFile,
  type DesignReferenceAspect,
} from "../../lib/detail-page/design-reference";
import { useDetailPageHost } from "./detail-page-host-context";
import type { DetailPageDesignBrief } from "./detail-page-host-context";

/**
 * 생성 설문의 디자인 레퍼런스 — "이런 디자인으로" 를 그림으로 가리킨다.
 *
 * 상품 소재 사진과는 **다른 축**이다. 소재 사진은 페이지에 실릴 그림이고, 여기 붙이는
 * 것은 실리지 않는다 — 구조와 색을 고르는 근거로만 쓰인다. 같은 자리에 두면 셀러가
 * 자기 제품 사진을 여기 올리고 "왜 안 나오지"가 된다.
 *
 * ## 왜 판독을 따로 누르게 하는가
 *
 * 판독은 **제안**이다. 결과를 보여 주고 셀러가 고칠 수 있어야 한다 — 설문 저장에 몰래
 * 끼워 넣으면 톤이 왜 바뀌었는지 알 수 없는 채로 다음 단계로 넘어간다. 그래서 버튼을
 * 누르는 자리를 두고, 읽은 결과를 그 자리에 적는다.
 *
 * 그림 자체는 위로 올려 보내지 않는다. 판독 뒤로는 쓰는 곳이 없고, 설문에 base64 를
 * 심으면 그 행의 모든 조회가 그 바이트를 끌고 다닌다.
 */

let seq = 0;

function nextId(): string {
  seq += 1;
  return `design-ref-${seq}`;
}

type Picked = {
  id: string;
  uri: string;
  aspects: DesignReferenceAspect[];
  /** 이 장의 비전 입력 토큰. 0 은 "아직 못 쟀다" — 값은 비싼 쪽으로 잡힌다. */
  inputTokens: number;
  /** 이 장의 가로세로. 0 이면 아직 못 쟀다 — 세로로 긴 캡쳐의 값은 이 크기로 정해진다. */
  width: number;
  height: number;
};

export function DesignReferencePicker({
  brief,
  onBriefChange,
  initialReferences,
  disabled = false,
}: {
  /** 지금까지 읽은 판독. 없으면 아직 안 읽은 것이다. */
  brief: DetailPageDesignBrief | null;
  onBriefChange: (brief: DetailPageDesignBrief | null) => void;
  /**
   * 앞 화면에서 이미 붙여 둔 레퍼런스. 새 상품 시작 화면이 여기로 넘겨 준다 —
   * 거기서는 담기만 하고 **읽지 않는다**(판독은 크레딧을 선차감하므로 결과를 볼
   * 화면에서 눌러야 한다).
   *
   * 첫 렌더에서만 읽는다. 뒤에 값이 바뀌어도 유저가 여기서 빼거나 더한 것을
   * 되돌리지 않는다.
   */
  initialReferences?: readonly {
    uri: string;
    aspects: DesignReferenceAspect[];
    /** 앞 화면에서 이미 잰 크기. 0 이면 여기서도 비싼 쪽으로 잡는다. */
    inputTokens: number;
    /** 앞 화면에서 잰 가로세로. 옛 임시저장에는 없어서 선택이다. */
    width?: number;
    height?: number;
  }[];
  disabled?: boolean;
}) {
  const { t } = useTranslation("branding");
  const { api } = useDetailPageHost();
  const ordinal = (index: number) => t("detailPage.designReference.ordinal", { n: index + 1 });
  const [items, setItems] = useState<Picked[]>(() =>
    (initialReferences ?? [])
      .slice(0, MAX_DESIGN_REFERENCES)
      .map((entry) => ({
        id: nextId(),
        uri: entry.uri,
        aspects: [...entry.aspects],
        inputTokens: entry.inputTokens,
        width: entry.width ?? 0,
        height: entry.height ?? 0,
      })),
  );
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const attach = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setError(null);
      const room = MAX_DESIGN_REFERENCES - items.length;
      if (room <= 0) return;
      const picked = Array.from(files).slice(0, room);
      if (fileRef.current) fileRef.current.value = "";

      const added: Picked[] = [];
      for (const file of picked) {
        try {
          added.push({
            id: nextId(),
            uri: await readReferenceFile(file),
            aspects: [],
            inputTokens: 0,
            width: 0,
            height: 0,
          });
        } catch (err) {
          // 거절 사유(형식·크기)는 lib 가 사람 말로 적어 던진다 — 그건 그대로 보여 준다.
          setError(
            err instanceof Error && err.message
              ? err.message
              : t("detailPage.designReference.attachFailed"),
          );
        }
      }
      if (!added.length) return;
      // 원본으로 먼저 띄운다 — 줄이기를 기다리는 동안 아무것도 안 뜨면 첨부가 먹히지
      // 않은 것처럼 보인다.
      setItems((prev) => [...prev, ...added].slice(0, MAX_DESIGN_REFERENCES));

      for (const item of added) {
        void finalizeReferenceDataUri(item.uri).then((result) => {
          if ("error" in result) {
            setItems((prev) => prev.filter((entry) => entry.id !== item.id));
            setError(result.error);
            return;
          }
          // 줄일 것이 없었어도 크기는 받아 적는다 — 값이 그 크기로 정해지므로 여기서
          // 건너뛰면 안 줄인 그림만 "모르는 크기"로 비싸게 잡힌다.
          setItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    uri: result.uri,
                    inputTokens: result.inputTokens,
                    width: result.width,
                    height: result.height,
                  }
                : entry,
            ),
          );
        });
      }
    },
    [items.length, t],
  );

  const toggleAspect = useCallback((id: string, aspect: DesignReferenceAspect) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              aspects: entry.aspects.includes(aspect)
                ? entry.aspects.filter((a) => a !== aspect)
                : [...entry.aspects, aspect],
            }
          : entry,
      ),
    );
  }, []);

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((entry) => entry.id !== id);
        // 판독의 근거가 사라졌으면 판독도 내린다 — 없는 그림에서 읽은 톤이 남아 있으면
        // 셀러는 그것이 어디서 왔는지 알 수 없다.
        if (!next.length) onBriefChange(null);
        return next;
      });
    },
    [onBriefChange],
  );

  // 값은 장수가 아니라 **붙인 그림의 크기**로 정해진다. 서버와 같은 공식이라 여기 뜬 수가
  // 곧 청구될 수다(선차감이라 미리 맞아야 한다).
  //
  // 크기를 그대로 넘기는 이유는 세로로 긴 캡쳐 때문이다 — 서버가 조각내 싣고, 조각 수는
  // **몇 장을 붙였는지**에 따라 달라진다. 장마다 미리 굳혀 둔 토큰 수로는 못 센다.
  const credits = estimateBriefCredits(planReferenceTokens(items));

  const analyze = useCallback(async () => {
    if (!items.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.analyzeDetailPageDesignReferences({
        references: items.map((item) => ({ url: item.uri, aspects: item.aspects })),
        instruction: instruction.trim() || undefined,
      });
      onBriefChange(result.brief);
    } catch (err) {
      // 잔액 부족은 "읽지 못했어요"와 원인이 다르다 — 셀러가 할 일(충전)이 정해져
      // 있으므로 그 말을 그대로 해 준다. 다시 눌러도 결과가 달라지지 않는다.
      const shortfall = api.asInsufficientCreditsError(err);
      setError(
        shortfall
          ? t("detailPage.designReference.insufficient", {
              count: items.length,
              credits,
              remaining: shortfall.remaining,
            })
          : err instanceof Error && err.message
            ? err.message
            : t("detailPage.designReference.readFailed"),
      );
    } finally {
      setBusy(false);
    }
  }, [api, busy, credits, instruction, items, onBriefChange, t]);

  return (
    <div className="space-y-3 rounded-le-lg bg-le-ink-50 p-3">
      <div>
        <p className="text-xs font-le-medium text-le-ink-700">
          {t("detailPage.designReference.title")}
        </p>
        <p className="mt-1 text-[11px] text-le-ink-500">
          {t("detailPage.designReference.description", { max: MAX_DESIGN_REFERENCES })}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-start gap-2 rounded-le-lg border border-le-ink-200 bg-le-surface p-1.5"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-le-md bg-le-ink-100">
              {/* 붙인 사진은 data URI라 next/image 로 최적화할 것이 없다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.uri} alt={t("detailPage.designReference.title")} className="h-full w-full object-cover" />
              <span className="absolute left-0.5 top-0.5 rounded bg-le-ink-900/75 px-1 text-[10px] font-le-semibold leading-4 text-le-on-accent">
                {ordinal(index)}
              </span>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => remove(item.id)}
                aria-label={t("detailPage.designReference.remove", { ordinal: ordinal(index) })}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-le-ink-900/70 text-le-on-accent disabled:opacity-40"
              >
                <X size={10} />
              </button>
            </div>
            <div className="flex max-w-[13rem] flex-wrap gap-1">
              {DESIGN_REFERENCE_ASPECTS.map((aspect) => {
                const on = item.aspects.includes(aspect.key);
                return (
                  <button
                    key={aspect.key}
                    type="button"
                    disabled={disabled || busy}
                    aria-pressed={on}
                    // 축 이름만으로는 "내용 구성"이 문구까지인지 알 수 없다.
                    title={t(`detailPage.designReference.aspects.${aspect.key}.hint`)}
                    onClick={() => toggleAspect(item.id, aspect.key)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40 ${
                      on
                        ? "border-le-ink-900 bg-le-ink-900 text-le-on-accent"
                        : "border-le-ink-200 text-le-ink-500 hover:border-le-ink-400 hover:text-le-ink-700"
                    }`}
                  >
                    {t(`detailPage.designReference.aspects.${aspect.key}.label`)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {items.length < MAX_DESIGN_REFERENCES ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => fileRef.current?.click()}
            className="flex h-[4.75rem] items-center gap-1.5 rounded-le-lg border border-dashed border-le-ink-300 bg-le-surface px-3 text-xs text-le-ink-500 transition-colors hover:border-le-ink-400 hover:text-le-ink-700 disabled:opacity-40"
          >
            <ImagePlus size={14} />
            {t("detailPage.designReference.add")}
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept={REFERENCE_ACCEPT_ATTR}
          multiple
          hidden
          onChange={(e) => void attach(e.target.files)}
        />
      </div>

      {items.length ? (
        <>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            disabled={disabled || busy}
            aria-label={t("detailPage.designReference.instruction")}
            placeholder={t("detailPage.designReference.instructionPlaceholder")}
            className="w-full resize-none rounded-le-lg border border-le-ink-200 bg-le-surface px-3 py-2 text-xs text-le-ink-900 outline-none placeholder:text-le-ink-400 focus:border-le-ink-400 disabled:bg-le-ink-100"
          />
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void analyze()}
            className="inline-flex items-center gap-1.5 rounded-le-lg border border-le-ink-900 px-3 py-1.5 text-xs font-le-medium text-le-ink-900 transition-colors hover:bg-le-ink-900 hover:text-le-on-accent disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            {t(
              busy
                ? "detailPage.designReference.reading"
                : brief
                  ? "detailPage.designReference.reread"
                  : "detailPage.designReference.read",
            )}
          </button>
          {/* 누르기 전에 값을 알려 준다 — 누른 뒤 402 로 알게 되면 이미 축 고르고
              지시까지 다 적은 뒤다. 장수가 아니라 그림 크기에 붙는 값이라, 큰 그림을
              작은 것으로 바꾸면 줄어든다. */}
          <p data-credits={credits} className="text-[11px] text-le-ink-500">
            {t("detailPage.designReference.creditNote", { credits, count: items.length })}
          </p>
        </>
      ) : null}

      {brief ? <BriefSummary brief={brief} /> : null}
      {error ? <p className="text-[11px] text-le-danger-600">{error}</p> : null}
    </div>
  );
}

/** 읽은 결과를 그 자리에 적는다 — 톤이 왜 바뀌었는지 보이지 않으면 제안이 아니라 사고다. */
function BriefSummary({ brief }: { brief: DetailPageDesignBrief }) {
  const { t } = useTranslation("branding");
  const colors = [brief.bg_color, ...brief.primary_colors].filter(Boolean);
  const nothingRead =
    !brief.tone && !brief.density && !colors.length && !brief.summary && !brief.content;

  if (nothingRead) {
    return (
      <p className="text-[11px] text-le-ink-500">
        {t("detailPage.designReference.nothingRead")}
      </p>
    );
  }

  return (
    <div className="space-y-1.5 rounded-le-lg border border-le-ink-200 bg-le-surface p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {brief.tone ? (
          <span className="rounded-full bg-le-ink-900 px-2 py-0.5 text-[11px] text-le-on-accent">
            {/* 모르는 톤은 서버 값 그대로 — 새 톤이 번역보다 먼저 올 수 있다. */}
            {t(`detailPage.designReference.tone.${brief.tone}`, { defaultValue: brief.tone })}
          </span>
        ) : null}
        {brief.density ? (
          <span className="rounded-full border border-le-ink-300 px-2 py-0.5 text-[11px] text-le-ink-600">
            {t(`detailPage.designReference.density.${brief.density}`, {
              defaultValue: brief.density,
            })}
          </span>
        ) : null}
        {colors.map((color) => (
          <span
            key={color}
            title={color}
            style={{ backgroundColor: color }}
            className="h-4 w-4 rounded-full border border-le-ink-300"
          />
        ))}
      </div>
      {brief.summary ? (
        <p className="text-[11px] text-le-ink-600">{brief.summary}</p>
      ) : null}
      {brief.typography || brief.layout || brief.content ? (
        <p className="text-[11px] text-le-ink-500">
          {[brief.typography, brief.layout, brief.content].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <p className="text-[11px] text-le-ink-400">
        {t("detailPage.designReference.suggestionNote")}
      </p>
    </div>
  );
}
