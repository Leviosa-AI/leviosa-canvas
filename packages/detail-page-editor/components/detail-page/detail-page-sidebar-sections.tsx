"use client";

import type { ReactElement, ReactNode } from "react";
import { SectionTab } from "@leviosa-ai/canvas";
import {
  BookMarked,
  Component,
  Files,
  Film,
  Image,
  Images,
  Layers,
  LayoutTemplate,
  Palette,
  Shapes,
  Sparkles,
  Type,
  type LucideIcon,
} from "lucide-react";

import {
  AiGeneratePanel,
  type GenerateGifFn,
  type GenerateImageFn,
} from "./ai-generate-panel";
import type { ImageTier } from "../../lib/detail-page/image-credit";
import { DetailPagePagesPanel } from "./detail-page-pages-panel";
import { DetailPageLayersPanel } from "./detail-page-layers-panel";
import { DetailPageMyImagesPanel } from "./detail-page-my-images-panel";
import { DetailPageElementsPanel } from "./detail-page-elements-panel";
import { DetailPageMyShapesPanel } from "./detail-page-my-shapes-panel";
import { DetailPageBrandGifsPanel } from "./detail-page-brand-gifs-panel";
import { DetailPageReferencesPanel } from "./detail-page-references-panel";
import { DetailPageBrandKitPanel } from "./detail-page-brand-kit-panel";
import { DetailPageTextPanel } from "./detail-page-text-panel";
import { DetailPagePhotosPanel } from "./detail-page-photos-panel";

/**
 * 좌측 패널의 섹션 목록.
 *
 * 처음에는 스톡 `<SidePanel>`에 우리 섹션을 끼워 넣는 hookable 방식이었다(그쪽 DOM에도
 * `canvas-side-panel` 클래스가 그대로 남아 있는 것을 보고 따라 했다). 지금은 껍데기까지
 * 우리 것이라(`@leviosa-ai/canvas`의 `SidePanel`) 스톡 섹션이 하나도 없다 — 남아 있던
 * 셋(텍스트·사진·기본 도형)은 이번에 우리 패널로 갈아 끼웠다. 라벨을 SDK i18n에
 * deep-merge하던 코드도 같이 사라졌다(이제 그냥 우리 `t`를 쓴다).
 *
 * Order: 만드는 도구(구조 · 페이지 · 텍스트 · 사진 · 요소 · AI 생성) → 구분선 →
 * 브랜드 자산(브랜드 킷 · 브랜드 이미지 · 브랜드 GIF · 내 레퍼런스 · 내 도형) · 레이어.
 *
 * 도형·차트·표는 각자 탭이었다가 "요소" 하나로 접혔다. 레일이 14탭이라 이미 포화였고,
 * 아이콘·프레임·배경이 로드맵대로 붙으면 레일이 스크롤된다 —
 * ``docs/detail-page-editor-panel-roadmap.md`` §4. 접는 기준은 "삽입 대상의 성격"이다.
 */

type CanvasSection = {
  name: string;
  Tab: (props: Record<string, unknown>) => ReactElement | null;
  Panel: (props: { store: unknown }) => ReactElement | null;
  visibleInList?: boolean;
};

/** 탭 라벨 번역기. 편집기가 자기 ``t``를 넘긴다. */
export type SidebarTranslate = (key: string) => string;

/** 번역기를 안 받았을 때(테스트·구 호출부) 쓰는 한국어 기본값. */
const FALLBACK_LABELS: Record<string, string> = {
  "detailPage.sidebar.pages": "페이지",
  "detailPage.sidebar.text": "텍스트",
  "detailPage.sidebar.photos": "사진",
  "detailPage.sidebar.elements": "요소",
  "detailPage.sidebar.shapes": "도형",
  "detailPage.sidebar.charts": "차트",
  "detailPage.sidebar.tables": "표",
  "detailPage.sidebar.ai": "AI 생성",
  "detailPage.sidebar.brandKit": "브랜드 킷",
  "detailPage.sidebar.brandImages": "브랜드 이미지",
  "detailPage.sidebar.brandGifs": "브랜드 GIF",
  "detailPage.sidebar.brandShapes": "브랜드 도형",
  "detailPage.sidebar.brandReferences": "내 레퍼런스",
  "detailPage.sidebar.layers": "레이어",
};

function fallbackTranslate(key: string): string {
  return FALLBACK_LABELS[key] ?? key;
}

// 껍데기가 ``active``/``onClick``을 렌더할 때 넣어 준다.
const Tab = SectionTab as unknown as (
  props: Record<string, unknown> & { name: string; children?: ReactNode },
) => ReactElement;

// ``dividerBefore``는 탭 위에 가로선을 하나 얹는다. 껍데기는 탭을 감싸는 래퍼 없이
// 그대로 나열하므로, 구분선은 프래그먼트로 형제 하나를 더 내보내는 방식으로만 끼워
// 넣을 수 있다.
function makeIconTab(
  label: string,
  Icon: LucideIcon,
  { dividerBefore = false }: { dividerBefore?: boolean } = {},
) {
  function IconTab(props: Record<string, unknown>): ReactElement {
    return (
      <>
        {dividerBefore ? (
          <span
            aria-hidden="true"
            className="mx-3 my-1.5 block border-t border-neutral-200"
          />
        ) : null}
        <Tab name={label} {...props}>
          <Icon size={18} />
        </Tab>
      </>
    );
  }
  IconTab.displayName = `IconTab(${label})`;
  return IconTab;
}

export type BuildSectionsOptions = {
  /**
   * 탭 라벨 번역기(보통 편집기의 ``useTranslation("branding").t``).
   *
   * 안 주면 한국어 기본값으로 떨어진다 — 예전에는 라벨이 아예 한국어로 박혀 있어서
   * 영어로 쓰는 유저에게도 한국어 레일이 나왔다.
   */
  t?: SidebarTranslate;
  /** 프롬프트 → 이미지 URL 생성 콜백(실서비스에서 주입). 없으면 패널은 안내만 표시. */
  onGenerateImage?: GenerateImageFn;
  /** 프롬프트 → 애니메이션 GIF URL 생성 콜백. 없으면 GIF 모드는 안내만 표시. */
  onGenerateGif?: GenerateGifFn;
  /** AI GIF 1회 생성 비용(크레딧). 0/미지정이면 크레딧 UI 숨김. */
  gifCreditCost?: number;
  /** 참조 이미지 업로드. 보통 에디터의 uploadFile을 그대로 전달. */
  uploadFile?: (file: File) => Promise<string>;
  /** AI 이미지 1회 생성 비용(크레딧). 0/미지정이면 크레딧 UI 숨김. */
  imageCreditCost?: number;
  /** 현재 보유 크레딧 잔액(1.5× 안전 마진 게이트용). */
  imageCreditBalance?: number;
  /** 티어별(basic/pro/max) 크레딧 단가. 모델 드롭다운의 각 항목 비용에 쓴다. */
  imageCostByTier?: Partial<Record<ImageTier, number>>;
  /** 크레딧 부족 시 "크레딧 추가하기" 목적지(레비오사 pricing). */
  onBuyImageCredits?: () => void;
  /** AI 생성 결과를 현재 브랜드 중앙 에셋에 미러링. */
  /**
   * "구조" 패널 — 지금 화면 구성을 다른 조합으로 갈아 끼운다.
   *
   * 데이터(아키타입·현재 벡터·플랜 잠금)는 편집기가 아니라 편집기를 띄운 화면이
   * 안다. 그래서 만들어진 노드를 그대로 받는다. 안 주면 탭 자체가 안 뜬다 —
   * 레거시 템플릿처럼 조합이 없는 문서에서는 열어도 할 게 없다.
   */
  structurePanel?: ReactNode;
  /**
   * 지금 편집 중인 상세페이지 id.
   *
   * "내 레퍼런스" 패널이 이 문서를 브랜드 버킷에 저장하는 데 쓴다. 없으면 저장 버튼 없이
   * 목록만 뜬다 — dev 하니스처럼 서버 인스턴스가 없는 문서에서는 저장할 것이 없다.
   */
  generatedId?: string;
};

export function buildDetailPageSections({
  t: translate,
  onGenerateImage,
  onGenerateGif,
  gifCreditCost,
  uploadFile,
  imageCreditCost,
  imageCreditBalance,
  imageCostByTier,
  onBuyImageCredits,
  structurePanel,
  generatedId,
}: BuildSectionsOptions): CanvasSection[] {
  const t = translate ?? fallbackTranslate;

  // 탭은 라벨을 품고 있으므로 언어가 바뀌면 새로 만들어야 한다. 이 함수는 편집기에서
  // useMemo 안에서만 불리므로 렌더마다 새 컴포넌트가 생기지는 않는다.
  const PagesTab = makeIconTab(t("detailPage.sidebar.pages"), Files);
  const TextTab = makeIconTab(t("detailPage.sidebar.text"), Type);
  const PhotosTab = makeIconTab(t("detailPage.sidebar.photos"), Image);
  const AiTab = makeIconTab(t("detailPage.sidebar.ai"), Sparkles);
  // 브랜드 자산 구역의 첫 탭 — 여기서부터 "내가 가진 것"이라 위에 선을 하나 긋는다.
  const BrandKitTab = makeIconTab(t("detailPage.sidebar.brandKit"), Palette, {
    dividerBefore: true,
  });
  const MyImagesTab = makeIconTab(t("detailPage.sidebar.brandImages"), Images);
  const BrandGifsTab = makeIconTab(t("detailPage.sidebar.brandGifs"), Film);
  // 도형·차트·표를 품는 한 탭. 아이콘은 "내 도형"(Shapes)과 겹치지 않게 갈랐다.
  const ElementsTab = makeIconTab(t("detailPage.sidebar.elements"), Component);
  const MyShapesTab = makeIconTab(t("detailPage.sidebar.brandShapes"), Shapes);
  const ReferencesTab = makeIconTab(
    t("detailPage.sidebar.brandReferences"),
    BookMarked,
  );
  const LayersTab = makeIconTab(t("detailPage.sidebar.layers"), Layers);
  const StructureTab = makeIconTab(
    t("detailPage.sidebar.structure"),
    LayoutTemplate,
  );

  const textSection: CanvasSection = {
    name: "text",
    Tab: TextTab,
    Panel: ({ store }) => <DetailPageTextPanel store={store} />,
  };

  // 사진: 올리기 + 무료 스톡 사진 검색(Pexels). 검색은 우리 서버가 중계하고, 고른
  // 사진은 우리 S3로 옮겨 담은 뒤 얹는다.
  const photosSection: CanvasSection = {
    name: "photos",
    Tab: PhotosTab,
    Panel: ({ store }) => (
      <DetailPagePhotosPanel store={store} uploadFile={uploadFile} />
    ),
  };

  const aiSection: CanvasSection = {
    name: "ai-generate",
    Tab: AiTab,
    Panel: ({ store }) => (
      <AiGeneratePanel
        store={store}
        onGenerate={onGenerateImage}
        onGenerateGif={onGenerateGif}
        gifCreditCost={gifCreditCost}
        uploadFile={uploadFile}
        costByTier={imageCostByTier}
        creditCost={imageCreditCost}
        creditBalance={imageCreditBalance}
        onBuyCredits={onBuyImageCredits}
      />
    ),
  };

  // 브랜드 이미지: 브랜드 자산 중 사진(GIF 제외) 갤러리(클릭 삽입).
  const myImagesSection: CanvasSection = {
    name: "my-images",
    Tab: MyImagesTab,
    Panel: ({ store }) => <DetailPageMyImagesPanel store={store} />,
  };

  // 브랜드 GIF: 같은 자산 중 GIF만, 만들어진 경로(텍스트/이펙트/프롬프트/도형)별로
  // 나눠 보여준다. 이미지와 섞여 있으면 썸네일만으로 구분이 안 돼 고르기 어렵다.
  const brandGifsSection: CanvasSection = {
    name: "brand-gifs",
    Tab: BrandGifsTab,
    Panel: ({ store }) => <DetailPageBrandGifsPanel store={store} />,
  };

  // 내 레퍼런스: 저작한 상세페이지를 브랜드 버킷에 넣고 다음 상품에서 다시 꺼내 쓴다.
  // 브랜드 이미지와 가르는 이유는 고르는 자리가 다르기 때문이다 — 여기 있는 것은
  // 페이지에 넣을 사진이 아니라 "이런 식으로" 참고할 남(이었던 내) 화면이다.
  const referencesSection: CanvasSection = {
    name: "brand-references",
    Tab: ReferencesTab,
    Panel: () => <DetailPageReferencesPanel generatedId={generatedId} />,
  };

  const brandKitSection: CanvasSection = {
    name: "brand-kit",
    Tab: BrandKitTab,
    Panel: ({ store }) => <DetailPageBrandKitPanel store={store} />,
  };

  // 요소: 클릭 한 번으로 캔버스에 놓이는 것들을 한 서랍에 모은다.
  //  - 도형: 공용 라이브러리(우리 템플릿에서 추린 범용 SVG) + 스톡 기본 도형/라인.
  //  - 차트: 데이터가 붙은 프리셋. 놓으면 그룹 하나로 들어가고 값·종류는 우측에서.
  //  - 표: 브랜드 상세페이지에서 실제로 쓰는 프리셋. 행·열·칸은 우측에서.
  // 아이콘·프레임이 붙을 자리도 여기다.
  const elementsSection: CanvasSection = {
    name: "elements",
    Tab: ElementsTab,
    Panel: ({ store }) => <DetailPageElementsPanel store={store} />,
  };

  // 내 도형: 유저가 저장/업로드한 개인 도형 갤러리(공용과 분리, 클릭 삽입).
  const myShapesSection: CanvasSection = {
    name: "my-shapes",
    Tab: MyShapesTab,
    Panel: ({ store }) => <DetailPageMyShapesPanel store={store} />,
  };

  // Custom pages section: the stock PagesPanel renders blank thumbnails because
  // this Canvas build's toDataURL is async. Our panel awaits it.
  const pagesSection: CanvasSection = {
    name: "pages",
    Tab: PagesTab,
    Panel: ({ store }) => <DetailPagePagesPanel store={store} />,
  };

  // 레이어: 스톡 LayersSection은 activePage.children를 평면 나열해 그룹 계층이
  // 안 보인다. 그룹을 재귀로 들여쓰고 접을 수 있는 Figma식 트리로 대체한다.
  const layersSection: CanvasSection = {
    name: "layers",
    Tab: LayersTab,
    Panel: ({ store }) => <DetailPageLayersPanel store={store} />,
  };

  // 구조: 화면 구성을 통째로 다른 조합으로 갈아 끼운다. 카피는 어휘가 같아 옮겨
  // 앉으므로(재바인딩) 글을 다시 쓰지 않는다. 조합이 없는 문서에서는 안 뜬다.
  const structureSection: CanvasSection | null = structurePanel
    ? {
        name: "structure",
        Tab: StructureTab,
        Panel: () => <>{structurePanel}</>,
      }
    : null;

  return [
    ...(structureSection ? [structureSection] : []),
    pagesSection,
    textSection,
    photosSection,
    elementsSection,
    aiSection,
    // ↓ 여기부터 브랜드 자산(브랜드 킷 탭이 위에 구분선을 그린다).
    brandKitSection,
    myImagesSection,
    brandGifsSection,
    referencesSection,
    myShapesSection,
    layersSection,
  ];
}
