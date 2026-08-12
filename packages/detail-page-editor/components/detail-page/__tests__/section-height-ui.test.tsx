import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DetailPageProperties } from "../detail-page-properties-panel";
import { livePageHeight } from "../section-reauthor-controller";

// 패널은 이제 소싱 서버를 `DetailPageHost` 로만 만난다 — 가짜 호스트를 꽂고 렌더한다.
import { renderWithDetailPageHost as render } from "./host-stub";


/**
 * 섹션 높이를 사람이 만지는 두 자리 — 우측 패널의 숫자와 캔버스 아래 손잡이.
 *
 * 손잡이만 두면 긴 화면에서는 아래 끝이 화면 밖이라 못 만지고, 숫자만 두면 "조금만 더"를
 * 눈으로 못 맞춘다. 둘 다 있어야 하고, 둘 다 **같은 함수**를 거쳐야 배경이 따라 늘어난다.
 *
 * 손잡이 쪽은 우리 엔진의 진짜 스토어 위에서 잰다 — `section-height-canvas.test.tsx`.
 */

function makePage(overrides: Record<string, unknown> = {}) {
  const page: Record<string, unknown> = {
    id: "hero",
    computedWidth: 750,
    computedHeight: 1200,
    bleed: 0,
    children: [],
    ...overrides,
  };
  // 진짜 Canvas 페이지처럼: height 를 쓰면 computedHeight 가 그것을 반영한다.
  page.set = (attrs: Record<string, unknown>) => {
    Object.assign(page, attrs);
    if (typeof attrs.height === "number") page.computedHeight = attrs.height;
  };
  return page as ReturnType<typeof Object> & {
    computedHeight: number;
    children: Array<Record<string, unknown>>;
  };
}

describe("우측 패널 — 섹션 높이", () => {
  it("아무것도 안 골랐을 때 지금 높이를 보여 준다", () => {
    const page = makePage();
    render(
      <DetailPageProperties
        store={{ selectedElements: [], pages: [page], activePage: page }}
      />,
    );
    expect(screen.getByText("detailPage.properties.pageHeight")).toBeTruthy();
    expect(screen.getByDisplayValue("1200")).toBeTruthy();
  });

  it("숫자를 넣으면 그 높이가 적용된다", () => {
    const page = makePage();
    render(
      <DetailPageProperties
        store={{ selectedElements: [], pages: [page], activePage: page }}
      />,
    );
    const input = screen.getByDisplayValue("1200");
    fireEvent.change(input, { target: { value: "1600" } });
    fireEvent.blur(input);
    expect(page.computedHeight).toBe(1600);
  });

  it("배경도 같이 늘린다 — 안 그러면 아래에 흰 띠가 생긴다", () => {
    const backdrop: Record<string, unknown> = {
      id: "bg",
      type: "image",
      x: 0,
      y: 0,
      width: 750,
      height: 1200,
    };
    backdrop.set = (attrs: Record<string, unknown>) => Object.assign(backdrop, attrs);
    const page = makePage({ children: [backdrop] });
    render(
      <DetailPageProperties
        store={{ selectedElements: [], pages: [page], activePage: page }}
      />,
    );
    const input = screen.getByDisplayValue("1200");
    fireEvent.change(input, { target: { value: "1600" } });
    fireEvent.blur(input);
    expect(backdrop.height).toBe(1600);
  });

  it("'내용에 맞추기'는 내용이 끝나는 자리로 줄인다", () => {
    const text: Record<string, unknown> = {
      id: "t",
      type: "text",
      x: 40,
      y: 100,
      width: 600,
      height: 80,
    };
    text.set = () => {};
    const page = makePage({ children: [text] });
    render(
      <DetailPageProperties
        store={{ selectedElements: [], pages: [page], activePage: page }}
      />,
    );
    fireEvent.click(screen.getByText("detailPage.properties.pageHeightFit"));
    expect(page.computedHeight).toBe(200); // 180 → 굽기 하한으로 올라온다
  });

  it("내용이 아래로 넘치면 말해 준다", () => {
    // 캔버스는 페이지 밖을 안 그린다 — 알려 주지 않으면 유저는 요소가 지워진 줄 안다.
    const text: Record<string, unknown> = {
      id: "t",
      type: "text",
      x: 0,
      y: 900,
      width: 600,
      height: 800,
    };
    text.set = () => {};
    const overflowing = makePage({ children: [text] });
    const { rerender } = render(
      <DetailPageProperties
        store={{
          selectedElements: [],
          pages: [overflowing],
          activePage: overflowing,
        }}
      />,
    );
    expect(
      screen.getByText("detailPage.properties.pageHeightOverflow"),
    ).toBeTruthy();

    const roomy = makePage({ children: [text], computedHeight: 2000 });
    rerender(
      <DetailPageProperties
        store={{ selectedElements: [], pages: [roomy], activePage: roomy }}
      />,
    );
    expect(screen.getByText("detailPage.properties.pageHeightHint")).toBeTruthy();
  });
});

describe("재저작에 실어 보내는 높이", () => {
  it("살아 있는 스토어에서 읽는다", () => {
    const store = {
      pages: [
        { id: "hero", computedHeight: 1200 },
        { id: "point-1", computedHeight: 1600 },
      ],
    };
    expect(livePageHeight(store, "point-1")).toBe(1600);
  });

  it("모르면 아예 안 보낸다 — 0 을 보내면 모델이 그걸 목표로 삼는다", () => {
    expect(livePageHeight({ pages: [] }, "hero")).toBeUndefined();
    expect(livePageHeight({}, "hero")).toBeUndefined();
    expect(
      livePageHeight({ pages: [{ id: "hero", computedHeight: 0 }] }, "hero"),
    ).toBeUndefined();
  });
});

describe("번역", () => {
  const KEYS = [
    "pageHeight",
    "pageHeightFit",
    "pageHeightHint",
    "pageHeightOverflow",
  ].map((k) => `detailPage.properties.${k}`);

  it.each(["ko", "en"])("%s 에 다 있다", (language) => {
    const tree = JSON.parse(
      readFileSync(
        join(process.cwd(), "public", "locales", language, "branding.json"),
        "utf8",
      ),
    );
    for (const key of KEYS) {
      const value = key
        .split(".")
        .reduce<unknown>(
          (node, part) =>
            node && typeof node === "object"
              ? (node as Record<string, unknown>)[part]
              : undefined,
          tree,
        );
      expect(String(value ?? "").trim(), key).not.toBe("");
    }
  });
});
