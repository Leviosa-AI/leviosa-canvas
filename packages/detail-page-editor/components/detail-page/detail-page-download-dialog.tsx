"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import { useDetailPageHost } from "./detail-page-host-context";
import { Download, ImageIcon, Loader2, X } from "lucide-react";

import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { ExportDocument } from "../../lib/detail-page-canvas/export/document-model";
import { detectGifPages } from "../../lib/detail-page-canvas/export/gif-plan";
import { activeFramePages } from "../../lib/detail-page/frame-pages";
import { isMp4EncodeSupported } from "../../lib/detail-page-canvas/export/mp4-support";
import {
  detailPageEditorProfile,
  type DetailPageEditorFormat,
} from "../../lib/detail-page/editor-profile";

/**
 * hookable-style 다운로드 팝오버 — 다운로드 버튼 바로 아래에 떠서 파일 형식 / 등록
 * 플랫폼 / 페이지 범위 / 한 장 병합 / 출력 해상도를 고른 뒤 클라이언트에서 직접
 * 파일을 내보낸다.
 *
 * PNG/JPG는 Canvas 공식 ``store.toDataURL({ pageId, pixelRatio })``를 페이지마다
 * 호출한다. 이 호출은 대상 페이지를 잠깐 강제 마운트하므로(스택 워크스페이스의
 * ``_exporting`` 분기가 이를 받아준다) 화면 밖 페이지도 풀 해상도로 잡힌다.
 *
 * PSD(포토샵 레이어 파일)와 SVG(피그마 호환)는 ``store.toJSON()`` 문서를
 * ``lib/detail-page-canvas/export``의 빌더로 직접 직렬화한다. ag-psd가 메인
 * 번들에 들어오지 않도록 해당 모듈은 내보내기 시점에 dynamic import 한다.
 */

type ExportPageLike = {
  id: string;
  computedWidth: number;
  computedHeight: number;
  /** 이 판이 속한 프레임 이름이 여기 산다(`custom.frame`). */
  custom?: unknown;
};

type ExportStoreLike = {
  pages: ExportPageLike[];
  activePage?: ExportPageLike;
  width: number;
  toDataURL: (opts: {
    pageId?: string;
    pixelRatio?: number;
    mimeType?: string;
  }) => Promise<string>;
  toJSON: () => Record<string, unknown>;
};

// 등록 플랫폼은 파일명 접미사에만 반영된다(상세페이지 폭은 750px 고정). 셀러가
// 어디에 올릴지 고르며 맥락을 잡도록 노출한다. 캐러셀은 인스타그램 한 곳으로만
// 나가므로 이 목록을 아예 안 띄운다 — `profile.registerPlatform` 이 그것을 정한다.
const PLATFORMS = [
  { value: "naver", label: "네이버 스마트 스토어" },
  { value: "coupang", label: "쿠팡" },
  { value: "cafe24", label: "카페24" },
  { value: "general", label: "일반(범용)" },
] as const;

type Format = DetailPageEditorFormat;
type Scope = "all" | "current";
type AnimationFormat = "webp" | "gif" | "mp4";

// 움직이는 섹션의 저장 형식. 기본이 WebP 인 이유는 화질·용량만이 아니다 — 쿠팡은
// 상세설명에 GIF 를 아예 받지 않고 WebP 만 받는다. GIF 는 카페24 와 메일처럼 WebP 를
// 못 받는 자리를 위해 남겨 둔다. MP4 는 네이버처럼 영상으로 붙이는 자리를 위한 것이고,
// 브라우저가 H.264 를 굽지 못하면 목록에서 빠진다.
const ANIMATION_FORMATS = [
  { value: "webp", labelKey: "editor.animationWebp", hintKey: "editor.animationWebpNote" },
  { value: "gif", labelKey: "editor.animationGif", hintKey: "editor.animationGifNote" },
  { value: "mp4", labelKey: "editor.animationMp4", hintKey: "editor.animationMp4Note" },
] as const;

/** 픽셀 형식만 병합 캔버스/해상도 슬라이더가 의미를 갖는다. */
const isRasterFormat = (f: Format) => f === "png" || f === "jpeg";

/** 일러스트레이터 아트보드 한계. 넘기면 파일을 열지 못한다. */
const AI_MAX_ARTBOARD = 16383;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

function triggerDownload(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  URL.revokeObjectURL(url);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isFontEmbeddingFailure(
  error: unknown,
): error is { code: "FONT_EMBEDDING_FAILED"; family: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "FONT_EMBEDDING_FAILED" &&
    "family" in error &&
    typeof error.family === "string"
  );
}

export const DetailPageDownloadDialog = observer(function DetailPageDownloadDialog({
  store,
  fileName = "detail-page",
  slotBindings,
}: {
  store: unknown;
  fileName?: string;
  /** PSD 레이어 이름에 쓰는 artifact slot_bindings (없어도 동작). */
  slotBindings?: Record<string, { element_id: string }>;
}) {
  const { t } = useTranslation("branding");
  const host = useDetailPageHost();
  const s = store as ExportStoreLike;
  const profile = detailPageEditorProfile();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>(profile.exports[0]);
  const [platform, setPlatform] = useState<string>("naver");
  const [scope, setScope] = useState<Scope>("all");
  const [single, setSingle] = useState(true);
  const [resolution, setResolution] = useState(1);
  const [animationFormat, setAnimationFormat] = useState<AnimationFormat>("webp");
  // 움직이는 섹션이 하나라도 있을 때만 형식 선택이 의미가 있다. toJSON 은 문서
  // 전체를 훑으므로 렌더마다 부르지 않고 팝오버를 열 때 한 번만 본다.
  const [hasAnimation, setHasAnimation] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Per-page export progress for the button label (raster path). null = no
  // page-by-page phase running (idle, or PSD/SVG which export in one shot).
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 팝오버 바깥 클릭 / ESC로 닫기.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      // Radix Select의 옵션 리스트는 body 포털에 뜨므로 rootRef 밖이다 — 셀렉트
      // 조작이 팝오버 전체를 닫아버리지 않도록 리스트박스 내부 클릭은 무시한다.
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[role="listbox"], [role="option"]')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      setHasAnimation(detectGifPages(s.toJSON() as ExportDocument).some(Boolean));
    } catch {
      setHasAnimation(false);
    }
  }, [open, s]);

  // MP4 는 브라우저의 H.264 인코더로 굽는다. 없는 브라우저에서는 고를 수 있게 두면
  // 내보내기를 눌러야 실패를 알게 되므로, 아예 목록에서 뺀다.
  const animationFormats = useMemo(
    () => ANIMATION_FORMATS.filter((f) => f.value !== "mp4" || isMp4EncodeSupported()),
    [],
  );

  const selectedPages = useMemo(() => {
    if (scope === "current" && s.activePage) return [s.activePage];
    // 후보 여러 벌이 한 문서에 있으면 «전체»는 문서 전체가 아니라 **보고 있는 한 벌**
    // 이다. 넷을 다 내보내면 마흔 장짜리 묶음이 나오고, 그걸 원해서 누르는 사람은
    // 없다. 꼬리표 없는 문서에서는 지금까지처럼 전부다.
    return activeFramePages(s.pages, s.activePage?.id);
  }, [scope, s.activePage, s.pages]);

  const docWidth = useMemo(
    () => Math.max(1, s.width, ...s.pages.map((p) => p.computedWidth)),
    [s.width, s.pages],
  );
  const totalHeight = useMemo(
    () => selectedPages.reduce((acc, p) => acc + p.computedHeight, 0),
    [selectedPages],
  );
  const outWidth = Math.round(docWidth * resolution);
  const outHeight = Math.round(totalHeight * resolution);
  // 상세페이지는 세로로 길어서, 병합하면 아트보드 한계를 넘길 수 있다.
  const aiOverflow = format === "ai" && single && totalHeight > AI_MAX_ARTBOARD;

  const handleExport = async () => {
    if (exporting || selectedPages.length === 0) return;
    setExporting(true);
    setError(null);
    const mime = format === "png" ? "image/png" : "image/jpeg";
    const ext = format === "png" ? "png" : "jpg";
    const base = profile.registerPlatform ? `${fileName}-${platform}` : fileName;
    try {
      if (format === "psd" || format === "svg" || format === "ai") {
        // 문서 JSON 기반 내보내기. ag-psd 포함 모듈은 이 시점에만 로드한다.
        const exportLib = await import("../../lib/detail-page-canvas/export/export-files");
        const doc = s.toJSON() as ExportDocument;
        const pageIds = selectedPages.map((p) => p.id);
        if (format === "psd") {
          const blob = await exportLib.exportPsdBlob(doc, { slotBindings, pageIds });
          exportLib.downloadBlob(blob, `${base}.psd`);
        } else if (format === "ai") {
          // 아트보드 한계를 넘으면 일러스트레이터가 파일을 아예 열지 못하므로,
          // 병합 대신 페이지별 아트보드로 내린다(무엇을 했는지는 아래에 표시된다).
          const merged = single && !aiOverflow;
          const blob = await exportLib.exportAiBlob(doc, { pageIds, merged });
          exportLib.downloadBlob(blob, `${base}.ai`);
        } else {
          const blobs = await exportLib.exportSvgBlobs(doc, { pageIds, merged: single });
          for (let i = 0; i < blobs.length; i++) {
            const suffix = blobs.length > 1 ? `-${String(i + 1).padStart(2, "0")}` : "";
            exportLib.downloadBlob(blobs[i], `${base}${suffix}.svg`);
            if (blobs.length > 1) await delay(180);
          }
        }
        setOpen(false);
        return;
      }

      // GIF sections can't be flattened into a still. If any selected section
      // holds a GIF, export a ZIP: contiguous stills stack into PNGs and each
      // GIF section is encoded as its own animated .gif. (Vector/PSD formats
      // took the early return above and keep a first-frame still.)
      const pageIds = selectedPages.map((p) => p.id);
      const gifFlags = detectGifPages(s.toJSON() as ExportDocument, pageIds);
      if (gifFlags.some(Boolean)) {
        setProgress({ done: 0, total: gifFlags.length });
        const gifLib = await import("../../lib/detail-page-canvas/export/gif-export");
        const zip = await gifLib.exportGifZip(s, {
          host,
          pageIds,
          gifFlags,
          pixelRatio: resolution,
          mimeType: mime,
          ext,
          animationFormat,
          onProgress: (done, total) => setProgress({ done, total }),
        });
        triggerBlobDownload(zip, `${base}.zip`);
        setOpen(false);
        return;
      }

      const dataUrls: string[] = [];
      // Each page is force-mounted and rasterized in turn, so this loop is the
      // long pole — surface it as (done/total) on the button.
      setProgress({ done: 0, total: selectedPages.length });
      for (const page of selectedPages) {
        dataUrls.push(
          await s.toDataURL({ pageId: page.id, pixelRatio: resolution, mimeType: mime }),
        );
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }

      if (single && dataUrls.length > 1) {
        const images = await Promise.all(dataUrls.map(loadImage));
        const width = Math.max(...images.map((img) => img.width));
        const height = images.reduce((acc, img) => acc + img.height, 0);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas 2d context unavailable");
        // JPEG는 투명도가 없으므로 흰 배경을 깔아 검게 합성되는 것을 막는다.
        if (format === "jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        }
        let y = 0;
        for (const img of images) {
          ctx.drawImage(img, 0, y);
          y += img.height;
        }
        triggerDownload(canvas.toDataURL(mime, 0.95), `${base}.${ext}`);
      } else if (dataUrls.length === 1) {
        triggerDownload(dataUrls[0], `${base}.${ext}`);
      } else {
        // 페이지별 개별 파일. 브라우저가 연속 다운로드를 막지 않도록 짧게 끊어준다.
        for (let i = 0; i < dataUrls.length; i++) {
          triggerDownload(dataUrls[i], `${base}-${String(i + 1).padStart(2, "0")}.${ext}`);
          await delay(180);
        }
      }
      setOpen(false);
    } catch (err) {
      setError(
        isFontEmbeddingFailure(err)
          ? t("editor.fontEmbeddingFailed", { font: err.family })
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-le-md bg-le-ink-900 px-3 text-sm font-le-semibold text-le-on-accent transition-colors hover:bg-le-ink-800"
      >
        <Download aria-hidden="true" size={16} />
        {t("editor.download")}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t("editor.downloadTitle")}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 rounded-le-xl border border-le-ink-200 bg-le-surface p-4 shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-le-semibold text-le-ink-950">
              {t("editor.downloadTitle")}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("editor.close")}
              className="flex h-7 w-7 items-center justify-center rounded-le-md text-le-ink-400 hover:bg-le-ink-100 hover:text-le-ink-700"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-le-ink-500">{t("editor.fileFormat")}</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
                <SelectTrigger className="w-full">
                  <span className="inline-flex items-center gap-2">
                    <ImageIcon size={15} className="text-le-ink-500" />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {profile.exports.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "png"
                        ? "PNG"
                        : value === "jpeg"
                          ? "JPG"
                          : t(`editor.format${value[0].toUpperCase()}${value.slice(1)}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {profile.registerPlatform && (
              <div className="space-y-1.5">
                <Label className="text-xs text-le-ink-500">
                  {t("editor.registerPlatform")}
                </Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-le-ink-500">{t("editor.pageScope")}</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("editor.pageScopeAll")}</SelectItem>
                  <SelectItem value="current">{t("editor.pageScopeCurrent")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PSD는 페이지가 레이어 그룹으로 항상 한 파일이고, 해상도는 문서
                픽셀(1×) 고정. SVG/AI는 벡터라 해상도 개념이 없고 병합 여부만 고른다
                (AI는 항상 한 파일이고, 스위치는 아트보드를 합칠지를 고른다). */}
            {format !== "psd" ? (
              <label className="flex cursor-pointer items-center gap-2.5 py-0.5">
                <Switch checked={single} onCheckedChange={setSingle} />
                <span className="text-sm text-le-ink-700">
                  {format === "ai"
                    ? t("editor.mergeArtboard")
                    : format === "svg"
                      ? t("editor.mergeSingleFile")
                      : t("editor.mergeSingle")}
                </span>
              </label>
            ) : null}

            {isRasterFormat(format) ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-le-ink-500">{t("editor.resolution")}</Label>
                  <span className="text-xs font-le-semibold text-le-ink-700">{resolution}×</span>
                </div>
                <Slider
                  min={1}
                  max={4}
                  step={1}
                  value={[resolution]}
                  onValueChange={(v) => setResolution(v[0] ?? 1)}
                />
                <div className="flex justify-between text-[10px] text-le-ink-400">
                  <span>1×</span>
                  <span>4×</span>
                </div>
              </div>
            ) : null}

            {/* 움직이는 섹션은 정지 이미지로 눌러 담을 수 없어 ZIP 안에 따로 담긴다.
                벡터·PSD는 위에서 일찍 빠져나가 첫 프레임 정지본만 남으므로, 이
                선택은 픽셀 형식일 때만 의미가 있다. */}
            {hasAnimation && isRasterFormat(format) ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-le-ink-500">
                  {t("editor.animationFormat")}
                </Label>
                <Select
                  value={animationFormat}
                  onValueChange={(v) => setAnimationFormat(v as AnimationFormat)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {animationFormats.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {t(f.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] leading-relaxed text-le-ink-400">
                  {t(
                    ANIMATION_FORMATS.find((f) => f.value === animationFormat)?.hintKey ??
                      "",
                  )}
                </p>
              </div>
            ) : null}

            <div className="rounded-le-lg bg-le-ink-50 p-3 text-xs text-le-ink-600">
              <p className="mb-1 font-le-semibold text-le-ink-700">{t("editor.downloadInfo")}</p>
              <ul className="space-y-0.5">
                <li>• {t("editor.pagesCount", { count: selectedPages.length })}</li>
                <li>
                  •{" "}
                  {format === "svg" || format === "ai"
                    ? t("editor.vectorOutput")
                    : `${(isRasterFormat(format) ? outWidth : docWidth).toLocaleString()} × ${(isRasterFormat(format) ? outHeight : totalHeight).toLocaleString()} px`}
                </li>
                {format === "psd" ? <li>• {t("editor.psdNote")}</li> : null}
                {format === "svg" ? <li>• {t("editor.svgNote")}</li> : null}
                {format === "ai" ? <li>• {t("editor.aiNote")}</li> : null}
                {aiOverflow ? (
                  <li className="text-le-warn-700">
                    • {t("editor.aiOverflowNote", { limit: AI_MAX_ARTBOARD.toLocaleString() })}
                  </li>
                ) : null}
              </ul>
            </div>

            {error ? (
              <p className="text-xs font-le-medium text-le-danger-600">{error}</p>
            ) : null}

            <Button
              type="button"
              onClick={handleExport}
              disabled={exporting || selectedPages.length === 0}
              className="h-11 w-full bg-le-ink-900 text-sm font-le-semibold hover:bg-le-ink-800"
            >
              {exporting ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t("editor.exporting")}
                  {progress ? ` (${progress.done}/${progress.total})` : null}
                </>
              ) : (
                t("editor.downloadAction")
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
DetailPageDownloadDialog.displayName = "DetailPageDownloadDialog";
