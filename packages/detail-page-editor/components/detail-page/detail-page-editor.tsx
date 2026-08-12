"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EditorHotkeys } from "./editor-hotkeys";
import { FindReplacePanel } from "./find-replace-panel";

import {
  ChevronLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  ListChecks,
  RefreshCw,
  Save,
} from "lucide-react";

import {
  applyTextLineFit,
  clearPlaceholderImageSrc,
} from "../../lib/detail-page-canvas/custom-props-adapter";
import { CanvasStoreContext } from "./canvas-observer";
import { LeviosaCanvasWorkspace } from "./leviosa-canvas-workspace";
import { DetailPagePagesTimeline } from "./detail-page-pages-timeline";
import {
  SidePanel as LeviosaSidePanel,
  ZoomButtons as LeviosaZoomButtons,
} from "@leviosa-ai/canvas";
import { createCanvasStore } from "@leviosa-ai/canvas/store";
import { collectFontRequests } from "@leviosa-ai/canvas/render/use-document-fonts";
import { ensureCanvasKey } from "../../lib/detail-page-canvas/canvas-key";
import { loadEditorFont } from "../../lib/detail-page-canvas/editor-fonts";
import { normalizeDocumentAssetSrcs } from "../../lib/detail-page/asset-bytes-url";
import type { DocumentJson } from "@leviosa-ai/canvas/types";
import { buildDetailPageSections } from "./detail-page-sidebar-sections";
import { DetailPageProperties } from "./detail-page-properties-panel";
import type { ImageTier } from "../../lib/detail-page/image-credit";
import { DetailPageHistoryButtons } from "./detail-page-history-buttons";
import { DetailPageDownloadDialog } from "./detail-page-download-dialog";
import { useDetailPageHost } from "./detail-page-host-context";
import { SectionReauthorController } from "./section-reauthor-controller";
import type {
  GenerateGifFn,
  GenerateImageFn,
  GenerateImageGifFn,
  GenerateTextGifFn,
  GenerateDataGifFn,
  RemoveBackgroundFn,
} from "./ai-generate-panel";
import type {
  LeviosaCanvasDocument,
  CanvasSlotBinding,
} from "../../types/detail-page-canvas";

export type DetailPageEditorProps = {
  initialDocument: LeviosaCanvasDocument;
  saving?: boolean;
  uploadFile?: (file: File) => Promise<string>;
  onSave: (document: LeviosaCanvasDocument) => Promise<void>;
  /** AI 생성 탭의 프롬프트 → 이미지 URL 콜백. 없으면 패널은 안내만 표시. */
  onGenerateImage?: GenerateImageFn;
  /** AI 생성 탭의 프롬프트 → 애니메이션 GIF URL 콜백. 없으면 GIF 모드는 안내만 표시. */
  onGenerateGif?: GenerateGifFn;
  /** 텍스트 인스펙터 '텍스트를 GIF로' → GIF URL 콜백. 없으면 섹션 숨김. */
  onGenerateTextGif?: GenerateTextGifFn;
  /** 이미지 인스펙터 '이미지를 GIF로' → GIF URL 콜백. 없으면 섹션 숨김. */
  onGenerateImageGif?: GenerateImageGifFn;
  /** 수치를 GIF로(카운트업·셀 차오름) → GIF URL 콜백. 없으면 두 섹션 숨김. */
  onGenerateDataGif?: GenerateDataGifFn;
  /** 이미지 인스펙터 '배경 지우기' → 컷아웃 URL 콜백. 없으면 섹션 숨김. */
  onRemoveBackground?: RemoveBackgroundFn;
  /** AI GIF 1회 생성 비용(크레딧, feature_costs). 0/미지정이면 크레딧 UI 숨김. */
  gifCreditCost?: number;
  /** 텍스트 GIF 1회 생성 비용(크레딧, feature_costs). */
  textGifCreditCost?: number;
  /** 이미지 GIF 1회 생성 비용(크레딧, feature_costs). */
  imageGifCreditCost?: number;
  /** 수치 GIF 1회 생성 비용(크레딧, feature_costs). */
  dataGifCreditCost?: number;
  /** 배경 제거 1회 비용(크레딧, feature_costs). */
  bgRemoveCreditCost?: number;
  /**
   * AI 이미지 1회 생성/편집 비용(크레딧, 중앙 feature_costs). 0/미지정이면 크레딧 UI
   * 숨김. 잔액과 함께 1.5× 안전 마진 게이트에 쓴다.
   */
  imageCreditCost?: number;
  /** 현재 보유 크레딧 잔액. useCredits를 요구하므로 (app) 셸 호스트가 주입한다. */
  imageCreditBalance?: number;
  /**
   * 티어별(basic/pro/max) 라이브 크레딧 단가. 모델 드롭다운의 각 항목 비용/게이트에
   * 쓴다. 인증된 호스트가 공유 훅으로 feature_costs에서 계산해 주입한다.
   */
  imageCostByTier?: Partial<Record<ImageTier, number>>;
  /**
   * 생성 인스턴스 ID. 주어지면 텍스트 요소 선택 시 우측에 "프롬프트로 편집"이
   * 노출된다(소싱 서버 카피 엔진 호출). dev 하네스는 scratch ID를 주입한다.
   */
  generatedId?: string;
  /**
   * 좌측 "구조" 탭에 꽂을 패널. 조합 정보(아키타입·현재 벡터·플랜)는 편집기가
   * 아니라 편집기를 띄운 화면이 아므로 만들어진 노드를 그대로 받는다.
   */
  structurePanel?: ReactNode;
  /** 헤더에 표시할 현재 상품/상세페이지 이름. 없으면 기본 라벨. */
  productName?: string;
  /** 헤더 좌측 "뒤로가기" 동작. 없으면 버튼을 숨긴다. */
  onBack?: () => void;
  /**
   * 헤더 우측 끝에 끼울 앱 공용 크롬(크레딧·알림·언어 등). 이 컴포넌트들은 (app)
   * 셸의 컨텍스트를 요구하므로 에디터가 직접 import하지 않고 호스트에서 주입한다.
   */
  headerActions?: ReactNode;
};

type CanvasJson = Record<string, unknown>;

type CanvasJsonElement = Record<string, unknown> & {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  src?: string;
  custom?: Record<string, unknown>;
  children?: CanvasJsonElement[];
};

type SlotInspection = {
  slot: string;
  binding?: CanvasSlotBinding;
  element?: CanvasJsonElement;
  pageId?: string;
  state: "ok" | "warning" | "error";
  message: string;
};

type TemplateLintIssue = {
  level: "error" | "warning" | "info";
  title: string;
  detail: string;
  slot?: string;
  elementId?: string;
};

type TemplateQaSnapshot = {
  json: CanvasJson;
  slots: SlotInspection[];
  lint: TemplateLintIssue[];
  summary: string;
  counts: {
    pages: number;
    elements: number;
    slots: number;
    errors: number;
    warnings: number;
  };
};

const QA_OVERLAY_CUSTOM_KEY = "leviosaQaOverlay";
const QA_OVERLAY_PREFIX = "leviosa-qa-overlay";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isQaOverlayElement(element: CanvasJsonElement): boolean {
  return element.id?.startsWith(`${QA_OVERLAY_PREFIX}-`) === true ||
    element.custom?.[QA_OVERLAY_CUSTOM_KEY] === true;
}

function walkElements(
  json: CanvasJson,
  visitor: (element: CanvasJsonElement, page: Record<string, unknown>) => void,
) {
  for (const page of asArray(json.pages) as Array<Record<string, unknown>>) {
    const visit = (element: CanvasJsonElement) => {
      visitor(element, page);
      for (const child of asArray(element.children) as CanvasJsonElement[]) {
        visit(child);
      }
    };
    for (const element of asArray(page.children) as CanvasJsonElement[]) {
      visit(element);
    }
  }
}

function stripQaOverlayElements(json: CanvasJson): CanvasJson {
  const clone = JSON.parse(JSON.stringify(json)) as CanvasJson;
  const strip = (elements: CanvasJsonElement[]): CanvasJsonElement[] =>
    elements
      .filter((element) => !isQaOverlayElement(element))
      .map((element) => ({
        ...element,
        children: Array.isArray(element.children)
          ? strip(element.children)
          : element.children,
      }));

  clone.pages = (asArray(clone.pages) as Array<Record<string, unknown>>).map((page) => ({
    ...page,
    children: strip(asArray(page.children) as CanvasJsonElement[]),
  }));
  return clone;
}

function getSlotFromElement(element: CanvasJsonElement): string {
  const custom = asRecord(element.custom);
  return typeof custom.leviosaSlot === "string" ? custom.leviosaSlot : "";
}

function getElementKind(element?: CanvasJsonElement): CanvasSlotBinding["kind"] | null {
  if (!element) return null;
  if (element.type === "image") return "image";
  if (element.type === "text") return "text";
  return null;
}

function formatRect(element?: CanvasJsonElement): string {
  if (!element) return "-";
  const x = finiteNumber(element.x) ?? 0;
  const y = finiteNumber(element.y) ?? 0;
  const width = finiteNumber(element.width) ?? 0;
  const height = finiteNumber(element.height) ?? 0;
  return `${Math.round(x)}, ${Math.round(y)} / ${Math.round(width)} x ${Math.round(height)}`;
}

function buildQaSnapshot(
  document: LeviosaCanvasDocument,
  json: CanvasJson,
): TemplateQaSnapshot {
  const cleanJson = stripQaOverlayElements(json);
  const pages = asArray(cleanJson.pages) as Array<Record<string, unknown>>;
  const elementById = new Map<string, { element: CanvasJsonElement; pageId?: string }>();
  const slotByElementId = new Map<string, string[]>();
  const slotsFromElements = new Map<string, { element: CanvasJsonElement; pageId?: string }>();
  let elementCount = 0;

  walkElements(cleanJson, (element, page) => {
    elementCount += 1;
    if (element.id) {
      const pageId = typeof page.id === "string" ? page.id : undefined;
      elementById.set(element.id, { element, pageId });
      const slot = getSlotFromElement(element);
      if (slot) slotsFromElements.set(slot, { element, pageId });
    }
  });

  for (const [slot, binding] of Object.entries(document.slot_bindings)) {
    const list = slotByElementId.get(binding.element_id) ?? [];
    list.push(slot);
    slotByElementId.set(binding.element_id, list);
  }

  const lint: TemplateLintIssue[] = [];
  const slots = Object.entries(document.slot_bindings)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slot, binding]) => {
      const target = elementById.get(binding.element_id);
      const element = target?.element;
      const inferredKind = getElementKind(element);
      let state: SlotInspection["state"] = "ok";
      let message = "연결됨";

      if (!element) {
        state = "error";
        message = "바인딩 대상 요소가 없습니다";
        lint.push({
          level: "error",
          title: "Missing binding target",
          detail: `${binding.element_id} 요소를 찾을 수 없습니다.`,
          slot,
          elementId: binding.element_id,
        });
      } else if (inferredKind && inferredKind !== binding.kind) {
        state = "warning";
        message = `${binding.kind} 슬롯이 ${element.type} 요소에 연결됨`;
        lint.push({
          level: "warning",
          title: "Slot kind mismatch",
          detail: `${binding.kind} 슬롯이 ${element.type} 요소에 연결되어 있습니다.`,
          slot,
          elementId: binding.element_id,
        });
      }

      if (element?.type === "text" && !String(element.text ?? "").trim()) {
        state = state === "error" ? state : "warning";
        message = "텍스트가 비어 있습니다";
        lint.push({
          level: "warning",
          title: "Empty text slot",
          detail: "텍스트 요소에 표시할 문구가 없습니다.",
          slot,
          elementId: binding.element_id,
        });
      }

      if (element?.type === "image" && !String(element.src ?? "").trim()) {
        state = state === "error" ? state : "warning";
        message = "이미지 URL이 비어 있습니다";
        lint.push({
          level: "warning",
          title: "Empty image slot",
          detail: "이미지 요소에 src가 없습니다.",
          slot,
          elementId: binding.element_id,
        });
      }

      const width = finiteNumber(element?.width);
      const height = finiteNumber(element?.height);
      if (element && (width === null || height === null || width <= 0 || height <= 0)) {
        state = state === "error" ? state : "warning";
        message = "요소 크기를 확인하세요";
        lint.push({
          level: "warning",
          title: "Invalid element bounds",
          detail: "요소의 width 또는 height가 0 이하입니다.",
          slot,
          elementId: binding.element_id,
        });
      }

      return {
        slot,
        binding,
        element,
        pageId: target?.pageId,
        state,
        message,
      };
    });

  for (const [elementId, slotNames] of slotByElementId) {
    if (slotNames.length > 1) {
      lint.push({
        level: "warning",
        title: "Duplicate element binding",
        detail: `${slotNames.join(", ")} 슬롯이 같은 요소를 공유합니다.`,
        elementId,
      });
    }
  }

  for (const [slot, target] of slotsFromElements) {
    if (!document.slot_bindings[slot]) {
      lint.push({
        level: "info",
        title: "Unregistered slot marker",
        detail: "요소 custom.leviosaSlot은 있지만 slot_bindings에는 없습니다.",
        slot,
        elementId: target.element.id,
      });
    }
  }

  const canvasWidth = finiteNumber(document.canvas.width);
  const jsonWidth = finiteNumber(cleanJson.width);
  if (canvasWidth && jsonWidth && canvasWidth !== jsonWidth) {
    lint.push({
      level: "warning",
      title: "Canvas width drift",
      detail: `문서 canvas.width ${canvasWidth}와 문서 JSON width ${jsonWidth}가 다릅니다.`,
    });
  }

  const errors = lint.filter((issue) => issue.level === "error").length;
  const warnings = lint.filter((issue) => issue.level === "warning").length;
  const summary = [
    `Template: ${document.template_id ?? "unspecified"} v${document.template_version ?? "-"}`,
    `Canvas: ${cleanJson.width ?? document.canvas.width} x ${cleanJson.height ?? "-"}`,
    `Pages: ${pages.length}, Elements: ${elementCount}, Slots: ${slots.length}`,
    `Lint: ${errors} errors, ${warnings} warnings`,
    "",
    "Slots",
    ...slots.map(
      (slot) =>
        `- ${slot.slot}: ${slot.state.toUpperCase()} | ${slot.binding?.kind ?? "-"} | ${slot.binding?.element_id ?? "-"} | ${formatRect(slot.element)} | ${slot.message}`,
    ),
    "",
    "Lint",
    ...(lint.length
      ? lint.map(
          (issue) =>
            `- ${issue.level.toUpperCase()}: ${issue.title}${issue.slot ? ` (${issue.slot})` : ""} - ${issue.detail}`,
        )
      : ["- PASS: template lint found no blocking issues"]),
  ].join("\n");

  return {
    json: cleanJson,
    slots,
    lint,
    summary,
    counts: {
      pages: pages.length,
      elements: elementCount,
      slots: slots.length,
      errors,
      warnings,
    },
  };
}

export function DetailPageEditor({
  initialDocument,
  saving = false,
  uploadFile,
  onSave,
  onGenerateImage,
  onGenerateGif,
  onGenerateTextGif,
  onGenerateImageGif,
  onGenerateDataGif,
  onRemoveBackground,
  gifCreditCost = 0,
  textGifCreditCost = 0,
  imageGifCreditCost = 0,
  dataGifCreditCost = 0,
  bgRemoveCreditCost = 0,
  imageCreditCost = 0,
  imageCreditBalance = 0,
  imageCostByTier,
  generatedId,
  structurePanel,
  productName,
  onBack,
  headerActions,
}: DetailPageEditorProps) {
  const { t } = useTranslation("branding");
  // 요금제 모달은 호스트가 꽂는다 — 편집기가 열지만 무엇을 얼마에 파는지는 앱이 안다.
  const { slots } = useDetailPageHost();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  // 편집 한도 소진 시 "편집 크레딧 추가하기" → pricing 모달을 인플레이스로 연다.
  const [pricingOpen, setPricingOpen] = useState(false);
  const [qaJson, setQaJson] = useState<CanvasJson>(initialDocument.canvas_json);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  // 어댑터를 안 거친다. `adaptLeviosaCustomProps`는 SDK가 **못 읽는** 장식을 읽을 수
  // 있는 모양으로 낮춰 주던 일이었고(그림자·그라데이션 → 대표 단색), 우리 렌더러는
  // 그 필드들을 원본 그대로 읽는다. 낮춘 것을 넣으면 오히려 원본보다 못한 그림이 된다.
  // 브랜드 자산 주소는 바이트 경로로 옮겨서 연다 — 302 를 따라가면 CORS 가 깨져서
  // 캔버스가 그림을 못 읽는다(asset-bytes-url 에 실측 표를 적어 뒀다).
  const store = useMemo(() => {
    ensureCanvasKey();
    return createCanvasStore(
      normalizeDocumentAssetSrcs(initialDocument.canvas_json) as DocumentJson,
    );
  }, [initialDocument.canvas_json]);

  const qaSnapshot = useMemo(
    () => buildQaSnapshot(initialDocument, qaJson),
    [initialDocument, qaJson],
  );

  // 글꼴 준비. 문서가 쓰는 얼굴을 전부 받아 놓고, 다 온 뒤에 줄바꿈 손질
  // (`applyTextLineFit`)을 한 번 돌린다 — 폴백 서체로 재면 과대측정해서 손질이
  // 건너뛰어진다. 하니스(`/dev-canvas`)가 쓰는 순서와 같다.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      collectFontRequests(store).map((request) =>
        loadEditorFont(request).catch(() => undefined),
      ),
    )
      .then(() => document.fonts.ready)
      .then(() => {
        if (!cancelled) applyTextLineFit(store);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    // Initial sync is immediate so the QA panel is populated on mount.
    setQaJson(stripQaOverlayElements(store.toJSON() as CanvasJson));

    // 스토어는 요소를 끄는 내내 "change"를 계속 쏜다 — 끌기·크기조절·타이핑 모두.
    // or typed into. Recomputing the QA snapshot on every event deep-clones and
    // walks the whole document many times per second, which freezes the canvas
    // layer on large detail-page documents. The QA panel does not need live
    // updates mid-gesture, so coalesce changes with a trailing debounce: the
    // snapshot refreshes ~300ms after the user stops interacting.
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 바뀐 문서를 이벤트에 실어 받지 않고 **잠잠해진 뒤에** 한 번 읽는다. 글자 한 자마다
    // 문서 전체를 직렬화해 넘기면 그 비용이 타이핑 지연으로 그대로 보인다.
    const flush = () => {
      timer = null;
      setQaJson(stripQaOverlayElements(store.toJSON() as CanvasJson));
    };
    const off = store.on("change", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 300);
    });
    return () => {
      if (timer) clearTimeout(timer);
      off();
    };
  }, [store]);

  useEffect(() => {
    setSummaryCopied(false);
  }, [qaSnapshot.summary]);

  const removeOverlayElements = () => {
    const ids: string[] = [];
    walkElements(store.toJSON() as CanvasJson, (element) => {
      if (element.id && isQaOverlayElement(element)) ids.push(element.id);
    });
    if (ids.length) store.deleteElements(ids);
  };

  const addOverlayElements = () => {
    removeOverlayElements();
    const cleanJson = qaSnapshot.json;
    const pages = asArray(cleanJson.pages) as Array<Record<string, unknown>>;
    for (const slot of qaSnapshot.slots) {
      if (!slot.element || !slot.element.id || !slot.pageId) continue;
      const pageIndex = pages.findIndex((page) => page.id === slot.pageId);
      const page = store.pages[pageIndex >= 0 ? pageIndex : 0];
      if (!page) continue;
      const x = finiteNumber(slot.element.x) ?? 0;
      const y = finiteNumber(slot.element.y) ?? 0;
      const width = Math.max(finiteNumber(slot.element.width) ?? 1, 1);
      const height = Math.max(finiteNumber(slot.element.height) ?? 1, 1);
      const color = slot.state === "error" ? "#dc2626" : slot.state === "warning" ? "#d97706" : "#059669";
      page.addElement(
        {
          id: `${QA_OVERLAY_PREFIX}-box-${slot.element.id}`,
          type: "figure",
          subType: "rect",
          x,
          y,
          width,
          height,
          fill: "rgba(255,255,255,0)",
          stroke: color,
          strokeWidth: 3,
          dash: [10, 6] as never,
          selectable: false,
          removable: false,
          alwaysOnTop: true,
          showInExport: false,
          custom: { [QA_OVERLAY_CUSTOM_KEY]: true, slot: slot.slot },
        },
        { skipSelect: true },
      );
      page.addElement(
        {
          id: `${QA_OVERLAY_PREFIX}-label-${slot.element.id}`,
          type: "text",
          x,
          y: Math.max(0, y - 30),
          width: Math.max(120, Math.min(width, 320)),
          height: 24,
          text: slot.slot,
          fontSize: 14,
          fontWeight: "700",
          fill: "#ffffff",
          backgroundEnabled: true,
          backgroundColor: color,
          backgroundOpacity: 0.92,
          backgroundCornerRadius: 4,
          backgroundPadding: 6,
          selectable: false,
          removable: false,
          alwaysOnTop: true,
          showInExport: false,
          custom: { [QA_OVERLAY_CUSTOM_KEY]: true, slot: slot.slot },
        },
        { skipSelect: true },
      );
    }
  };

  useEffect(() => {
    if (overlayEnabled) addOverlayElements();
    else removeOverlayElements();
    return removeOverlayElements;
    // The overlay is intentionally regenerated from the latest QA snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayEnabled, qaSnapshot.summary, store]);

  const handleSave = async () => {
    setSaveError(null);
    setSaveOk(false);
    try {
      // Drop QA overlays and revert gray image placeholders to empty src so the
      // persisted document never carries the editor-only placeholder.
      const cleanJson = clearPlaceholderImageSrc(
        stripQaOverlayElements(store.toJSON() as CanvasJson),
      );
      await onSave({
        ...initialDocument,
        canvas_json: cleanJson,
      });
      setSaveOk(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("editor.saveError"));
    }
  };

  const handleRefreshQa = () => {
    setQaJson(stripQaOverlayElements(store.toJSON() as CanvasJson));
  };

  const handleSelectSlot = (slot: SlotInspection) => {
    if (slot.binding?.element_id) {
      store.selectElements([slot.binding.element_id]);
    }
  };

  const handleCopySummary = async () => {
    await navigator.clipboard.writeText(qaSnapshot.summary);
    setSummaryCopied(true);
  };

  const handleDownloadSummary = () => {
    const blob = new Blob([qaSnapshot.summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${initialDocument.template_id ?? "canvas-template"}-qa-summary.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // The canvas subtree only depends on the stable store and sidebar
  // contract. Memoize it so QA/save/overlay updates never recreate the heavy
  // canvas tree.
  const sidebarSections = useMemo(
    () =>
      buildDetailPageSections({
        t,
        onGenerateImage,
        onGenerateGif,
        gifCreditCost,
        uploadFile,
        imageCreditCost,
        imageCreditBalance,
        imageCostByTier,
        onBuyImageCredits: () => setPricingOpen(true),
        structurePanel,
        generatedId,
      }),
    [
      t,
      onGenerateImage,
      onGenerateGif,
      gifCreditCost,
      uploadFile,
      imageCreditCost,
      imageCreditBalance,
      imageCostByTier,
      structurePanel,
      generatedId,
    ],
  );

  const canvas = useMemo(() => {
    // ⌘G / ⌘Z: 우리 손버릇 맵을 쓴다(`edit/hotkeys.ts`).
    const hotkeys = <EditorHotkeys store={store} />;
    // ⌘F: 20섹션에 흩어진 브랜드명·용량 표기를 한 번에 고친다.
    const findReplace = <FindReplacePanel store={store} />;

    return (
      <div className="absolute inset-0 flex">
        {hotkeys}
        <LeviosaSidePanel
          store={store}
          sections={sidebarSections as never}
          defaultSection="pages"
        />
        <div className="relative min-w-0 flex-1">
          <LeviosaCanvasWorkspace store={store} gap={4}>
            {findReplace}
            <DetailPagePagesTimeline store={store} />
          </LeviosaCanvasWorkspace>
          <div className="absolute bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white/95 px-2 py-1 shadow-sm backdrop-blur-sm">
            <LeviosaZoomButtons store={store} />
          </div>
        </div>
      </div>
    );
  }, [store, sidebarSections]);

  return (
    // 꽂혀 있으면 `observer`로 싼 패널·오버레이가 이 스토어의 변경 신호를 받는다
    // (canvas-observer.tsx).
    <CanvasStoreContext.Provider value={store}>
    <div className="flex h-screen min-h-[640px] flex-col bg-neutral-100">
      {/* hookable식 상단 헤더: 뒤로가기 · 상품명 · (되돌리기/다시실행) · 저장 ·
          다운로드 · 앱 공용 크롬(크레딧/알림/언어, 호스트 주입). 높이를 고정하고
          본문은 flex-1 min-h-0으로 두어, 헤더 높이가 바뀌어도 캔버스가 남는 높이를
          정확히 채워 페이지 하단이 잘리지 않는다. */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1.5 border-b border-neutral-200 bg-white px-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("editor.back")}
            title={t("editor.back")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
        ) : null}
        <p className="ml-1 max-w-[280px] truncate text-sm font-semibold text-neutral-900">
          {productName?.trim() || t("editor.untitled")}
        </p>

        <div className="mx-auto" />

        <DetailPageHistoryButtons store={store} />
        <span className="mx-1 h-5 w-px bg-neutral-200" aria-hidden="true" />

        {saveOk ? (
          <span className="hidden text-xs font-medium text-emerald-600 sm:inline">
            {t("editor.saved")}
          </span>
        ) : null}
        {saveError ? (
          <span className="hidden max-w-[180px] truncate text-xs font-medium text-red-600 sm:inline">
            {saveError}
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save aria-hidden="true" size={16} />
          {saving ? t("editor.saving") : t("editor.save")}
        </button>
        <DetailPageDownloadDialog
          store={store}
          fileName={initialDocument.template_id ?? "detail-page"}
          slotBindings={initialDocument.slot_bindings}
        />

        {headerActions ? (
          <>
            <span className="mx-1 h-5 w-px bg-neutral-200" aria-hidden="true" />
            {headerActions}
          </>
        ) : null}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
        {/* 캔버스 칸의 높이를 못 박는다. 안 그러면 그리드 행이 내용만큼 늘어나(높이
            100%가 auto로 풀린다) 작업 영역이 화면 아래로 자라고, 아래 붙는 배율·화면
            띠가 화면 밖으로 밀린다. */}
        <div className="relative min-w-0 overflow-hidden">{canvas}</div>
        <aside className="flex min-h-0 flex-col border-l border-neutral-200 bg-white">
          {/* Figma-style properties inspector — 상단 툴바 대신 오른쪽에 둔다. */}
          <div className="min-h-0 flex-1">
            <DetailPageProperties
              store={store}
              generatedId={generatedId}
              onBuyEditCredits={() => setPricingOpen(true)}
              imageCreditCost={imageCreditCost}
              imageCreditBalance={imageCreditBalance}
              imageCostByTier={imageCostByTier}
              onGenerateGif={onGenerateGif}
              gifCreditCost={gifCreditCost}
              onGenerateTextGif={onGenerateTextGif}
              textGifCreditCost={textGifCreditCost}
              onGenerateImageGif={onGenerateImageGif}
              imageGifCreditCost={imageGifCreditCost}
              onGenerateDataGif={onGenerateDataGif}
              dataGifCreditCost={dataGifCreditCost}
              onRemoveBackground={onRemoveBackground}
              bgRemoveCreditCost={bgRemoveCreditCost}
            />
          </div>

          {/* Template QA / slot inspector / lint — authoring tools, not seller-facing. */}
          <details className="border-t border-neutral-200">
            <summary className="cursor-pointer p-4 text-xs font-semibold uppercase tracking-[0.06em] text-neutral-400 hover:text-neutral-600">
              개발자 도구 · 템플릿 QA
            </summary>
            <div className="flex max-h-[55vh] min-h-0 flex-col overflow-y-auto">
          <div className="border-b border-neutral-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-950">
                  <ListChecks aria-hidden="true" size={16} />
                  {t("editor.qaTitle")}
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  {qaSnapshot.counts.pages} pages / {qaSnapshot.counts.elements} elements /{" "}
                  {qaSnapshot.counts.slots} slots
                </p>
              </div>
              <button
                type="button"
                onClick={handleRefreshQa}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                title={t("editor.refreshQa")}
              >
                <RefreshCw aria-hidden="true" size={15} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md border border-neutral-200 p-2">
                <div className="text-base font-semibold text-neutral-950">{qaSnapshot.counts.slots}</div>
                <div className="text-neutral-500">slots</div>
              </div>
              <div className="rounded-md border border-red-100 bg-red-50 p-2">
                <div className="text-base font-semibold text-red-700">{qaSnapshot.counts.errors}</div>
                <div className="text-red-600">errors</div>
              </div>
              <div className="rounded-md border border-amber-100 bg-amber-50 p-2">
                <div className="text-base font-semibold text-amber-700">{qaSnapshot.counts.warnings}</div>
                <div className="text-amber-600">warnings</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOverlayEnabled((value) => !value)}
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                {overlayEnabled ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
                {overlayEnabled ? t("editor.overlayOff") : t("editor.overlayOn")}
              </button>
              <button
                type="button"
                onClick={handleCopySummary}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                title={t("editor.copySummary")}
              >
                <Copy aria-hidden="true" size={15} />
              </button>
              <button
                type="button"
                onClick={handleDownloadSummary}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                title={t("editor.downloadSummary")}
              >
                <Download aria-hidden="true" size={15} />
              </button>
            </div>
            {summaryCopied ? (
              <p className="mt-2 text-xs font-medium text-emerald-600">{t("editor.summaryCopied")}</p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {t("editor.slotInspector")}
              </h3>
              <div className="mt-3 space-y-2">
                {qaSnapshot.slots.length ? (
                  qaSnapshot.slots.map((slot) => (
                    <button
                      key={slot.slot}
                      type="button"
                      onClick={() => handleSelectSlot(slot)}
                      className="w-full rounded-md border border-neutral-200 p-3 text-left hover:border-neutral-300 hover:bg-neutral-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-neutral-950">{slot.slot}</span>
                        <span
                          className={
                            slot.state === "error"
                              ? "text-xs font-semibold text-red-600"
                              : slot.state === "warning"
                                ? "text-xs font-semibold text-amber-600"
                                : "text-xs font-semibold text-emerald-600"
                          }
                        >
                          {slot.state}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-neutral-500">
                        {slot.binding?.kind ?? "-"} / {slot.binding?.element_id ?? "-"}
                      </p>
                      <p className="mt-1 text-xs text-neutral-600">{formatRect(slot.element)}</p>
                      <p className="mt-2 text-xs text-neutral-500">{slot.message}</p>
                    </button>
                  ))
                ) : (
                  <p className="rounded-md border border-neutral-200 p-3 text-sm text-neutral-500">
                    {t("editor.noSlots")}
                  </p>
                )}
              </div>
            </section>

            <section className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {t("editor.templateLint")}
              </h3>
              <div className="mt-3 space-y-2">
                {qaSnapshot.lint.length ? (
                  qaSnapshot.lint.map((issue, index) => (
                    <div
                      key={`${issue.title}-${issue.slot ?? issue.elementId ?? index}`}
                      className="rounded-md border border-neutral-200 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-neutral-950">{issue.title}</p>
                        <span
                          className={
                            issue.level === "error"
                              ? "text-xs font-semibold text-red-600"
                              : issue.level === "warning"
                                ? "text-xs font-semibold text-amber-600"
                                : "text-xs font-semibold text-blue-600"
                          }
                        >
                          {issue.level}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-neutral-600">{issue.detail}</p>
                      {issue.slot || issue.elementId ? (
                        <p className="mt-2 truncate text-xs text-neutral-400">
                          {[issue.slot, issue.elementId].filter(Boolean).join(" / ")}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                    {t("editor.lintPassed")}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {t("editor.designerSummary")}
              </h3>
              <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5 text-neutral-700">
                {qaSnapshot.summary}
              </pre>
            </section>
          </div>
            </div>
          </details>
        </aside>
      </div>
      {/* 화면 하나만 마크업째 다시 저작 — 요청은 캔버스 옆 페이지 툴바에서 온다. */}
      <SectionReauthorController
        store={store}
        generatedId={generatedId}
        templateId={initialDocument.template_id ?? undefined}
      />
      {slots?.PricingModal ? (
        <slots.PricingModal open={pricingOpen} onOpenChange={setPricingOpen} />
      ) : null}
    </div>
    </CanvasStoreContext.Provider>
  );
}
