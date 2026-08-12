import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildDetailPageSections } from "../detail-page-sidebar-sections";

describe("buildDetailPageSections", () => {
  it("만드는 도구를 먼저, 브랜드 자산을 뒤로 배치한다", () => {
    const sections = buildDetailPageSections({});
    expect(sections.map((section) => section.name)).toEqual([
      "pages",
      "text",
      "photos",
      // 도형·차트·표는 "요소" 한 탭 안으로 접혔다(레일 포화 방지).
      "elements",
      "ai-generate",
      "brand-kit",
      "my-images",
      "brand-gifs",
      "brand-references",
      "my-shapes",
      "layers",
    ]);
  });

  it("브랜드 자산 구역 앞에 구분선을 하나만 둔다", () => {
    // 껍데기는 탭을 감싸는 래퍼 없이 나열하므로, 구분선은 탭 컴포넌트가 형제로
    // 함께 내보내는 방식으로만 들어간다. 어느 탭이 그 역할을 하는지 고정한다.
    const sections = buildDetailPageSections({});
    const dividers = sections.filter((section) => {
      const { container } = render(
        <section.Tab active={false} onClick={() => undefined} />,
      );
      // 탭 자체는 그대로 그려져야 한다(구분선이 탭을 대체하면 안 된다).
      expect(container.querySelector("[data-lc-tab]")).toBeTruthy();
      return container.querySelectorAll("span.border-t").length > 0;
    });

    expect(dividers.map((section) => section.name)).toEqual(["brand-kit"]);
  });

  it("레일 탭 수를 열둘 이하로 붙잡아 둔다", () => {
    // 14탭이 포화 신호였다. 아이콘·프레임·배경·규격 검사가 아직 남아 있으므로,
    // 새 기능을 새 탭으로 얹기 전에 이 줄이 먼저 걸리게 둔다.
    expect(buildDetailPageSections({}).length).toBeLessThanOrEqual(12);
  });
});

describe("탭 라벨 i18n", () => {
  it("넘겨준 번역기로 레일 라벨을 만든다", () => {
    // 예전에는 라벨이 한국어로 박혀 있어서 영어 사용자에게도 한국어 레일이 나왔다.
    const sections = buildDetailPageSections({ t: (key) => `EN:${key}` });
    const brandGifs = sections.find((section) => section.name === "brand-gifs")!;
    const { container } = render(
      <brandGifs.Tab active={false} onClick={() => undefined} />,
    );
    expect(container.textContent).toContain("EN:detailPage.sidebar.brandGifs");
  });

  it("번역기가 없으면 한국어로 떨어진다(구 호출부 보호)", () => {
    const sections = buildDetailPageSections({});
    const layers = sections.find((section) => section.name === "layers")!;
    const { container } = render(
      <layers.Tab active={false} onClick={() => undefined} />,
    );
    expect(container.textContent).toContain("레이어");
  });
});
