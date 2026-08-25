import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiGeneratePanel } from "../ai-generate-panel";
import { TooltipProvider } from "../../ui/tooltip";
import { withDetailPageHost } from "./host-stub";

// 패널의 모델 툴팁은 Radix Tooltip을 쓴다. 실제 앱은 루트 레이아웃에서
// TooltipProvider를 깔지만, 단위 테스트에서는 여기서 감싸준다.
// 활성 브랜드가 어디서 오는지는 호스트의 일이다. 이 파일이 재는 것은 "패널이 그것을
// 요청에 싣는가"이므로, 앱과 같은 자리(로컬 스토리지)를 읽는 얇은 구현을 꽂는다.
const render = (ui: ReactElement) =>
  rtlRender(
    withDetailPageHost(<TooltipProvider>{ui}</TooltipProvider>, {
      brand: {
        getStoredActiveBrandId: () =>
          window.localStorage.getItem("leviosa.active-brand-id"),
      },
    }),
  );

const store = { pages: [], activePage: undefined };

describe("AiGeneratePanel 크레딧 게이트", () => {
  it("잔액이 비용의 1.5배 미만이면 생성을 차단하고 CTA를 노출한다", async () => {
    const onGenerate = vi.fn(async () => ["u"]);
    const onBuyCredits = vi.fn();
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={onGenerate}
        creditCost={50}
        creditBalance={60} // 필요 75 > 60 → 차단
        onBuyCredits={onBuyCredits}
      />,
    );

    // 차단 안내 + CTA
    expect(
      screen.getByText("detailPage.aiGenerate.insufficientCreditsTitle"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "detailPage.aiGenerate.buyCredits" }),
    );
    expect(onBuyCredits).toHaveBeenCalledOnce();

    // 프롬프트를 채워도 생성 버튼은 비활성이라 onGenerate가 불리지 않는다.
    await userEvent.type(
      screen.getByPlaceholderText("detailPage.aiGenerate.promptPlaceholder"),
      "고양이",
    );
    const genBtn = screen.getByRole("button", {
      name: /detailPage\.aiGenerate\.generate/,
    });
    expect(genBtn).toBeDisabled();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("잔액이 충분하면 비용 배지를 보여주고 생성이 가능하다", async () => {
    const onGenerate = vi.fn(async () => ["https://s3/x.jpg"]);
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={onGenerate}
        creditCost={50}
        creditBalance={100} // 필요 75 ≤ 100 → 허용
      />,
    );

    expect(
      screen.queryByText("detailPage.aiGenerate.insufficientCreditsTitle"),
    ).not.toBeInTheDocument();
    // 비용 배지
    expect(screen.getByText(/· 50cr/)).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("detailPage.aiGenerate.promptPlaceholder"),
      "고양이",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /detailPage\.aiGenerate\.generate/ }),
    );
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it("활성 브랜드를 생성 요청에 실어 서버가 브랜드 버킷에 직접 쓰게 한다", async () => {
    // 예전엔 생성 후 결과 URL을 다시 받아 브라우저가 재업로드했다. 그 왕복이
    // S3 CORS를 두 번 타서 한 번만 막혀도 브랜드 버킷이 비었다.
    window.localStorage.setItem("leviosa.active-brand-id", "brand-1");
    const onGenerate = vi.fn(async () => ["https://s3/x.jpg"]);
    render(<AiGeneratePanel store={store} onGenerate={onGenerate} />);

    await userEvent.type(
      screen.getByPlaceholderText("detailPage.aiGenerate.promptPlaceholder"),
      "브랜드 제품 이미지",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /detailPage\.aiGenerate\.generate/ }),
    );

    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: "brand-1" }),
    );
    window.localStorage.clear();
  });

  it("활성 브랜드가 없으면 brandId 없이 보내 개인 폴더 저장을 유지한다", async () => {
    window.localStorage.clear();
    const onGenerate = vi.fn(async () => ["https://s3/x.jpg"]);
    render(<AiGeneratePanel store={store} onGenerate={onGenerate} />);

    await userEvent.type(
      screen.getByPlaceholderText("detailPage.aiGenerate.promptPlaceholder"),
      "제품 이미지",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /detailPage\.aiGenerate\.generate/ }),
    );

    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: undefined }),
    );
  });
});

describe("AiGeneratePanel 모델 티어", () => {
  it("모델 드롭다운을 노출하고, 기본 티어(pro)의 비용을 배지로 보여준다", () => {
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={vi.fn(async () => ["u"])}
        costByTier={{ basic: 5, pro: 20, max: 70 }}
        creditBalance={1000}
      />,
    );
    // 모델 선택 라벨(드롭다운) + combobox 역할
    expect(
      screen.getByText("detailPage.aiGenerate.imageModel"),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    // 기본 티어(pro)의 설명 문단이 드롭다운 아래에 항상 렌더된다.
    expect(screen.getByText(/기본값으로 권장/)).toBeInTheDocument();
    // 기본 티어(pro=20) 비용이 생성 "버튼" 배지에 반영된다(basic 5/ max 70 아님).
    expect(
      screen.getByRole("button", { name: /detailPage\.aiGenerate\.generate/ }),
    ).toHaveTextContent("20cr");
  });

  it("생성 시 선택된 티어(기본 pro)를 onGenerate로 넘긴다", async () => {
    const onGenerate = vi.fn(async () => ["https://s3/x.jpg"]);
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={onGenerate}
        costByTier={{ basic: 5, pro: 20, max: 70 }}
        creditBalance={1000}
      />,
    );
    await userEvent.type(
      screen.getByPlaceholderText("detailPage.aiGenerate.promptPlaceholder"),
      "온천수 무드컷",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /detailPage\.aiGenerate\.generate/ }),
    );
    expect(onGenerate).toHaveBeenCalledOnce();
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "pro" }),
    );
  });

  it("tiers를 주면 그 티어만 고르게 하고, 기본값도 그 안에서 정한다", async () => {
    // 은퇴한 티어를 드롭다운에 남겨 두면 누를 수는 있는데 요금표에 값이 없어
    // 아무도 청구를 못 한다. 에이전시가 basic 을 빼는 자리가 여기다.
    const onGenerate = vi.fn(async () => ["https://s3/x.jpg"]);
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={onGenerate}
        tiers={["pro", "max"]}
        costByTier={{ pro: 20, max: 70 }}
        creditBalance={1000}
      />,
    );

    // 드롭다운을 열어 항목을 세지는 않는다 — Radix Select 는 jsdom 에 없는
    // 포인터 캡처를 쓴다. 목록 자체는 `resolveImageTiers` 의 단위 테스트가 재고,
    // 여기서는 그 목록이 실제 요청에 실리는지를 잰다.
    await userEvent.type(
      screen.getByPlaceholderText("detailPage.aiGenerate.promptPlaceholder"),
      "온천수 무드컷",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /detailPage\.aiGenerate\.generate/ }),
    );
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "pro" }),
    );
  });

  it("기본 티어가 빠진 목록이면 그 목록의 첫 항목으로 생성한다", async () => {
    const onGenerate = vi.fn(async () => ["https://s3/x.jpg"]);
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={onGenerate}
        tiers={["max"]}
        costByTier={{ max: 70 }}
        creditBalance={1000}
      />,
    );
    await userEvent.type(
      screen.getByPlaceholderText("detailPage.aiGenerate.promptPlaceholder"),
      "온천수 무드컷",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /detailPage\.aiGenerate\.generate/ }),
    );
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "max" }),
    );
  });

  it("costByTier 미지정 시 레거시 creditCost로 폴백한다", () => {
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={vi.fn(async () => ["u"])}
        creditCost={33}
        creditBalance={1000}
      />,
    );
    expect(screen.getByText(/· 33cr/)).toBeInTheDocument();
  });
});

describe("AiGeneratePanel GIF 모드", () => {
  it("GIF 모드로 전환하면 모델 드롭다운을 숨기고 GIF 단가를 보여준다", async () => {
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={vi.fn(async () => ["u"])}
        onGenerateGif={vi.fn(async () => ["https://s3/x.gif"])}
        costByTier={{ basic: 5, pro: 20, max: 70 }}
        gifCreditCost={50}
        creditBalance={1000}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "detailPage.aiGenerate.gif" }),
    );
    // 모델 영역은 hidden 속성으로 감춰진다(DOM엔 있으나 보이지 않음).
    expect(
      screen.getByText("detailPage.aiGenerate.imageModel"),
    ).not.toBeVisible();
    // 배경 투명 토글이 GIF 모드에 노출된다(기본 ON).
    expect(
      screen.getByText("detailPage.aiGenerate.transparentBg"),
    ).toBeVisible();
    // 생성 버튼은 GIF 단가(50cr)를 배지로 보여준다(이미지 pro 20cr 아님).
    expect(
      screen.getByRole("button", { name: /detailPage\.aiGenerate\.generateGif/ }),
    ).toHaveTextContent("50cr");
  });

  it("GIF 생성 시 onGenerateGif를 프롬프트·transparent와 함께 호출한다", async () => {
    const onGenerateGif = vi.fn(async () => ["https://s3/x.gif"]);
    const onGenerate = vi.fn(async () => ["u"]);
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={onGenerate}
        onGenerateGif={onGenerateGif}
        gifCreditCost={50}
        creditBalance={1000}
        hasImplicitReference
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "detailPage.aiGenerate.gif" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("detailPage.aiGenerate.promptPlaceholder"),
      "물방울 애니메이션",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /detailPage\.aiGenerate\.generateGif/ }),
    );
    expect(onGenerateGif).toHaveBeenCalledOnce();
    // transparent 기본 ON으로 전달된다.
    expect(onGenerateGif).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "물방울 애니메이션",
        referenceImages: [],
        transparent: true,
      }),
    );
    // 이미지 생성기는 호출되지 않는다.
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("참조 이미지가 없으면(좌측) GIF 생성을 막고 안내한다", async () => {
    const onGenerateGif = vi.fn(async () => ["https://s3/x.gif"]);
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={vi.fn(async () => ["u"])}
        onGenerateGif={onGenerateGif}
        gifCreditCost={50}
        creditBalance={1000}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "detailPage.aiGenerate.gif" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("detailPage.aiGenerate.promptPlaceholder"),
      "물방울",
    );
    // 참조 없음 → 버튼 비활성 + 안내.
    expect(
      screen.getByRole("button", { name: /detailPage\.aiGenerate\.generateGif/ }),
    ).toBeDisabled();
    expect(
      screen.getByText("detailPage.aiGenerate.gifNeedsReference"),
    ).toBeVisible();
    expect(onGenerateGif).not.toHaveBeenCalled();
  });

  it("onGenerateGif가 없으면 GIF 토글을 아예 노출하지 않는다(연결 안 됨 방지)", () => {
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={vi.fn(async () => ["u"])}
        costByTier={{ basic: 5, pro: 20, max: 70 }}
        creditBalance={1000}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "detailPage.aiGenerate.gif" }),
    ).toBeNull();
    // 이미지 생성은 그대로 가능하다.
    expect(screen.getByText("detailPage.aiGenerate.imageModel")).toBeVisible();
  });

  it("암묵 참조(우측 인스펙터): 선택 이미지를 예시로 노출하고 crossOrigin으로 로드한다", () => {
    render(
      <AiGeneratePanel
        store={store}
        onGenerate={vi.fn(async () => ["u"])}
        hasImplicitReference
        implicitReferenceSrc="https://s3/x/personal/a.jpg"
        creditBalance={1000}
      />,
    );
    // 현재 이미지 라벨 + 미리보기가 뜬다.
    expect(
      screen.getByText("detailPage.aiGenerate.currentImageLabel"),
    ).toBeVisible();
    const img = screen.getByAltText("detailPage.aiGenerate.referenceAlt");
    expect(img).toHaveAttribute("src", "https://s3/x/personal/a.jpg");
    // crossOrigin 없이 그리면 ACAO 없는 응답이 캐시돼 캔버스 로드를 오염시키므로 필수.
    expect(img).toHaveAttribute("crossorigin", "anonymous");
    // 업로드 드롭존 대신 읽기 전용 미리보기라 첨부 안내는 없다.
    expect(
      screen.queryByText("detailPage.aiGenerate.attachHint"),
    ).toBeNull();
  });
});
