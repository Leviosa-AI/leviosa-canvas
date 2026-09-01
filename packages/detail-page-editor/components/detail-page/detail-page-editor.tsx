"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EditorHotkeys } from "./editor-hotkeys";
import { useAutoSave, type SaveReason } from "./use-auto-save";
import { FindReplacePanel } from "./find-replace-panel";

import { ChevronLeft, Save } from "lucide-react";

import {
  applyTextLineFit,
  clearPlaceholderImageSrc,
} from "../../lib/detail-page-canvas/custom-props-adapter";
import { TooltipProvider } from "../ui/tooltip";
import { CanvasStoreContext } from "./canvas-observer";
import { LeviosaCanvasWorkspace } from "./leviosa-canvas-workspace";
import { DetailPagePagesTimeline } from "./detail-page-pages-timeline";
import { SidePanel as LeviosaSidePanel } from "@leviosa-ai/canvas";
import { createCanvasStore } from "@leviosa-ai/canvas/store";
import { collectFontRequests } from "@leviosa-ai/canvas/render/use-document-fonts";
import { ensureCanvasKey } from "../../lib/detail-page-canvas/canvas-key";
import { loadEditorFont } from "../../lib/detail-page-canvas/editor-fonts";
import { normalizeDocumentAssetSrcs } from "../../lib/detail-page/asset-bytes-url";
import { selectDetailPageEditorProfile } from "../../lib/detail-page/editor-profile";
import type { DocumentJson } from "@leviosa-ai/canvas/types";
import { buildDetailPageSections } from "./detail-page-sidebar-sections";
import { DetailPageProperties } from "./detail-page-properties-panel";
import { EditorAiProvider } from "./editor-ai-context";
import { useDetailPageEditUsage } from "./edit-quota-ui";
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
import type { LeviosaCanvasDocument } from "../../types/detail-page-canvas";

export type DetailPageEditorProps = {
  initialDocument: LeviosaCanvasDocument;
  saving?: boolean;
  uploadFile?: (file: File) => Promise<string>;
  /**
   * 문서를 저장한다. `reason` 은 왜 지금 저장하는가다 — 앱이 이걸 보고 무거운 뒷일
   * (상세페이지의 HTML 굽기 같은)을 할지 말지 고른다. 자동저장은 `auto`, 저장 버튼은
   * `manual`, 탭을 닫거나 편집기를 떠날 때는 `leave` 로 온다.
   */
  onSave: (
    document: LeviosaCanvasDocument,
    meta: { reason: SaveReason },
  ) => Promise<void>;
  /**
   * 자동저장 간격(ms). 없으면 자동저장을 안 한다.
   *
   * 저장이 무거운 화면은 길게 잡는다 — 상세페이지 저장은 서버가 HTML 을 새로 만들어
   * S3 에 올리고, 캐러셀 저장은 문서 JSON 만 넣는다.
   */
  autoSaveDelayMs?: number;
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
   * 고르게 할 이미지 티어. 안 주면 셋 다(basic/pro/max).
   *
   * 요금표에서 티어를 은퇴시킨 소비자가 쓰는 자리다 — 값이 없는 티어를 드롭다운에
   * 남겨 두면 누를 수는 있는데 아무도 청구를 못 하고, 그 상태는 화면 어디에도 안
   * 보인다. 에이전시는 `["pro", "max"]` 를 준다.
   */
  imageTiers?: readonly ImageTier[];
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
  /**
   * 결과물이 될 벌 — 내려받기·발행이 향하는 곳.
   *
   * 문서에 안 적고 밖에서 받는다. 후보를 담은 화면은 이미 서버가 «고른 후보»를
   * 들고 있고(목록 썸네일과 레퍼런스가 읽는 자리가 그것이다), 두 곳에 적어 두면
   * 언젠가 서로 다른 답을 한다.
   */
  chosenFrame?: string;
  /** 안 주면 벌 머리에 체크박스를 안 그린다. */
  onChooseFrame?: (frameKey: string) => void;
  /** 벌 이름 짓기. 안 주면 꼬리표를 그대로 쓴다. */
  frameName?: (frameKey: string) => string;
  /** 헤더 좌측 "뒤로가기" 동작. 없으면 버튼을 숨긴다. */
  onBack?: () => void;
  /**
   * 헤더 우측 끝에 끼울 앱 공용 크롬(크레딧·알림·언어 등). 이 컴포넌트들은 (app)
   * 셸의 컨텍스트를 요구하므로 에디터가 직접 import하지 않고 호스트에서 주입한다.
   */
  headerActions?: ReactNode;
};

type CanvasJson = Record<string, unknown>;

export function DetailPageEditor({
  initialDocument,
  saving = false,
  uploadFile,
  onSave,
  autoSaveDelayMs,
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
  imageTiers,
  generatedId,
  structurePanel,
  productName,
  chosenFrame,
  onChooseFrame,
  frameName,
  onBack,
  headerActions,
}: DetailPageEditorProps) {
  selectDetailPageEditorProfile(initialDocument);
  const { t } = useTranslation("branding");
  // 요금제 모달은 호스트가 꽂는다 — 편집기가 열지만 무엇을 얼마에 파는지는 앱이 안다.
  const { slots } = useDetailPageHost();
  // 영역 슬롯. 색·모서리는 토큰으로 바꾸지만, 무엇이 어디에 놓이는가는 앱이 정한다.
  const SidebarSlot = slots?.EditorSidebar;
  const HeaderSlot = slots?.EditorHeader;
  const InspectorSlot = slots?.EditorInspector;
  // 프롬프트 편집 사용량은 여기서 한 번만 조회한다 — 캔버스 위 띠와 우측 패널(표·차트)이
  // 같은 숫자를 봐야 "몇 번 남았는가"가 갈라지지 않는다.
  const { usage, applyUsage } = useDetailPageEditUsage(generatedId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  // 편집 한도 소진 시 "편집 크레딧 추가하기" → pricing 모달을 인플레이스로 연다.
  const [pricingOpen, setPricingOpen] = useState(false);
  // 어댑터를 안 거친다. `adaptLeviosaCustomProps`는 SDK가 **못 읽는** 장식을 읽을 수
  // 있는 모양으로 낮춰 주던 일이었고(그림자·그라데이션 → 대표 단색), 우리 렌더러는
  // 그 필드들을 원본 그대로 읽는다. 낮춘 것을 넣으면 오히려 원본보다 못한 그림이 된다.
  // 브랜드 자산 주소는 바이트 경로로 옮겨서 연다 — 302 를 따라가면 CORS 가 깨져서
  // 캔버스가 그림을 못 읽는다(asset-bytes-url 에 실측 표를 적어 뒀다).
  // 문서는 편집기가 열릴 때 **한 번만** 읽는다. 저장이 끝나고 앱이 서버가 돌려준
  // 문서를 도로 넣어도 캔버스를 다시 만들지 않는다 — 다시 만들면 되돌리기 100단과
  // 선택이 통째로 날아간다. 저장 버튼 한 번에 ⌘Z 가 죽던 것이 그 증상이었고,
  // 자동저장이 붙으면 몇 초마다 그렇게 된다.
  //
  // 정말로 다른 문서를 여는 것은 부르는 쪽이 `key` 로 다시 마운트한다.
  const [store] = useState(() => {
    ensureCanvasKey();
    return createCanvasStore(
      normalizeDocumentAssetSrcs(initialDocument.canvas_json) as DocumentJson,
    );
  });

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

  const documentRef = useRef(initialDocument);
  documentRef.current = initialDocument;

  const runSave = useCallback(
    async (reason: SaveReason) => {
      setSaveError(null);
      setSaveOk(false);
      try {
        // 회색 자리표시 이미지는 빈 src 로 되돌려 저장한다 — 편집기에서만 쓰는 그림이다.
        const cleanJson = clearPlaceholderImageSrc(store.toJSON() as CanvasJson);
        await onSave({ ...documentRef.current, canvas_json: cleanJson }, { reason });
        setSaveOk(true);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : t("editor.saveError"));
        // 자동저장은 조용히 넘어가지만 실패는 알려 줘야 다음에 다시 보낸다.
        if (reason !== "manual") throw error;
      }
    },
    [onSave, store, t],
  );

  const handleSave = useCallback(() => void runSave("manual"), [runSave]);

  const unsaved = useAutoSave({ store, delayMs: autoSaveDelayMs, save: runSave });

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
        imageTiers,
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
      imageTiers,
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
        {SidebarSlot ? (
          <SidebarSlot
            store={store}
            sections={sidebarSections as never}
            defaultSection="pages"
          />
        ) : (
          <LeviosaSidePanel
            store={store}
            sections={sidebarSections as never}
            defaultSection="pages"
          />
        )}
        <div className="relative min-w-0 flex-1">
          <LeviosaCanvasWorkspace
            store={store}
            gap={4}
            chosenFrame={chosenFrame}
            onChooseFrame={onChooseFrame}
            frameName={frameName}
          >
            {findReplace}
            <DetailPagePagesTimeline store={store} />
          </LeviosaCanvasWorkspace>
        </div>
      </div>
    );
  }, [store, sidebarSections, SidebarSlot, chosenFrame, onChooseFrame, frameName]);

  const aiValue = useMemo(
    () => ({
      generatedId,
      usage,
      applyUsage,
      onBuyCredits: () => setPricingOpen(true),
      imageCreditCost,
      imageCreditBalance,
      imageCostByTier,
      imageTiers,
      onGenerateGif,
      gifCreditCost,
      onRemoveBackground,
      bgRemoveCreditCost,
    }),
    [
      generatedId,
      usage,
      applyUsage,
      imageCreditCost,
      imageCreditBalance,
      imageCostByTier,
      imageTiers,
      onGenerateGif,
      gifCreditCost,
      onRemoveBackground,
      bgRemoveCreditCost,
    ],
  );

  const historyPart = <DetailPageHistoryButtons store={store} />;
  const downloadPart = (
    <DetailPageDownloadDialog
      store={store}
      fileName={initialDocument.template_id ?? "detail-page"}
      slotBindings={initialDocument.slot_bindings}
    />
  );
  const defaultHeader = (
      <header
        data-dpe-part="header"
        className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1.5 border-b border-dpe-ink-200 bg-dpe-surface px-3"
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("editor.back")}
            title={t("editor.back")}
            className="flex h-9 w-9 items-center justify-center rounded-dpe-md text-dpe-ink-600 hover:bg-dpe-ink-100 hover:text-dpe-ink-900"
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
        ) : null}
        <p className="ml-1 max-w-[280px] truncate text-sm font-dpe-semibold text-dpe-ink-900">
          {productName?.trim() || t("editor.untitled")}
        </p>

        <div className="mx-auto" />

        {historyPart}
        <span className="mx-1 h-5 w-px bg-dpe-ink-200" aria-hidden="true" />

        {saveOk ? (
          <span className="hidden text-xs font-dpe-medium text-dpe-ok-600 sm:inline">
            {t("editor.saved")}
          </span>
        ) : null}
        {saveError ? (
          <span className="hidden max-w-[180px] truncate text-xs font-dpe-medium text-dpe-danger-600 sm:inline">
            {saveError}
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex h-9 items-center gap-2 rounded-dpe-md border border-dpe-ink-200 bg-dpe-surface px-3 text-sm font-dpe-semibold text-dpe-ink-900 hover:bg-dpe-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save aria-hidden="true" size={16} />
          {saving ? t("editor.saving") : t("editor.save")}
        </button>
        {downloadPart}

        {headerActions ? (
          <>
            <span className="mx-1 h-5 w-px bg-dpe-ink-200" aria-hidden="true" />
            {headerActions}
          </>
        ) : null}
      </header>
  );
  const defaultInspector = (
        <aside
          data-dpe-part="inspector"
          className="flex min-h-0 flex-col border-l border-dpe-ink-200 bg-dpe-surface"
        >
          {/* Figma-style properties inspector — 상단 툴바 대신 오른쪽에 둔다. */}
          <div className="min-h-0 flex-1">
            <DetailPageProperties
              store={store}
              generatedId={generatedId}
              onBuyEditCredits={() => setPricingOpen(true)}
              onGenerateTextGif={onGenerateTextGif}
              textGifCreditCost={textGifCreditCost}
              onGenerateImageGif={onGenerateImageGif}
              imageGifCreditCost={imageGifCreditCost}
              onGenerateDataGif={onGenerateDataGif}
              dataGifCreditCost={dataGifCreditCost}
            />
          </div>
        </aside>
  );
  // 인스펙터는 감싸 쓰는 경우가 더 많다 — 자기 크롬만 두르고 속은 그대로 둔다.
  const inspector = InspectorSlot ? (
    <InspectorSlot store={store} defaultInspector={defaultInspector} />
  ) : (
    defaultInspector
  );

  const header = HeaderSlot ? (
    <HeaderSlot
      productName={productName?.trim() || t("editor.untitled")}
      onBack={onBack}
      save={{ run: handleSave, saving, ok: saveOk, error: saveError, unsaved }}
      parts={{
        history: historyPart,
        download: downloadPart,
        actions: headerActions ?? null,
      }}
    />
  ) : (
    defaultHeader
  );

  return (
    // 꽂혀 있으면 `observer`로 싼 패널·오버레이가 이 스토어의 변경 신호를 받는다
    // (canvas-observer.tsx).
    <CanvasStoreContext.Provider value={store}>
    {/* 캔버스 위 띠가 쓰는 값들. props로 내리면 작업 영역이 통째로 다시 만들어진다. */}
    <EditorAiProvider value={aiValue}>
    {/* 편집기가 자기 툴팁 프로바이더를 깐다.
        예전에는 안 깔았다 — 첫 소비자(leviosa-frontend)가 앱 레이아웃에 전역으로 하나
        갖고 있어서 우연히 서 있었을 뿐이다. 그것이 없는 소비자에서는 AI 생성 패널이
        열리는 순간 `Tooltip must be used within TooltipProvider` 로 화면이 통째로
        죽었다. Radix 의 프로바이더는 중첩이 안전하므로(안쪽이 이긴다), 이미 깔아 둔
        앱에도 해가 없다. */}
    <TooltipProvider>
    <div
      data-dpe-root=""
      className="flex h-screen min-h-[640px] flex-col bg-dpe-ink-100"
    >
      {/* hookable식 상단 헤더: 뒤로가기 · 상품명 · (되돌리기/다시실행) · 저장 ·
          다운로드 · 앱 공용 크롬(크레딧/알림/언어, 호스트 주입). 높이를 고정하고
          본문은 flex-1 min-h-0으로 두어, 헤더 높이가 바뀌어도 캔버스가 남는 높이를
          정확히 채워 페이지 하단이 잘리지 않는다. */}
      {header}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
        {/* 캔버스 칸의 높이를 못 박는다. 안 그러면 그리드 행이 내용만큼 늘어나(높이
            100%가 auto로 풀린다) 작업 영역이 화면 아래로 자라고, 아래 붙는 배율·화면
            띠가 화면 밖으로 밀린다. */}
        <div data-dpe-part="workspace" className="relative min-w-0 overflow-hidden">
          {canvas}
        </div>
        {inspector}
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
    </TooltipProvider>
    </EditorAiProvider>
    </CanvasStoreContext.Provider>
  );
}
