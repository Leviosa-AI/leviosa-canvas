import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPageProperties } from "../detail-page-properties-panel";
import type { GenerateTextGifFn } from "../ai-generate-panel";

// 패널은 이제 소싱 서버를 `DetailPageHost` 로만 만난다 — 가짜 호스트를 꽂고 렌더한다.
import { renderWithDetailPageHost as render } from "./host-stub";


const PICKER = { name: "detailPage.properties.gifEffectChoose" };

function textElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    type: "text",
    text: "레비오사",
    fill: "rgb(23, 21, 15)",
    fontSize: 48,
    fontWeight: "bold",
    fontFamily: "Paperozi",
    opacity: 1,
    x: 100,
    y: 0,
    width: 600,
    height: 60,
    align: "center",
    custom: {},
    set: vi.fn(),
    ...overrides,
  };
}

function groupElement(children: Array<Record<string, unknown>>) {
  return {
    id: "g1",
    type: "group",
    opacity: 1,
    children,
    custom: {},
    set: vi.fn(),
  };
}

function makeStore(selected: Array<Record<string, unknown>>) {
  const activePage = {
    id: "p1",
    children: selected,
    background: "#f5f0e8",
    computedWidth: 1000,
    computedHeight: 1400,
    addElement: vi.fn(),
  };
  return {
    selectedElements: selected,
    pages: [activePage],
    activePage,
    deleteElements: vi.fn(),
    ungroupElements: vi.fn(),
  };
}

function renderPanel(
  onGenerateTextGif: ReturnType<typeof vi.fn>,
  selected: Array<Record<string, unknown>> = [textElement()],
) {
  const store = makeStore(selected);
  return {
    store,
    ...render(
      <DetailPageProperties
        store={store}
        onGenerateTextGif={onGenerateTextGif as unknown as GenerateTextGifFn}
        textGifCreditCost={5}
      />,
    ),
  };
}

describe("TextGifSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("이펙트마다 실제로 구운 GIF 미리보기를 보여준다", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn());
    await user.click(screen.getByRole("button", PICKER));
    expect(
      screen.getByAltText("detailPage.gifEffects.text.wave.label"),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("/gif-effect-previews/text-wave.gif"),
    );
  });

  it("고른 이펙트와 글자 스타일·폰트 파일을 콜백에 넘긴다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(["https://s3/a.gif"]);
    renderPanel(onGenerate);

    await user.click(screen.getByRole("button", PICKER));
    await user.click(
      screen.getByRole("button", { name: /gifEffects.text.typewriter.label/ }),
    );
    await user.click(screen.getByRole("button", { name: /textGifMake/ }));

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    const arg = onGenerate.mock.calls[0][0];
    expect(arg.effect).toBe("typewriter");
    // 스톡 편집기가 돌려주는 rgb() 표기는 백엔드가 못 받는다 — HEX로 접혀야 한다.
    expect(arg.color).toBe("#17150f");
    expect(arg.fontFamily).toBe("Paperozi");
    expect(arg.background).toBe("#f5f0e8");
    // 폰트 파일 주소가 실려야 서버가 픽셀 폰트로 안 떨어진다.
    expect(arg.fonts[0].family).toBe("Paperozi");
    expect(arg.fonts[0].url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\//);
  });

  it("원본 상자와 줄 자리를 실측해 넘기고, 그 자리에 갈아 끼운다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(["https://s3/a.gif"]);
    const { store } = renderPanel(onGenerate);

    await user.click(screen.getByRole("button", { name: /textGifMake/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());

    const arg = onGenerate.mock.calls[0][0];
    // 캔버스를 글자 수로 추정하면 결과 비율이 달라져 되꽂을 때 글자가 커진다.
    expect(arg.boxWidth).toBe(600);
    expect(arg.boxHeight).toBe(60);
    expect(arg.bleed).toBeGreaterThan(0);
    // align=center → 상자 가운데를 앵커로.
    expect(arg.lines[0]).toMatchObject({ x: 300, anchor: "middle" });
    // 줄 높이(48 * 1.2)의 절반이 첫 줄의 세로 중심.
    expect(arg.lines[0].y).toBeCloseTo(28.8, 5);

    await waitFor(() => expect(store.activePage.addElement).toHaveBeenCalled());
    const added = store.activePage.addElement.mock.calls[0][0];
    // 상자를 여백만큼 키운 자리 — 서버도 같은 여백을 두고 그리므로 글자는 제자리다.
    expect(added.x).toBe(100 - arg.bleed);
    expect(added.y).toBe(0 - arg.bleed);
    expect(added.width).toBe(600 + arg.bleed * 2);
    expect(added.height).toBe(60 + arg.bleed * 2);
    expect(store.deleteElements).toHaveBeenCalledWith(["t1"]);
  });

  it("요소 하나 안의 줄바꿈도 줄로 쪼개 보낸다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(["https://s3/a.gif"]);
    renderPanel(onGenerate, [textElement({ text: "첫 줄\n둘째 줄" })]);
    await user.click(screen.getByRole("button", { name: /textGifMake/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(onGenerate.mock.calls[0][0].lines.map((l: { text: string }) => l.text)).toEqual([
      "첫 줄",
      "둘째 줄",
    ]);
  });

  it("텍스트만 든 그룹은 통째로 한 장의 GIF가 된다(위→아래 순서)", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(["https://s3/a.gif"]);
    const { store } = renderPanel(onGenerate, [
      groupElement([
        textElement({ id: "t2", text: "부제", y: 90, fontSize: 24, fill: "#a08a63" }),
        textElement({ id: "t1", text: "헤드라인", y: 10, fontSize: 64 }),
      ]),
    ]);

    await user.click(screen.getByRole("button", { name: /textGifMake/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    const arg = onGenerate.mock.calls[0][0];
    // 선택 순서가 아니라 화면에 놓인 순서(y)를 따라야 원래 모습대로 쌓인다.
    expect(arg.lines.map((l: { text: string }) => l.text)).toEqual([
      "헤드라인",
      "부제",
    ]);
    expect(arg.lines[0].fontSize).toBe(64);
    expect(arg.lines[1].color).toBe("#a08a63");
    // 그룹은 자식이 아니라 그룹째로 사라져야 빈 껍데기가 안 남는다.
    await waitFor(() =>
      expect(store.deleteElements).toHaveBeenCalledWith(["g1"]),
    );
  });

  it("도형이 섞인 그룹에는 섹션을 열지 않는다", () => {
    renderPanel(vi.fn(), [
      groupElement([
        textElement(),
        { id: "s1", type: "svg", src: "", custom: {}, set: vi.fn() },
      ]),
    ]);
    expect(screen.queryByText("detailPage.properties.textGif")).toBeNull();
  });

  it("콜백이 없으면 섹션을 숨긴다", () => {
    render(<DetailPageProperties store={makeStore([textElement()])} />);
    expect(screen.queryByText("detailPage.properties.textGif")).toBeNull();
  });
});
