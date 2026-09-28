// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
"use client";

// 우측 패널의 'GIF로 만들기' 섹션들(텍스트·카운트업·셀 차오름·이미지·도형)과 배경 지우기.
// detail-page-properties-panel.tsx 에서 그대로 옮겼다.

import { useCallback, useMemo, useRef, useState } from "react";
import { observer } from "../canvas-observer";
import { useTranslation } from "react-i18next";
import { Film, Eraser } from "lucide-react";
import { ColorInput } from "../../cardnews/color-input";
import { Section } from "../inspector-controls";
import {
  type GenerateTextGifFn,
  type GenerateImageGifFn,
  type GenerateDataGifFn,
  type RemoveBackgroundFn,
} from "../ai-generate-panel";
import { toHexColor } from "../../../lib/detail-page/css-color";
import { editorAssetBase } from "../../../lib/detail-page/runtime-config";
import {
  parseCountUpText,
  parseFilledRows,
  textAnchorOf,
} from "../../../lib/detail-page/data-gif-payload";
import { insertPersonalImage } from "../../../lib/detail-page/insert-image";
import {
  replaceWithGif,
  unionBox,
  type Box,
  type ElementLike as ReplaceElementLike,
} from "../../../lib/detail-page/replace-with-gif";
import {
  createCanvasMeasure,
  estimateMeasure,
  gifBleed,
  layoutTextLines,
  toFontWeight,
  type TextElementLike,
} from "../../../lib/detail-page/text-gif-layout";
import {
  shapeSourceImage,
  type ShapeElementLike,
} from "../../../lib/detail-page/shape-to-image";
import { useDetailPageHost } from "../detail-page-host-context";
import { resolveGifWebFonts } from "../../../lib/detail-page-canvas/gif-web-fonts";
import { GifEffectPicker, type GifEffectOption } from "../gif-effect-picker";
import {
  type ElementLike,
  type StoreLike,
  num,
  str,
  resolveReferenceSrc,
} from "./shared";

// 우측 패널 '텍스트를 GIF로': 선택 텍스트를 애니메이션 GIF로 만들어 '내 이미지'에 저장
// 하고 편집기에 삽입한다. 이펙트 목록은 백엔드 카탈로그와 동일한 정적 상수(작고 안정적).
// 이펙트 이름·설명은 화면에 그대로 노출되므로 언어를 따라야 한다. 여기서는 id와 순서만
// 들고, 문구는 `detailPage.gifEffects.*` 에서 꺼낸다.
// previewSrc 는 소싱 저장소의 scripts/detail_page_gif_effect_previews.py 가 구워 둔 자산.
const TEXT_GIF_EFFECT_IDS = [
  "shimmer",
  "blur_in",
  "wave",
  "typewriter",
  "bounce",
  "glow_pulse",
  "wobble",
  "fade_up",
] as const;

/** 번역기 타입 — i18next `t` 를 그대로 받는다. */
type Translate = (key: string) => string;

function textGifEffects(t: Translate): GifEffectOption[] {
  return TEXT_GIF_EFFECT_IDS.map((id) => ({
    id,
    label: t(`detailPage.gifEffects.text.${id}.label`),
    hint: t(`detailPage.gifEffects.text.${id}.hint`),
    previewSrc: `${editorAssetBase("gifEffectPreviews")}/text-${id}.gif`,
  }));
}

/**
 * Canvas 페이지 배경을 GIF 합성 배경색으로 쓴다(엣지 정합).
 *
 * 배경이 그라데이션 문자열이면 접을 수 없으니 흰색으로 떨어진다.
 */
function pageBackgroundColor(store: StoreLike): string {
  const bg = (store as { activePage?: { background?: unknown } }).activePage
    ?.background;
  return toHexColor(bg, "#ffffff");
}

// 우측 인스펙터 '이미지를 GIF로'. 백엔드 카탈로그(/images/image-gif-effects)와 같은
// 정적 목록 — 작고 안정적이라 부팅 시 네트워크를 태우지 않는다. group이 갈리는 이유는
// object 이펙트가 이미지 안의 물체를 찾아(배경제거) 거는 연출이라 성격이 다르기 때문이다.
const IMAGE_GIF_GROUP_KEY = {
  whole: "detailPage.gifEffects.group.whole",
  object: "detailPage.gifEffects.group.object",
} as const;

const IMAGE_GIF_EFFECT_SOURCE: {
  id: string;
  group: keyof typeof IMAGE_GIF_GROUP_KEY;
}[] = [
  { id: "ken_burns", group: "whole" },
  { id: "pulse_zoom", group: "whole" },
  { id: "blur_in", group: "whole" },
  { id: "fade_slide_left", group: "whole" },
  { id: "fade_slide_right", group: "whole" },
  { id: "rise_fall", group: "whole" },
  { id: "shine_sweep", group: "whole" },
  { id: "wipe_reveal", group: "whole" },
  { id: "tilt_parallax", group: "whole" },
  { id: "holo_foil", group: "object" },
  { id: "holo_foil_silver", group: "object" },
  { id: "holo_foil_gold", group: "object" },
];

/**
 * 카탈로그가 실제로 읽는 번역 키 전부(그룹 · 텍스트 · 이미지).
 *
 * 이펙트를 추가하면서 번역을 빠뜨리면 화면에 키가 그대로 노출되므로, 테스트가 ko/en
 * 양쪽 존재를 이 목록으로 확인한다.
 */
export const GIF_EFFECT_LABEL_KEYS: string[] = [
  ...Object.values(IMAGE_GIF_GROUP_KEY),
  ...TEXT_GIF_EFFECT_IDS.flatMap((id) => [
    `detailPage.gifEffects.text.${id}.label`,
    `detailPage.gifEffects.text.${id}.hint`,
  ]),
  ...IMAGE_GIF_EFFECT_SOURCE.flatMap((effect) => [
    `detailPage.gifEffects.image.${effect.id}.label`,
    `detailPage.gifEffects.image.${effect.id}.hint`,
  ]),
];

/**
 * 이미지/도형용 이펙트 목록.
 *
 * 도형(``shape``)에서는 물체 검출(배경제거)이 붙는 홀로그램 계열을 뺀다 — 도형은 이미
 * 배경이 없어서 검출에 크레딧과 시간만 쓰고 얻는 게 없다. 묶음이 하나뿐이라 그룹
 * 라벨도 떼어 낸다.
 */
function imageGifEffects(t: Translate, shape: boolean): GifEffectOption[] {
  return IMAGE_GIF_EFFECT_SOURCE.filter(
    (effect) => !shape || effect.group === "whole",
  ).map((effect) => ({
    id: effect.id,
    label: t(`detailPage.gifEffects.image.${effect.id}.label`),
    hint: t(`detailPage.gifEffects.image.${effect.id}.hint`),
    group: shape ? undefined : t(IMAGE_GIF_GROUP_KEY[effect.group]),
    previewSrc: `${editorAssetBase("gifEffectPreviews")}/image-${effect.id}.gif`,
  }));
}

// 백엔드 stage → 버튼에 띄울 문구 키. 홀로그램은 물체 검출 왕복이 붙어 체감이 길어서,
// 단순 스피너 대신 지금 뭘 하는지 말해줘야 "멈췄나?" 소리가 안 나온다.
const IMAGE_GIF_STAGE_KEY: Record<string, string> = {
  preparing: "detailPage.properties.gifStagePreparing",
  detecting: "detailPage.properties.gifStageDetecting",
  rendering: "detailPage.properties.gifStageRendering",
  encoding: "detailPage.properties.gifStageEncoding",
  uploading: "detailPage.properties.gifStageUploading",
};

/**
 * 우측 인스펙터 '배경 지우기(누끼)'.
 *
 * GIF 계열과 달리 새 요소를 삽입하지 않고 **선택 요소의 src를 갈아 끼운다** — 누끼는
 * 새 소재를 만드는 일이 아니라 지금 놓인 사진을 고치는 일이라, 자리·크기·자르기가
 * 그대로 유지돼야 한다.
 */
export const BgRemoveSection = observer(function BgRemoveSection({
  el,
  onRemove,
  creditCost,
}: {
  el: ElementLike;
  onRemove: RemoveBackgroundFn;
  creditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const { api, brand } = useDetailPageHost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (busy) return;
    // 편집기 src는 상대경로·blob·동일출처 프록시일 수 있다. GIF 참조와 같은 방식으로
    // data URI로 바꾸고, 교차출처 http(s)만 원본 URL 그대로 백엔드가 받게 한다.
    const source = await resolveReferenceSrc(str(el.src));
    if (!source) {
      setError(t("detailPage.properties.gifSourceUnreadable"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = await onRemove({
        sourceImage: source,
        brandId: brand.getStoredActiveBrandId() ?? undefined,
      });
      if (url) {
        el.set({ src: url });
      } else {
        setError(
          t("detailPage.properties.bgRemoveFailed", {
            defaultValue: "배경을 지우지 못했어요.",
          }),
        );
      }
    } catch (err) {
      const short = api.asInsufficientCreditsError(err);
      setError(
        short
          ? short.message
          : err instanceof Error
            ? err.message
            : t("detailPage.properties.bgRemoveFailed", {
                defaultValue: "배경을 지우지 못했어요.",
              }),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, el, onRemove, t]);

  return (
    <Section
      title={t("detailPage.properties.bgRemove", {
        defaultValue: "배경 지우기",
      })}
    >
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-le-md bg-le-ink-900 px-3 py-1.5 text-sm font-le-medium text-le-on-accent transition hover:bg-le-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Eraser size={14} />
        {busy
          ? t("detailPage.properties.bgRemoveBusy", {
              defaultValue: "배경 지우는 중…",
            })
          : t("detailPage.properties.bgRemoveRun", {
              defaultValue: "배경 지우기",
            })}
        {!busy && creditCost ? ` · ${creditCost}` : ""}
      </button>
      {error ? (
        <p className="mt-1.5 text-[11px] text-le-danger-500">{error}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-le-ink-400">
          {t("detailPage.properties.bgRemoveHint", {
            defaultValue:
              "피사체만 남기고 배경을 투명하게 만들어요. 자리와 크기는 그대로예요.",
          })}
        </p>
      )}
    </Section>
  );
});

export const ImageGifSection = observer(function ImageGifSection({
  store,
  el,
  onGenerate,
  creditCost,
  assetKind = "image",
  title,
  hint,
}: {
  store: StoreLike;
  el: ElementLike;
  onGenerate: GenerateImageGifFn;
  creditCost?: number;
  /** 도형이면 벡터를 투명 PNG로 구워 보내고, 결과는 브랜드 GIF의 도형 구획으로 간다. */
  assetKind?: "image" | "shape";
  title?: string;
  hint?: string;
}) {
  const { t } = useTranslation("branding");
  const { api, brand } = useDetailPageHost();
  const shape = assetKind === "shape";
  const effects = useMemo(() => imageGifEffects(t, shape), [t, shape]);
  const [effect, setEffect] = useState(shape ? "wipe_reveal" : "ken_burns");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<{ stage: string; progress: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selected = effects.find((fx) => fx.id === effect);

  const run = useCallback(async () => {
    if (busy) return;
    // 도형은 벡터라 픽셀이 없다 — 편집기와 같은 규칙(색 치환·그라데이션)으로 투명
    // PNG를 구워 보낸다. 사진은 편집기 src가 상대경로·blob·동일출처 프록시일 수 있어
    // GIF 참조와 같은 방식으로 data URI로 바꾸고, 교차출처 http(s)만 원본 URL 그대로
    // 백엔드가 받게 한다.
    const source = shape
      ? await shapeSourceImage(el as ShapeElementLike)
      : await resolveReferenceSrc(str(el.src));
    if (!source) {
      setError(
        t(
          shape
            ? "detailPage.properties.gifShapeUnreadable"
            : "detailPage.properties.gifSourceUnreadable",
        ),
      );
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setStage({ stage: "preparing", progress: 0 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { urls, maskFallback } = await onGenerate({
        sourceImage: source,
        effect,
        // 도형은 투명하게 굽는다 — 페이지 배경색을 주면 그 색이 배경으로 눌러 붙는다.
        background: shape ? "#00000000" : pageBackgroundColor(store),
        brandId: brand.getStoredActiveBrandId() ?? undefined,
        assetKind,
        onProgress: setStage,
      });
      const url = urls[0];
      if (url) {
        // 원본을 지우고 그 자리·그 크기로 갈아 끼운다. 사진이었다면 자르기(crop)까지
        // 물려받아야 프레이밍이 안 바뀐다 — GIF 프레임은 원본 사진 비율 그대로다.
        replaceWithGif(store, [el as ReplaceElementLike], url, {
          inheritCrop: true,
        });
        if (maskFallback) {
          setNotice(
            t("detailPage.properties.imageGifMaskFallback", {
              defaultValue:
                "물체를 특정하지 못해 이미지 전체에 적용했어요.",
            }),
          );
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return; // 사용자가 취소 → 조용히 끝낸다.
      const short = api.asInsufficientCreditsError(err);
      setError(
        short
          ? short.message
          : err instanceof Error
            ? err.message
            : t("detailPage.properties.gifFailed"),
      );
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStage(null);
    }
  }, [busy, el, effect, onGenerate, shape, assetKind, store, t]);

  const busyFallback = t("detailPage.properties.gifBusy");
  const busyLabel = stage
    ? stage.stage === "rendering" && stage.progress > 0
      ? `${t(IMAGE_GIF_STAGE_KEY.rendering)} ${stage.progress}%`
      : stage.stage in IMAGE_GIF_STAGE_KEY
        ? t(IMAGE_GIF_STAGE_KEY[stage.stage])
        : busyFallback
    : busyFallback;

  return (
    <Section
      title={
        title ??
        t("detailPage.properties.imageGif", {
          defaultValue: "이미지를 GIF로",
        })
      }
    >
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <GifEffectPicker
          value={effect}
          options={effects}
          onChange={setEffect}
          disabled={busy}
        />
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-le-md bg-le-ink-900 px-3 py-1.5 text-sm font-le-medium text-le-on-accent transition hover:bg-le-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Film size={14} />
          {busy
            ? busyLabel
            : t("detailPage.properties.imageGifMake", {
                defaultValue: "GIF 만들기",
              })}
          {!busy && creditCost ? ` · ${creditCost}` : ""}
        </button>
      </div>
      {busy ? (
        <button
          type="button"
          onClick={() => abortRef.current?.abort()}
          className="mt-1.5 text-[11px] text-le-ink-400 underline hover:text-le-ink-600"
        >
          {t("detailPage.properties.imageGifCancel", {
            defaultValue: "취소 (만들던 GIF는 '내 이미지'에 저장돼요)",
          })}
        </button>
      ) : error ? (
        <p className="mt-1.5 text-[11px] text-le-danger-500">{error}</p>
      ) : notice ? (
        <p className="mt-1.5 text-[11px] text-le-warn-600">{notice}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-le-ink-400">
          {selected?.hint ?? hint ?? ""}
        </p>
      )}
    </Section>
  );
});

/**
 * 도형을 GIF로 — 벡터를 투명 PNG로 구워 이미지 이펙트 파이프라인에 태운다.
 *
 * 예를 들어 가로 막대에 와이프를 걸면 왼쪽에서 오른쪽으로 차오르는, 수치가 늘어나는
 * 듯한 연출이 된다. 렌더는 이미지 GIF와 같은 잡을 쓰고, 결과만 브랜드 GIF의 도형
 * 구획으로 갈린다.
 */
export const ShapeGifSection = observer(function ShapeGifSection(props: {
  store: StoreLike;
  el: ElementLike;
  onGenerate: GenerateImageGifFn;
  creditCost?: number;
}) {
  const { t } = useTranslation("branding");
  return (
    <ImageGifSection
      {...props}
      assetKind="shape"
      title={t("detailPage.properties.shapeGif", {
        defaultValue: "도형을 GIF로",
      })}
      hint={t("detailPage.properties.shapeGifHint", {
        defaultValue: "배경 없는 GIF로 만들어져 브랜드 GIF에 저장돼요.",
      })}
    />
  );
});

/** 편집기가 접어 보여주는 줄 그대로 재는 폭 측정기(브라우저 canvas). */
function measureForGif() {
  return createCanvasMeasure() ?? estimateMeasure;
}

/**
 * 텍스트 요소들 → GIF 요청의 줄 목록(위→아래), **원본 상자 좌표까지 실측**.
 *
 * 요소 하나 안의 줄바꿈은 물론 상자 폭에서 자동으로 접힌 줄까지 쪼갠다 — SVG ``<text>``는
 * 개행도 접기도 안 하기 때문에, 안 쪼개면 두 줄짜리 헤드라인이 한 줄로 늘어져 나온다.
 */
export function textGifLines(els: ElementLike[], box: Box) {
  return layoutTextLines(els as TextElementLike[], box, measureForGif()).map(
    (line) => ({
      ...line,
      // el.fill 은 `rgb(23, 21, 15)` 로도 온다. 백엔드는 SVG 속성에 그대로 박으므로 HEX만 받는다.
      color: toHexColor(line.color, "#26221e"),
    }),
  );
}

/** 서버 스키마의 줄 개수 상한. 넘으면 422가 나므로 미리 안내한다. */
const TEXT_GIF_MAX_LINES = 24;

export const TextGifSection = observer(function TextGifSection({
  store,
  els,
  targets,
  onGenerate,
  creditCost,
}: {
  store: StoreLike;
  /** 단일 텍스트, 또는 텍스트만 든 그룹의 자식들(통째로 한 장의 GIF가 된다). */
  els: ElementLike[];
  /**
   * GIF가 대체할 요소들. 그룹이면 자식이 아니라 **그룹 자체**를 지워야 빈 껍데기가
   * 안 남는다. 생략하면 ``els``.
   */
  targets?: ElementLike[];
  onGenerate: GenerateTextGifFn;
  creditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const { api, brand } = useDetailPageHost();
  const effects = useMemo(() => textGifEffects(t), [t]);
  const [effect, setEffect] = useState("shimmer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replaced = targets ?? els;
  // 상자·줄 실측은 매 렌더 다시 하지 않는다(측정은 canvas를 타고, run 의존성도 흔든다).
  const box = useMemo(
    () => unionBox(replaced as ReplaceElementLike[]),
    [replaced],
  );
  const lines = useMemo(() => (box ? textGifLines(els, box) : []), [els, box]);
  const first = lines[0];

  const run = useCallback(async () => {
    if (!first || !box || busy) return;
    if (lines.length > TEXT_GIF_MAX_LINES) {
      setError(
        t("detailPage.properties.textGifTooManyLines", {
          defaultValue: "문구가 너무 길어요. 더 짧은 텍스트를 골라 주세요.",
        }),
      );
      return;
    }
    setBusy(true);
    setError(null);
    // 상자 밖으로 번지는 이펙트(글로우·물결)가 잘리지 않게 두는 여백. 서버와 편집기가
    // **같은 값**을 써야 글자가 제자리에 온다.
    const bleed = gifBleed(lines);
    try {
      // brandId 를 주면 서버가 브랜드 자산 버킷에 직접 쓴다. 예전처럼 결과 URL을
      // 다시 내려받아 재업로드하지 않는다 — 그 왕복이 S3 CORS를 두 번 타서, 한 번만
      // 막혀도 GIF는 만들어졌는데 브랜드 버킷엔 아무것도 안 남았다.
      const urls = await onGenerate({
        // 서버 스키마의 text 는 60자 상한이다(실제로 그려지는 건 lines 쪽).
        text: first.text.slice(0, 60),
        effect,
        color: first.color,
        background: pageBackgroundColor(store),
        fontSize: first.fontSize,
        fontWeight: first.fontWeight,
        fontFamily: first.fontFamily,
        lines,
        // 폰트 파일 주소까지 같이 보낸다 — 서버 컨테이너엔 우리 폰트가 없어서
        // 이름만 보내면 시스템 폴백(픽셀 폰트)으로 그려진다.
        fonts: resolveGifWebFonts(
          lines.map((line) => ({
            family: line.fontFamily,
            weight: line.fontWeight,
          })),
        ),
        // 원본 상자를 그대로 넘긴다 — 서버가 캔버스를 글자 수로 추정하면 결과 비율이
        // 달라져서, 되꽂을 때 글자가 커지고 줄이 밀린다.
        boxWidth: box.width,
        boxHeight: box.height,
        bleed,
        brandId: brand.getStoredActiveBrandId() ?? undefined,
      });
      const url = urls[0];
      if (url) {
        // 원본을 지우고 그 자리·그 크기로 갈아 끼운다(여백만큼만 넓게).
        replaceWithGif(store, replaced as ReplaceElementLike[], url, { bleed });
      }
    } catch (err) {
      const short = api.asInsufficientCreditsError(err);
      setError(
        short
          ? short.message
          : err instanceof Error
            ? err.message
            : t("detailPage.properties.gifFailed"),
      );
    } finally {
      setBusy(false);
    }
  }, [first, box, lines, replaced, busy, onGenerate, effect, store, t]);

  return (
    <Section
      title={t("detailPage.properties.textGif", { defaultValue: "텍스트를 GIF로" })}
    >
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <GifEffectPicker
          value={effect}
          options={effects}
          onChange={setEffect}
          disabled={busy}
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || !first}
          className="inline-flex items-center gap-1.5 rounded-le-md bg-le-ink-900 px-3 py-1.5 text-sm font-le-medium text-le-on-accent transition hover:bg-le-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Film size={14} />
          {busy
            ? t("detailPage.properties.textGifBusy", { defaultValue: "만드는 중…" })
            : t("detailPage.properties.textGifMake", { defaultValue: "GIF 만들기" })}
          {creditCost ? ` · ${creditCost}` : ""}
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 text-[11px] text-le-danger-500">{error}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-le-ink-400">
          {lines.length > 1
            ? t("detailPage.properties.textGifGroupHint", {
                defaultValue:
                  "묶인 문구 {{count}}줄이 한 장의 투명 배경 GIF로 만들어져요.",
                count: lines.length,
              })
            : t("detailPage.properties.textGifHint", {
                defaultValue:
                  "선택한 문구가 배경 없는 GIF로 '내 이미지'에 저장돼요.",
              })}
        </p>
      )}
    </Section>
  );
});

/**
 * 칸 모양 선택지. 서버 `GET /images/data-gif-effects` 의 SHAPES 와 같아야 한다.
 *
 * 이름은 도형 패널이 이미 번역해 둔 것을 그대로 쓴다 — 같은 도형을 두 벌 번역해 두면
 * 한쪽만 언어를 타서 목록에 한국어와 영어가 섞인다. `square` 만 그쪽 이름이 `rect` 다.
 */
const CELL_SHAPES: Array<{ id: string; labelKey: string }> = [
  { id: "circle", labelKey: "detailPage.shapes.basic.circle" },
  { id: "square", labelKey: "detailPage.shapes.basic.rect" },
  { id: "rounded", labelKey: "detailPage.shapes.basic.rounded" },
  { id: "diamond", labelKey: "detailPage.shapes.basic.diamond" },
  { id: "hexagon", labelKey: "detailPage.shapes.basic.hexagon" },
];

/**
 * 숫자를 카운트업 GIF로 — 선택한 텍스트에서 값을 읽어 **제자리에** 갈아 끼운다.
 *
 * 입력 폼을 따로 두지 않는 게 핵심이다. 캔버스에 이미 적어 둔 "279.45%"를 고르면 목표값·
 * 소수 자릿수·접미사를 거기서 읽는다 — 숫자를 두 번 적게 하면 캔버스 값과 GIF 값이 어긋난
 * 채로 배포된다. 색·크기·굵기·이탤릭·하이라이트도 요소에서 그대로 가져온다.
 *
 * 숫자가 없는 문구면 섹션을 아예 감춘다(눌러봐야 헛것이 나온다).
 */
export const CountUpGifSection = observer(function CountUpGifSection({
  store,
  els,
  targets,
  onGenerate,
  creditCost,
}: {
  store: StoreLike;
  els: ElementLike[];
  /** GIF가 대체할 요소들(그룹이면 그룹 자체). 생략하면 ``els``. */
  targets?: ElementLike[];
  onGenerate: GenerateDataGifFn;
  creditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const { api, brand } = useDetailPageHost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replaced = targets ?? els;
  const first = els[0];
  const text = str(first?.text);
  const parsed = useMemo(() => parseCountUpText(text), [text]);
  const box = useMemo(
    () => unionBox(replaced as ReplaceElementLike[]),
    [replaced],
  );

  const run = useCallback(async () => {
    if (!parsed || !first || !box || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fontFamily = str(first.fontFamily);
      // Canvas 는 굵기를 `"normal"`·`"bold"`·`"700"` 처럼 **문자열**로 들고 있고, 아예
      // 안 들고 있으면 굵기가 `fontStyle` 쪽에 실린다. 그냥 Number() 하면 `"normal"` 이
      // NaN 이라 기본값으로 떨어져, 보통 굵기 숫자가 GIF 에서 전부 ExtraBold 로 굳었다.
      const fontWeight = toFontWeight(first.fontWeight ?? first.fontStyle);
      const urls = await onGenerate({
        kind: "count_up",
        ...parsed,
        color: toHexColor(str(first.fill), "#111111"),
        fontSize: Math.round(num(first.fontSize, 42)),
        fontWeight,
        fontFamily,
        letterSpacing: num(first.letterSpacing, 0),
        // 상자가 글자보다 넓으면 정렬이 곧 자리다 — 안 넘기면 왼쪽에 적어 둔 숫자가
        // GIF 안에서 가운데로 옮겨 앉는다.
        anchor: textAnchorOf(first.align),
        italic: /italic/i.test(str(first.fontStyle)),
        // 하이라이트가 걸린 숫자는 그 띠를 GIF 안에 굽는다 — CSS로 두고 글자만 투명
        // 위에 얹으면 1비트 알파가 글자 윗동을 매트색으로 잘라 먹는다.
        marker: first.backgroundEnabled
          ? toHexColor(str(first.backgroundColor), "#f7f14a")
          : "",
        // 원본 상자를 그대로 넘긴다 — 서버가 글자 수로 캔버스를 추정하면 되꽂을 때
        // 글자 크기가 달라진다.
        width: Math.round(box.width),
        height: Math.round(box.height),
        background: pageBackgroundColor(store),
        transparent: true,
        // 폰트 파일 주소까지 보낸다. 이름만 보내면 서버 컨테이너에 그 폰트가 없어
        // 시스템 폴백(픽셀 폰트)으로 그려진다.
        fonts: resolveGifWebFonts([{ family: fontFamily, weight: fontWeight }]),
        brandId: brand.getStoredActiveBrandId() ?? undefined,
      });
      const url = urls[0];
      if (url) replaceWithGif(store, replaced as ReplaceElementLike[], url);
    } catch (err) {
      const short = api.asInsufficientCreditsError(err);
      setError(
        short
          ? short.message
          : err instanceof Error
            ? err.message
            : t("detailPage.properties.gifFailed"),
      );
    } finally {
      setBusy(false);
    }
  }, [parsed, first, box, replaced, busy, onGenerate, store, t]);

  if (!parsed) return null;

  return (
    <Section
      title={t("detailPage.properties.countUpGif", {
        defaultValue: "숫자를 카운트업으로",
      })}
    >
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-le-md bg-le-ink-900 px-3 py-1.5 text-sm font-le-medium text-le-on-accent transition hover:bg-le-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Film size={14} />
        {busy
          ? t("detailPage.properties.textGifBusy", { defaultValue: "만드는 중…" })
          : t("detailPage.properties.countUpGifMake", {
              defaultValue: "카운트업 GIF 만들기",
            })}
        {creditCost ? ` · ${creditCost}` : ""}
      </button>
      {error ? (
        <p className="mt-1.5 text-[11px] text-le-danger-500">{error}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-le-ink-400">
          {t("detailPage.properties.countUpGifHint", {
            defaultValue:
              "0에서 {{target}}까지 오른 뒤 2초 멈췄다 반복해요. 이 자리에 그대로 들어갑니다.",
            target: `${parsed.prefix}${parsed.to.toLocaleString(undefined, {
              minimumFractionDigits: parsed.decimals,
              maximumFractionDigits: parsed.decimals,
              useGrouping: parsed.grouping,
            })}${parsed.suffix}`,
          })}
        </p>
      )}
    </Section>
  );
});

/**
 * 셀 차오름 GIF(도트 차트·표 셀·매트릭스) — 새 요소로 캔버스 가운데에 넣는다.
 *
 * 카운트업과 달리 원본이 될 요소가 없어서 선택 인스펙터에는 놓을 자리가 없다. 아무것도
 * 안 골랐을 때 뜨는 페이지 인스펙터가 "새로 만든다"는 뜻과 맞다.
 */
export const CellGridGifSection = observer(function CellGridGifSection({
  store,
  onGenerate,
  creditCost,
}: {
  store: StoreLike;
  onGenerate: GenerateDataGifFn;
  creditCost?: number;
}) {
  const { t } = useTranslation("branding");
  const { api, brand } = useDetailPageHost();
  const [rows, setRows] = useState("6,4,2");
  const [cols, setCols] = useState(8);
  const [shape, setShape] = useState("circle");
  const [fill, setFill] = useState("#1b6fd4");
  const [empty, setEmpty] = useState("#e4e4e4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = useMemo(() => parseFilledRows(rows), [rows]);
  // 칸 수보다 많이 채우라는 요청은 서버가 422로 되돌린다 — 버튼에서 미리 막는다.
  const invalid = filled.length === 0 || filled.some((n) => n > cols);

  const run = useCallback(async () => {
    if (invalid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const urls = await onGenerate({
        kind: "cell_grid",
        filled,
        cols,
        shape,
        fill,
        empty,
        background: pageBackgroundColor(store),
        transparent: true,
        brandId: brand.getStoredActiveBrandId() ?? undefined,
      });
      const url = urls[0];
      if (url) insertPersonalImage(store, url, { isGif: true });
    } catch (err) {
      const short = api.asInsufficientCreditsError(err);
      setError(
        short
          ? short.message
          : err instanceof Error
            ? err.message
            : t("detailPage.properties.gifFailed"),
      );
    } finally {
      setBusy(false);
    }
  }, [invalid, busy, onGenerate, filled, cols, shape, fill, empty, store, t]);

  return (
    <Section
      title={t("detailPage.properties.cellGridGif", {
        defaultValue: "셀 차오름 GIF",
      })}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-le-ink-500">
            {t("detailPage.properties.cellGridRows", {
              defaultValue: "행별 채울 칸",
            })}
          </span>
          <input
            value={rows}
            onChange={(e) => setRows(e.target.value)}
            placeholder="6,4,2"
            className="h-8 rounded-le-md border border-le-ink-200 px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-le-ink-500">
            {t("detailPage.properties.cellGridCols", { defaultValue: "열 수" })}
          </span>
          <input
            type="number"
            min={1}
            max={40}
            value={cols}
            onChange={(e) => setCols(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 rounded-le-md border border-le-ink-200 px-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-le-ink-500">
            {t("detailPage.properties.cellGridShape", { defaultValue: "모양" })}
          </span>
          <select
            value={shape}
            onChange={(e) => setShape(e.target.value)}
            className="h-8 rounded-le-md border border-le-ink-200 px-2 text-sm"
          >
            {CELL_SHAPES.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <ColorInput value={fill} onChange={setFill} />
        <ColorInput value={empty} onChange={setEmpty} />
      </div>
      <button
        type="button"
        onClick={run}
        disabled={busy || invalid}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-le-md bg-le-ink-900 px-3 py-1.5 text-sm font-le-medium text-le-on-accent transition hover:bg-le-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Film size={14} />
        {busy
          ? t("detailPage.properties.textGifBusy", { defaultValue: "만드는 중…" })
          : t("detailPage.properties.cellGridGifMake", {
              defaultValue: "차트 GIF 만들기",
            })}
        {creditCost ? ` · ${creditCost}` : ""}
      </button>
      <p className="mt-1.5 text-[11px] text-le-ink-400">
        {error ??
          (invalid
            ? t("detailPage.properties.cellGridInvalid", {
                defaultValue: "행별 칸 수는 1개 이상이고 열 수를 넘을 수 없어요.",
              })
            : t("detailPage.properties.cellGridGifHint", {
                defaultValue:
                  "채운 칸이 순서대로 켜진 뒤 2초 멈췄다 반복해요. 축·수치 글자는 캔버스에서 위에 얹으세요.",
              }))}
      </p>
    </Section>
  );
});
