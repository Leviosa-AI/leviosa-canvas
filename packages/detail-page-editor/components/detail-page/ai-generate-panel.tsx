"use client";

import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { ImagePlus, Info, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AnnotationDialog } from "./annotation-dialog";
import { toDrawableDataUri } from "../../lib/detail-page/image-data-uri";

import {
  IMAGE_TIER_META,
  isImageCreditBlocked,
  imageCreditRequired,
  resolveDefaultImageTier,
  resolveImageTiers,
  type ImageTier,
} from "../../lib/detail-page/image-credit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { useDetailPageHost } from "./detail-page-host-context";
import type { DataGifRequestInput } from "../../lib/detail-page/data-gif-payload";
import { insertPersonalImage } from "../../lib/detail-page/insert-image";
import {
  useFakeProgress,
  GENERATION_ESTIMATE_MS,
} from "../../lib/detail-page/use-fake-progress";
import {
  GenerationProgressFill,
  progressPercent,
} from "./generation-progress-fill";

/**
 * Custom Canvas side-panel section: AI 이미지 생성.
 *
 * the stock editor's stock ``ai-images-panel`` calls the stock editor's own AI behind their API
 * key. We instead surface OUR generation pipeline: the editor injects an
 * ``onGenerate`` callback (wired to ``generateDetailPageImage`` in the real app,
 * stubbed in the dev harness) and ``uploadFile`` for reference images. The
 * panel only knows prompt-in / image-URL-out, so it stays decoupled from the
 * backend contract.
 */

export type GenerateImageInput = {
  prompt: string;
  referenceImages: string[];
  mode: "new_reference" | "based_on_existing";
  /**
   * 유저가 밑그림 위에 직접 표시한 마킹본(PNG data URI).
   *
   * 그림은 **어디를**, 글은 **무엇을** 이다. 마킹이 있으면 ``prompt`` 는 비어도 된다 —
   * 손글씨로 적을 수 있다.
   */
  annotatedImage?: string;
  /** 선택된 이미지 모델 티어(basic/pro/max). 미지정 시 백엔드 기본값(pro). */
  tier: ImageTier;
  /**
   * 주면 서버가 결과를 브랜드 자산 버킷에 직접 쓴다. 예전처럼 결과 URL을 다시
   * 내려받아 재업로드하지 않는다 — 그 왕복이 S3 CORS를 두 번 타서, 한 번만
   * 막혀도 이미지는 만들어졌는데 브랜드 버킷엔 아무것도 안 남았다.
   */
  brandId?: string;
};

export type GenerateImageFn = (input: GenerateImageInput) => Promise<string[]>;

export type GenerateGifInput = {
  prompt: string;
  referenceImages: string[];
  /** 배경 투명 처리(마젠타 크로마키). 상세페이지 움짤 기본값. */
  transparent: boolean;
  /** 이미지와 같다. 저장 위치는 start 시점에 확정된다. */
  brandId?: string;
};

export type GenerateGifFn = (input: GenerateGifInput) => Promise<string[]>;

export type GenerateTextGifInput = {
  /** GIF로 만들 텍스트(선택 텍스트 요소의 현재 내용). */
  text: string;
  /** 이펙트 id(blur_in|wave|shimmer|typewriter|bounce|glow_pulse|wobble|fade_up). */
  effect: string;
  /** 글자색 HEX. */
  color?: string;
  /** 강조색 HEX(shimmer/glow_pulse). */
  accent?: string;
  /** 합성 배경색 HEX(텍스트가 놓인 페이지/섹션 배경색 → 엣지 정합). */
  background?: string;
  /** 글자 크기(px, 요소 fontSize). */
  fontSize?: number;
  /** 글자 굵기(요소 fontWeight). */
  fontWeight?: number;
  /** 편집기에서 쓰는 font-family 이름. */
  fontFamily?: string;
  /**
   * 여러 줄(위→아래). 그룹으로 묶인 텍스트를 통째로 GIF화할 때 쓴다. 요소 하나 안의
   * 줄바꿈도 여기서 줄로 쪼개 보낸다(SVG ``<text>``는 개행을 공백으로 접는다).
   */
  lines?: Array<{
    text: string;
    color: string;
    fontSize: number;
    fontWeight: number;
    fontFamily: string;
    /** 원본 상자 기준 앵커 x(px). 주면 서버가 추정 대신 그 자리에 찍는다. */
    x?: number;
    /** 원본 상자 기준 줄의 세로 중심 y(px). */
    y?: number;
    /** 가로 정렬 기준. */
    anchor?: "start" | "middle" | "end";
  }>;
  /**
   * 서버가 ``@font-face``로 주입할 폰트 파일 주소. 서버 컨테이너엔 우리 폰트가 없어서
   * 이름만 보내면 시스템 폴백(픽셀 폰트)으로 그려진다.
   */
  fonts?: Array<{ family: string; url: string; weight: number }>;
  /**
   * 원본 텍스트 상자 크기(px)와 여백. 주면 서버가 캔버스를 글자 수로 추정하지 않고 이
   * 상자에 맞춰 그린다 — 편집기가 같은 상자에 되꽂아야 글자 크기가 원본과 같다.
   */
  boxWidth?: number;
  boxHeight?: number;
  bleed?: number;
  /**
   * 활성 브랜드 id. 주면 서버가 결과 GIF를 브랜드 자산 버킷에 **직접** 쓴다.
   * 예전에는 브라우저가 개인 버킷에서 다시 내려받아 재업로드했는데, 서버가 이미
   * 들고 있는 바이트를 왕복시키는 구조라 S3 CORS를 두 번 탔다.
   */
  brandId?: string;
};

export type GenerateTextGifFn = (
  input: GenerateTextGifInput,
) => Promise<string[]>;

/**
 * 수치를 GIF로(카운트업 · 셀 차오름). 입력은 `buildDataGifPayload`가 받는 그대로다 —
 * 호스트(운영 편집기 / 데모)는 페이로드 조립을 그 함수에 맡기고 전송만 한다.
 */
export type GenerateDataGifFn = (
  input: DataGifRequestInput,
) => Promise<string[]>;

export type GenerateImageGifInput = {
  /** GIF로 만들 소스 이미지(선택 이미지 요소의 src, data URI 또는 http(s) URL). */
  sourceImage: string;
  /** 이펙트 id(ken_burns|pulse_zoom|holo_foil|…). */
  effect: string;
  /** 캔버스 밖을 채울 배경색 HEX(이미지가 놓인 페이지 배경 → 엣지 정합). */
  background?: string;
  /** 활성 브랜드 id. 주면 서버가 결과를 브랜드 자산 버킷에 직접 쓴다. */
  brandId?: string;
  /**
   * 소스가 사진인지 도형인지. 렌더는 같고, 브랜드 GIF 패널에서 어느 구획에 놓일지가
   * 갈린다 — 구워진 GIF만 봐서는 알 수 없어 만들 때 알려줘야 한다.
   */
  assetKind?: "image" | "shape";
  /**
   * 진행 단계 보고. 홀로그램 포일은 물체 검출(배경제거)이 붙어 체감이 길기 때문에
   * 버튼 문구를 단계별로 바꿔줘야 "멈춘 것 같다"는 인상을 주지 않는다.
   */
  onProgress?: (progress: { stage: string; progress: number }) => void;
};

export type GenerateImageGifResult = {
  urls: string[];
  /** 물체를 특정하지 못해 이미지 전체에 적용됐는지(패널이 안내 문구를 띄운다). */
  maskFallback?: boolean;
};

export type GenerateImageGifFn = (
  input: GenerateImageGifInput,
) => Promise<GenerateImageGifResult>;

export type RemoveBackgroundInput = {
  /** 배경을 지울 소스 이미지(선택 이미지 요소의 src, data URI 또는 http(s) URL). */
  sourceImage: string;
  /** 활성 브랜드 id. 주면 서버가 컷아웃을 브랜드 자산 버킷에 직접 쓴다. */
  brandId?: string;
};

/**
 * 선택 이미지의 배경을 지워 컷아웃(투명 PNG) 주소를 돌려준다. 실패하면 null.
 *
 * GIF 계열과 달리 새 요소를 삽입하지 않고 **선택 요소의 src를 갈아 끼운다** — 누끼는
 * 새 소재를 만드는 일이 아니라 지금 놓인 사진을 고치는 일이기 때문이다.
 */
export type RemoveBackgroundFn = (
  input: RemoveBackgroundInput,
) => Promise<string | null>;

type AddElementOpts = Record<string, unknown>;
type PageLike = {
  computedWidth: number;
  computedHeight: number;
  addElement: (opts: AddElementOpts) => unknown;
};
type StoreLike = {
  activePage?: PageLike;
  pages: PageLike[];
};

type AiGeneratePanelProps = {
  store: unknown;
  onGenerate?: GenerateImageFn;
  /** 프롬프트 → 애니메이션 GIF URL 생성(개인 폴더 저장). 없으면 GIF 모드 안내만 표시. */
  onGenerateGif?: GenerateGifFn;
  /** AI GIF 1회 생성 비용(크레딧). 0/미지정이면 크레딧 UI 숨김. */
  gifCreditCost?: number;
  /** 초기 탭(image/gif). GIF 요소 편집 시 "gif"로 열어 재생성이 기본이 되게 한다. */
  initialMode?: "image" | "gif";
  /**
   * 우측 인스펙터처럼 "이미 선택된 이미지"가 참조로 암묵 주입되는 경우 true. GIF는
   * 참조 이미지가 필수라, false(좌측)면 업로드가 있어야 생성 가능하다.
   */
  hasImplicitReference?: boolean;
  /**
   * 암묵 참조의 실제 src(현재 선택된 이미지). 주어지면 업로드 칸 대신 이 이미지를
   * 읽기 전용 미리보기로 띄워 "지금 이 이미지를 편집/참조 중"임을 시각적으로 보여준다.
   * 이미지 편집·GIF 재생성 모두 선택 이미지가 입력이므로, 예시 input이 항상 보이게 한다.
   */
  implicitReferenceSrc?: string;
  /**
   * 주면 "그림으로 지시" 진입점이 뜬다. 이 src 위에 유저가 표시한 마킹본이 원본과
   * **함께** 생성기로 간다. 지금은 이미지 모드에서만 의미가 있다(GIF 는 첫 프레임을
   * 그대로 쓰므로 마킹이 결과에 그려질 위험이 있다).
   */
  annotateBaseSrc?: string;
  uploadFile?: (file: File) => Promise<string>;
  /**
   * 결과 처리 오버라이드. 주어지면 새 이미지를 페이지에 삽입하는 대신 이 콜백을
   * 호출한다(예: 우측 인스펙터에서 선택된 이미지의 src 교체). 버튼 라벨도 "교체"로.
   */
  onResult?: (src: string) => void;
  /**
   * 티어별 크레딧 단가(중앙 feature_costs). 주어지면 선택된 티어의 값으로 비용/게이트를
   * 계산한다. 단일 값 `creditCost`보다 우선. 데모(dev-canvas)는 대체 단가 맵을 넘긴다.
   */
  costByTier?: Partial<Record<ImageTier, number>>;
  /**
   * 고르게 할 티어. 안 주면 셋 다(`IMAGE_TIERS`). 요금표에서 은퇴한 티어를 가진
   * 소비자가 드롭다운에서 그 항목을 빼는 자리다 — 값이 없는 티어가 남아 있으면
   * 누를 수는 있는데 아무도 청구를 못 한다.
   */
  tiers?: readonly ImageTier[];
  /**
   * (레거시) 단일 티어 크레딧. `costByTier` 미주입 시 선택 티어 관계없이 이 값을 쓴다.
   * 0/미지정이면 크레딧 UI 숨김.
   */
  creditCost?: number;
  /** 현재 보유 크레딧 잔액. 1.5× 안전 마진 게이트에 사용. */
  creditBalance?: number;
  /** 크레딧 부족 시 "크레딧 추가하기" 목적지(레비오사 pricing). 없으면 CTA 비활성. */
  onBuyCredits?: () => void;
};

/** Drop the generated image onto the active page, sized to ~62% of its width. */
function insertImage(store: unknown, src: string) {
  const s = store as StoreLike;
  const page = s.activePage ?? s.pages[0];
  if (!page) return;
  const width = Math.round(page.computedWidth * 0.62);
  const height = Math.round(width);
  page.addElement({
    type: "image",
    src,
    x: Math.round((page.computedWidth - width) / 2),
    y: Math.round((page.computedHeight - height) / 2),
    width,
    height,
  });
}

export function AiGeneratePanel({
  store,
  onGenerate,
  onGenerateGif,
  gifCreditCost = 0,
  initialMode = "image",
  hasImplicitReference = false,
  implicitReferenceSrc,
  annotateBaseSrc,
  uploadFile,
  onResult,
  costByTier,
  tiers,
  creditCost = 0,
  creditBalance = 0,
  onBuyCredits,
}: AiGeneratePanelProps) {
  const { t } = useTranslation("branding");
  const { brand } = useDetailPageHost();
  const [mode, setMode] = useState<"image" | "gif">(
    // GIF 생성이 배선된 경우에만 gif 초기값을 존중(미배선이면 토글이 없어 갇힘).
    initialMode === "gif" && onGenerateGif ? "gif" : "image",
  );
  // 목록은 props 로 오지만 배열이라 매 렌더 새 참조다. 여기서 한 번 정규화해
  // 아래 `useMemo`·초기값이 같은 값을 본다.
  const tierOptions = useMemo(() => resolveImageTiers(tiers), [tiers]);
  const [tier, setTier] = useState<ImageTier>(() =>
    resolveDefaultImageTier(resolveImageTiers(tiers)),
  );
  // 목록이 좁아졌는데 고른 것이 그 밖이면(소비자가 티어를 은퇴시킨 뒤 열린 패널)
  // 목록 안으로 되돌린다. 안 그러면 트리거가 빈 채로 뜨고 생성은 사라진 티어로 나간다.
  const activeTier = tierOptions.includes(tier)
    ? tier
    : resolveDefaultImageTier(tierOptions);
  const [transparent, setTransparent] = useState(true);
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [refUploading, setRefUploading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);

  const isGif = mode === "gif";

  // 생성 중 가짜 진행률(0~1). GIF는 이미지보다 오래 걸리므로 예상시간을 달리 준다.
  const progress = useFakeProgress(
    loading,
    isGif ? GENERATION_ESTIMATE_MS.gif : GENERATION_ESTIMATE_MS.image,
  );

  // 활성 단가: GIF 모드는 단일 gifCreditCost, 이미지 모드는 선택 티어 단가.
  const tierCost = costByTier?.[activeTier] ?? creditCost;
  const activeCost = isGif ? gifCreditCost : tierCost;

  // 잔액이 비용의 1.5배 미만이면 생성 차단(비용 0=미구성이면 게이트 비활성).
  const blocked = isImageCreditBlocked(activeCost, creditBalance);
  const required = imageCreditRequired(activeCost);

  // GIF는 참조 이미지가 필수(image→video). 우측 인스펙터는 선택 이미지가 암묵 참조.
  const hasReference = Boolean(refUrl) || hasImplicitReference;
  const gifMissingRef = isGif && !hasReference;

  const handleRef = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!uploadFile) {
        setError(t("detailPage.aiGenerate.uploadNotWired"));
        return;
      }
      setError(null);
      setRefUploading(true);
      try {
        setRefUrl(await uploadFile(file));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("detailPage.aiGenerate.uploadFailed"));
      } finally {
        setRefUploading(false);
      }
    },
    [uploadFile, t],
  );

  // 프롬프트와 마킹본은 서로를 대신할 수 있다 — 손글씨로만 지시하는 것이 요점이라
  // 둘 중 하나만 있어도 생성이 돌아야 한다. 대신 둘 다 없으면 지시가 없는 요청이다.
  const runGenerate = useCallback(
    async (override?: { prompt?: string; annotatedImage?: string }) => {
    const finalPrompt = (override?.prompt ?? prompt).trim();
    const annotatedImage = override?.annotatedImage;
    if ((!finalPrompt && !annotatedImage) || loading || blocked) return;
    const generator = isGif ? onGenerateGif : onGenerate;
    if (!generator) {
      setError(t("detailPage.aiGenerate.generateNotWired"));
      return;
    }
    if (gifMissingRef) {
      setError(t("detailPage.aiGenerate.gifNeedsReference"));
      return;
    }
    setLoading(true);
    setError(null);
    setInsufficient(false);
    try {
      const referenceImages = refUrl ? [refUrl] : [];
      const brandId = brand.getStoredActiveBrandId() ?? undefined;
      const urls = isGif
        ? await onGenerateGif!({
            prompt: finalPrompt,
            referenceImages,
            transparent,
            brandId,
          })
        : await onGenerate!({
            prompt: finalPrompt,
            referenceImages,
            mode: refUrl ? "new_reference" : "based_on_existing",
            tier: activeTier,
            brandId,
            annotatedImage,
          });
      const url = urls[0];
      if (url) {
        // GIF는 항상 페이지에 삽입(우측 이미지 교체 대상 아님) + 애니 태깅.
        if (isGif) insertPersonalImage(store, url, { isGif: true });
        else if (onResult) onResult(url);
        else insertImage(store, url);
      } else
        setError(
          isGif
            ? t("detailPage.aiGenerate.noGif")
            : t("detailPage.aiGenerate.noImage"),
        );
    } catch (err) {
      // 생성기가 크레딧 부족을 알리면(422/402 등) 별도로 표기해 CTA를 띄운다.
      const maybe = err as { insufficientCredits?: boolean };
      if (maybe && maybe.insufficientCredits) {
        setInsufficient(true);
        setError(t("detailPage.aiGenerate.insufficientCredits"));
      } else {
        setError(err instanceof Error ? err.message : t("detailPage.aiGenerate.generateFailed"));
      }
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, blocked, isGif, gifMissingRef, transparent, onGenerate, onGenerateGif, refUrl, store, onResult, activeTier, t]);

  const handleGenerate = useCallback(() => {
    void runGenerate();
  }, [runGenerate]);

  // "그림으로 지시": 선택 이미지를 밑그림으로 띄우고, 표시한 마킹본과 글을 함께 보낸다.
  // 밑그림은 캔버스에 그릴 수 있는 바이트여야 해서(교차 출처면 합성이 터진다) 먼저
  // data URI 로 바꾼다 — 실패하면 진입점 자체를 열지 않는다.
  const [annotateBase, setAnnotateBase] = useState<string | null>(null);
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotatePreparing, setAnnotatePreparing] = useState(false);

  const openAnnotate = useCallback(async () => {
    if (!annotateBaseSrc) return;
    setAnnotatePreparing(true);
    setError(null);
    try {
      const dataUri = await toDrawableDataUri(annotateBaseSrc);
      if (!dataUri) {
        setError(
          t("detailPage.annotate.baseUnavailable", {
            defaultValue: "이 이미지 위에는 그릴 수 없어요. 프롬프트로 지시해 주세요.",
          }),
        );
        return;
      }
      setAnnotateBase(dataUri);
      setAnnotateOpen(true);
    } finally {
      setAnnotatePreparing(false);
    }
  }, [annotateBaseSrc, t]);

  const submitAnnotation = useCallback(
    ({
      instruction,
      annotatedImage,
    }: {
      instruction: string;
      annotatedImage: string | null;
    }) => {
      setAnnotateOpen(false);
      void runGenerate({
        prompt: instruction,
        annotatedImage: annotatedImage ?? undefined,
      });
    },
    [runGenerate],
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* 이미지 / GIF 토글 — GIF 생성이 배선된 경우에만 노출(미배선 패널에서 "연결 안 됨"
          막다른 길 방지). 좌측 자유 생성은 항상, 우측 편집 패널은 onGenerateGif 있을 때만. */}
      {onGenerateGif ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("image")}
            className={
              mode === "image"
                ? "flex h-10 items-center justify-center gap-2 rounded-dpe-md bg-dpe-ink-900 text-sm font-dpe-semibold text-dpe-on-accent"
                : "flex h-10 items-center justify-center gap-2 rounded-dpe-md border border-dpe-ink-200 text-sm font-dpe-medium text-dpe-ink-600 hover:bg-dpe-ink-50"
            }
          >
            <Sparkles aria-hidden="true" size={15} />
            {t("detailPage.aiGenerate.image")}
          </button>
          <button
            type="button"
            onClick={() => setMode("gif")}
            className={
              isGif
                ? "flex h-10 items-center justify-center gap-2 rounded-dpe-md bg-dpe-ink-900 text-sm font-dpe-semibold text-dpe-on-accent"
                : "flex h-10 items-center justify-center gap-2 rounded-dpe-md border border-dpe-ink-200 text-sm font-dpe-medium text-dpe-ink-600 hover:bg-dpe-ink-50"
            }
          >
            <Sparkles aria-hidden="true" size={15} />
            {t("detailPage.aiGenerate.gif")}
          </button>
        </div>
      ) : null}

      {/* GIF 모드: 배경 투명 토글(기본 ON). 상세페이지 움짤은 대체로 배경 투명. */}
      {isGif ? (
        <label className="flex cursor-pointer items-center justify-between rounded-dpe-md border border-dpe-ink-200 px-3 py-2.5">
          <span className="flex flex-col">
            <span className="text-sm font-dpe-medium text-dpe-ink-800">
              {t("detailPage.aiGenerate.transparentBg")}
            </span>
            <span className="text-[11px] leading-4 text-dpe-ink-500">
              {t("detailPage.aiGenerate.transparentBgHint")}
            </span>
          </span>
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
            className="h-4 w-4 accent-dpe-ink-900"
          />
        </label>
      ) : null}

      {/* 이미지 모델(티어) 선택 — GIF 모드는 단일 모델이라 숨긴다. */}
      <div hidden={isGif}>
        <div className="mb-2 flex items-center gap-1">
          <p className="text-xs font-dpe-medium text-dpe-ink-500">{t("detailPage.aiGenerate.imageModel")}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex h-4 w-4 items-center justify-center rounded-full text-dpe-ink-400 hover:text-dpe-ink-600"
                aria-label={t("detailPage.aiGenerate.modelQualityHelp")}
              >
                <Info aria-hidden="true" size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[240px] text-left">
              <p className="mb-1 font-dpe-semibold">{t("detailPage.aiGenerate.modelTooltipTitle")}</p>
              <ul className="space-y-1">
                {tierOptions.map((tk) => (
                  <li key={tk}>
                    <span className="font-dpe-medium">{IMAGE_TIER_META[tk].label}</span>
                    <span className="opacity-80"> · {IMAGE_TIER_META[tk].quality}</span>
                  </li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </div>
        <Select value={activeTier} onValueChange={(v) => setTier(v as ImageTier)}>
          <SelectTrigger className="h-10 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tierOptions.map((tk) => {
              const meta = IMAGE_TIER_META[tk];
              const cost = costByTier?.[tk];
              return (
                <SelectItem key={tk} value={tk} className="items-start py-2">
                  <div className="flex flex-col gap-0.5 pr-2">
                    <span className="flex items-center gap-1.5 text-sm font-dpe-medium text-dpe-ink-900">
                      {meta.label}
                      {meta.badge ? (
                        <span className="rounded-full bg-dpe-ink-900 px-1.5 py-px text-[10px] font-dpe-semibold text-dpe-on-accent">
                          {meta.badge}
                        </span>
                      ) : null}
                      {typeof cost === "number" && cost > 0 ? (
                        <span className="text-[11px] font-dpe-normal text-dpe-ink-500">
                          · {cost}cr
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[11px] leading-4 text-dpe-ink-500">
                      {meta.quality}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-[11px] leading-4 text-dpe-ink-500">
          {IMAGE_TIER_META[activeTier].description}
        </p>
      </div>

      {/* 참조 이미지.
          - 우측 인스펙터(hasImplicitReference + implicitReferenceSrc): 현재 선택된
            이미지가 곧 입력이므로, 업로드 칸 대신 그 이미지를 읽기 전용 예시로 띄운다.
            이미지 편집·GIF 재생성 둘 다 동일하게 선택 이미지가 참조로 들어간다.
          - 좌측 자유 생성: GIF는 참조 필수(image→video), 이미지는 선택 업로드. */}
      {hasImplicitReference && implicitReferenceSrc ? (
        <div>
          <p className="mb-2 text-xs font-dpe-medium text-dpe-ink-500">
            {t("detailPage.aiGenerate.currentImageLabel")}
          </p>
          <div className="relative overflow-hidden rounded-dpe-lg border border-dpe-ink-200 bg-dpe-ink-50">
            {/* crossOrigin: S3 이미지를 Origin 없이 그리면 ACAO 없는 응답이 캐시돼
                캔버스 crossOrigin 로드를 오염시킨다. 미리보기도 Origin을 실어 로드한다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={implicitReferenceSrc}
              crossOrigin="anonymous"
              alt={t("detailPage.aiGenerate.referenceAlt")}
              className="h-36 w-full object-contain"
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-dpe-ink-500">
            {isGif
              ? t("detailPage.aiGenerate.currentImageGifHint")
              : t("detailPage.aiGenerate.currentImageHint")}
          </p>
          {/* 그림으로 지시 — 이미지 모드에서만. GIF 는 이 이미지를 첫 프레임으로 그대로
              쓰므로 마킹이 결과에 남는다. */}
          {annotateBaseSrc && !isGif ? (
            <button
              type="button"
              onClick={() => void openAnnotate()}
              disabled={annotatePreparing || loading}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-dpe-md border border-dpe-ink-200 text-xs font-dpe-medium text-dpe-ink-700 hover:bg-dpe-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {annotatePreparing ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={14} />
              ) : (
                <Pencil aria-hidden="true" size={14} />
              )}
              {t("detailPage.annotate.open", { defaultValue: "그림으로 지시하기" })}
            </button>
          ) : null}
        </div>
      ) : (
      <div hidden={isGif && hasImplicitReference}>
        <p className="mb-2 text-xs font-dpe-medium text-dpe-ink-500">
          {t("detailPage.aiGenerate.referenceLabel")}{" "}
          {isGif ? (
            <span className="text-dpe-danger-500">*</span>
          ) : (
            t("detailPage.aiGenerate.referenceOptional")
          )}
        </p>
        {refUrl ? (
          <div className="relative overflow-hidden rounded-dpe-lg border border-dpe-ink-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={refUrl} crossOrigin="anonymous" alt={t("detailPage.aiGenerate.referenceAlt")} className="h-36 w-full object-cover" />
            <button
              type="button"
              onClick={() => setRefUrl(null)}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-dpe-scrim/60 text-dpe-on-accent hover:bg-dpe-scrim/80"
              aria-label={t("detailPage.aiGenerate.removeReference")}
            >
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        ) : (
          <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-dpe-lg border border-dashed border-dpe-ink-300 text-dpe-ink-400 hover:border-dpe-ink-400 hover:text-dpe-ink-500">
            {refUploading ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={22} />
            ) : (
              <ImagePlus aria-hidden="true" size={22} />
            )}
            <span className="text-xs">{t("detailPage.aiGenerate.attachHint")}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleRef}
            />
          </label>
        )}
      </div>
      )}

      {/* 프롬프트 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <label className="mb-2 text-xs font-dpe-medium text-dpe-ink-500">
          {t("detailPage.aiGenerate.prompt")} <span className="text-dpe-danger-500">*</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("detailPage.aiGenerate.promptPlaceholder")}
          className="min-h-[160px] flex-1 resize-none rounded-dpe-lg border border-dpe-ink-200 p-3 text-sm text-dpe-ink-800 outline-none placeholder:text-dpe-ink-400 focus:border-dpe-ink-400"
        />
      </div>

      {error ? (
        <p className="text-xs font-dpe-medium text-dpe-danger-600">{error}</p>
      ) : null}

      {/* 1.5× 안전 마진 미달(또는 생성 중 크레딧 부족) → 차단 안내 + 추가구매 CTA */}
      {activeCost > 0 && (blocked || insufficient) ? (
        <div className="rounded-dpe-lg border border-dpe-warn-200 bg-dpe-warn-50 px-3 py-2.5 text-center">
          <p className="text-[13px] font-dpe-medium text-dpe-warn-800">
            {t("detailPage.aiGenerate.insufficientCreditsTitle")}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-dpe-warn-700">
            {t("detailPage.aiGenerate.insufficientCreditsHint", { required, balance: creditBalance })}
          </p>
          <button
            type="button"
            onClick={onBuyCredits}
            disabled={!onBuyCredits}
            className="mt-2 inline-flex items-center gap-1.5 rounded-dpe-md bg-dpe-ink-900 px-3 py-1.5 text-xs font-dpe-medium text-dpe-on-accent disabled:opacity-40"
          >
            <Sparkles aria-hidden="true" size={13} />
            {t("detailPage.aiGenerate.buyCredits")}
          </button>
        </div>
      ) : null}

      {gifMissingRef ? (
        <p className="text-xs font-dpe-medium text-dpe-ink-500">
          {t("detailPage.aiGenerate.gifNeedsReference")}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading || !prompt.trim() || blocked || gifMissingRef}
        className={
          "relative flex h-11 items-center justify-center gap-2 overflow-hidden rounded-dpe-lg bg-dpe-ink-900 text-sm font-dpe-semibold text-dpe-on-accent " +
          (loading
            ? "cursor-progress"
            : "disabled:cursor-not-allowed disabled:opacity-40")
        }
      >
        {loading ? <GenerationProgressFill progress={progress} /> : null}
        <span className="relative z-10 flex items-center gap-2">
          {loading ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={16} />
          ) : (
            <Sparkles aria-hidden="true" size={16} />
          )}
          {loading
            ? (isGif
                ? t("detailPage.aiGenerate.generatingGif")
                : t("detailPage.aiGenerate.generating")) +
              " " +
              progressPercent(progress) +
              "%"
            : isGif
              ? t("detailPage.aiGenerate.generateGif")
              : onResult
                ? t("detailPage.aiGenerate.replaceImage")
                : t("detailPage.aiGenerate.generate")}
          {activeCost > 0 && !loading ? (
            <span className="text-xs font-dpe-normal opacity-80">· {activeCost}cr</span>
          ) : null}
        </span>
      </button>

      <AnnotationDialog
        open={annotateOpen}
        imageUrl={annotateBase}
        title={t("detailPage.annotate.imageTitle", {
          defaultValue: "그림으로 지시해 이미지 고치기",
        })}
        description={t("detailPage.annotate.imageDescription", {
          defaultValue:
            "바꿀 자리를 표시하고 어떻게 바꿀지 적어주세요. 표시하지 않은 곳은 그대로 둡니다.",
        })}
        submitLabel={t("detailPage.aiGenerate.replaceImage")}
        busy={loading}
        onSubmit={submitAnnotation}
        onClose={() => setAnnotateOpen(false)}
      />
    </div>
  );
}
