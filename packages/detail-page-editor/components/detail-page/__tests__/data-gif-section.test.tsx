import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPageProperties } from "../detail-page-properties-panel";
import type { GenerateDataGifFn } from "../ai-generate-panel";
import { insertPersonalImage } from "../../../lib/detail-page/insert-image";

// 패널은 이제 소싱 서버를 `DetailPageHost` 로만 만난다 — 가짜 호스트를 꽂고 렌더한다.
import { renderWithDetailPageHost as render } from "./host-stub";


// 삽입은 이미지를 먼저 로드해 비율을 맞추는데 jsdom 은 그 로드를 끝내 주지 않는다.
// 여기서 볼 것은 "대체가 아니라 삽입을 골랐는가"이므로 삽입 자체를 대역으로 둔다.
vi.mock("../../../lib/detail-page/insert-image", () => ({
  insertPersonalImage: vi.fn(),
}));

function textElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    type: "text",
    text: "279.45%",
    fill: "rgb(23, 21, 15)",
    fontSize: 43,
    fontWeight: "bold",
    fontFamily: "Paperozi",
    opacity: 1,
    x: 100,
    y: 0,
    width: 200,
    height: 60,
    align: "center",
    custom: {},
    set: vi.fn(),
    ...overrides,
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
  onGenerateDataGif: ReturnType<typeof vi.fn>,
  selected: Array<Record<string, unknown>> = [textElement()],
) {
  const store = makeStore(selected);
  return {
    store,
    ...render(
      <DetailPageProperties
        store={store}
        onGenerateDataGif={onGenerateDataGif as unknown as GenerateDataGifFn}
        dataGifCreditCost={5}
      />,
    ),
  };
}

describe("CountUpGifSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("선택 텍스트의 숫자·스타일을 읽어 넘긴다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(["https://s3/a.gif"]);
    renderPanel(onGenerate);

    await user.click(screen.getByRole("button", { name: /countUpGifMake/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));

    const arg = onGenerate.mock.calls[0][0];
    // 값을 두 번 적게 하지 않는다 — 캔버스의 "279.45%" 가 그대로 목표값이 된다.
    expect(arg).toMatchObject({ kind: "count_up", to: 279.45, decimals: 2, suffix: "%" });
    // 스톡 편집기가 돌려주는 rgb() 표기는 백엔드가 못 받는다 — HEX로 접혀야 한다.
    expect(arg.color).toBe("#17150f");
    // 상자를 그대로 넘겨야 되꽂을 때 글자 크기가 안 변한다.
    expect(arg.width).toBe(200);
    expect(arg.height).toBe(60);
    expect(arg.background).toBe("#f5f0e8");
    expect(arg.fonts[0].family).toBe("Paperozi");
  });

  it("하이라이트가 걸린 숫자는 그 띠를 GIF 안에 굽는다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(["https://s3/a.gif"]);
    renderPanel(onGenerate, [
      textElement({ backgroundEnabled: true, backgroundColor: "rgb(247, 241, 74)" }),
    ]);

    await user.click(screen.getByRole("button", { name: /countUpGifMake/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    // 띠를 CSS로 두면 1비트 알파가 글자 윗동을 매트색으로 잘라 먹는다.
    expect(onGenerate.mock.calls[0][0].marker).toBe("#f7f14a");
  });

  it("하이라이트가 없으면 띠도 없다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(["https://s3/a.gif"]);
    renderPanel(onGenerate);

    await user.click(screen.getByRole("button", { name: /countUpGifMake/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(onGenerate.mock.calls[0][0].marker).toBe("");
  });

  it("만든 GIF를 원래 자리에 갈아 끼운다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(["https://s3/a.gif"]);
    const { store } = renderPanel(onGenerate);

    await user.click(screen.getByRole("button", { name: /countUpGifMake/ }));
    await waitFor(() => expect(store.activePage.addElement).toHaveBeenCalled());
    const added = store.activePage.addElement.mock.calls[0][0];
    expect(added).toMatchObject({ type: "image", src: "https://s3/a.gif", x: 100 });
    expect(store.deleteElements).toHaveBeenCalledWith(["t1"]);
  });

  it("숫자가 없는 문구면 섹션을 아예 감춘다", () => {
    renderPanel(vi.fn(), [textElement({ text: "수분 가득한 하루" })]);
    expect(screen.queryByRole("button", { name: /countUpGifMake/ })).toBeNull();
  });

  it("콜백이 없으면 섹션이 안 뜬다", () => {
    const store = makeStore([textElement()]);
    render(<DetailPageProperties store={store} />);
    expect(screen.queryByRole("button", { name: /countUpGifMake/ })).toBeNull();
  });
});

describe("CellGridGifSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("아무것도 안 고른 상태에서 뜨고, 값을 그대로 넘겨 새 요소로 넣는다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(["https://s3/chart.gif"]);
    const { store } = renderPanel(onGenerate, []);

    await user.click(screen.getByRole("button", { name: /cellGridGifMake/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());

    const arg = onGenerate.mock.calls[0][0];
    expect(arg).toMatchObject({ kind: "cell_grid", filled: [6, 4, 2], cols: 8 });
    // 카운트업과 달리 대체할 원본이 없다 → 지우지 않고 캔버스에 새로 넣는다.
    await waitFor(() =>
      expect(insertPersonalImage).toHaveBeenCalledWith(
        store,
        "https://s3/chart.gif",
        { isGif: true },
      ),
    );
    expect(store.deleteElements).not.toHaveBeenCalled();
  });

  it("열 수보다 많이 채우라고 하면 버튼이 잠긴다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    renderPanel(onGenerate, []);

    const rows = screen.getByPlaceholderText("6,4,2");
    await user.clear(rows);
    await user.type(rows, "99");

    // 서버가 422로 되돌리기 전에 여기서 막는다.
    expect(screen.getByRole("button", { name: /cellGridGifMake/ })).toBeDisabled();
    expect(onGenerate).not.toHaveBeenCalled();
  });
});

describe("CountUpGifSection — 원본 타이포 물려받기", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function generateWith(overrides: Record<string, unknown>) {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue(["https://s3/a.gif"]);
    renderPanel(onGenerate, [textElement(overrides)]);
    await user.click(screen.getByRole("button", { name: /countUpGifMake/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    return onGenerate.mock.calls[0][0];
  }

  it("보통 굵기를 굵게 만들지 않는다", async () => {
    // 스톡 편집기는 굵기를 문자열로 들고 있어서 그냥 Number()하면 "normal"이 NaN이 된다.
    // 그 자리를 기본값으로 메우는 바람에 보통 굵기 숫자가 전부 ExtraBold로 나왔다.
    expect(await generateWith({ fontWeight: "normal" })).toMatchObject({
      fontWeight: 400,
    });
  });

  it("굵기가 fontStyle에 실려 와도 읽는다", async () => {
    expect(
      await generateWith({ fontWeight: undefined, fontStyle: "bold" }),
    ).toMatchObject({ fontWeight: 700 });
  });

  it("숫자 문자열 굵기는 그대로 통과", async () => {
    expect(await generateWith({ fontWeight: "300" })).toMatchObject({
      fontWeight: 300,
    });
  });

  it("자간을 그대로 넘긴다", async () => {
    expect(await generateWith({ letterSpacing: -1.5 })).toMatchObject({
      letterSpacing: -1.5,
    });
  });

  // 상자가 글자보다 넓으면 정렬이 곧 자리다 — 안 넘기면 서버가 늘 가운데로 그린다.
  it.each([
    ["left", "start"],
    ["center", "middle"],
    ["right", "end"],
  ])("정렬 %s 를 앵커 %s 로 넘긴다", async (align, anchor) => {
    expect(await generateWith({ align })).toMatchObject({ anchor });
  });

  it("굵기가 요청한 폰트 파일에도 반영된다", async () => {
    // 굵기를 잘못 읽으면 서버가 받아 가는 웹폰트 URL 자체가 다른 굵기를 가리킨다.
    const arg = await generateWith({ fontWeight: "normal" });
    expect(arg.fonts.every((f: { weight: number }) => f.weight <= 400)).toBe(true);
  });
});
