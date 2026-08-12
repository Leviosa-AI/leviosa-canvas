import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPagePageToolbar } from "../detail-page-page-toolbar";
import { SectionReauthorController } from "../section-reauthor-controller";
import { MAX_DESIGN_REFERENCES } from "../../../lib/detail-page/design-reference";
import { onSectionReauthorRequested } from "../../../lib/detail-page/section-reauthor-bus";

/**
 * 화면 재저작 배선.
 *
 * 지켜야 할 주장 넷.
 *
 * 1. **미배선이면 버튼이 없다.** 눌러도 아무 일 없는 버튼은 "고장 났다"로 읽힌다.
 * 2. **배선되면 곧바로 뜬다.** 툴바가 편집기보다 먼저 그려지므로 한 번 읽고 마는
 *    헬퍼로는 배선 뒤에도 계속 숨는다.
 * 3. **다른 화면은 그대로.** 재저작한 적 없는 화면이 조용히 달라지는 것이 가장 나쁘다.
 * 4. **린트가 남아도 결과는 적용한다.** 조용히 되돌리면 크레딧만 쓴 상태와 구별되지 않는다.
 */

import { withDetailPageHost } from "./host-stub";

const mockedReauthor = vi.fn();

/**
 * 이 파일의 모든 렌더는 호스트를 꽂고 간다. 재저작 호출은 `DetailPageHost.api` 로만
 * 들어오므로, 모듈을 갈아 끼우지 않고 그 하나만 세우면 된다.
 */
function render(ui: ReactNode) {
  return rtlRender(
    withDetailPageHost(ui, { api: { reauthorDetailPageSection: mockedReauthor } }),
  );
}

function makePage(id: string) {
  return { id, bleed: 0, width: 750, height: 1000, setZIndex: vi.fn(), clone: vi.fn() };
}

function makeStore() {
  const pages = [makePage("brand-open"), makePage("point-1")];
  const document = {
    pages: [
      { id: "brand-open", children: [{ id: "old" }] },
      { id: "point-1", children: [{ id: "keep" }] },
    ],
  };
  const loaded: unknown[] = [];
  return {
    pages,
    activePage: pages[0],
    addPage: vi.fn(() => makePage("x")),
    deletePages: vi.fn(),
    openSidePanel: vi.fn(),
    toDataURL: vi.fn(async () => "data:image/png;base64,BASE"),
    toJSON: () => document,
    loadJSON: (json: unknown) => loaded.push(json),
    loaded,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("페이지 툴바의 재저작 버튼", () => {
  it("배선되지 않았으면 뜨지 않는다", () => {
    const store = makeStore();
    render(<DetailPagePageToolbar store={store} page={store.pages[0]} />);
    expect(screen.queryByLabelText("detailPage.pageToolbar.reauthor")).toBeNull();
  });

  it("배선되면 곧바로 뜨고, 그 화면 id 로 요청한다", async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    const unsubscribe = onSectionReauthorRequested((id) => seen.push(id));
    try {
      const store = makeStore();
      render(<DetailPagePageToolbar store={store} page={store.pages[1]} />);
      await user.click(screen.getByLabelText("detailPage.pageToolbar.reauthor"));
      expect(seen).toEqual(["point-1"]);
    } finally {
      unsubscribe();
    }
  });
});

describe("SectionReauthorController", () => {
  it("generatedId 가 없으면 배선하지 않는다", () => {
    const store = makeStore();
    render(<SectionReauthorController store={store} />);
    const toolbar = render(
      <DetailPagePageToolbar store={store} page={store.pages[0]} />,
    );
    expect(toolbar.queryByLabelText("detailPage.pageToolbar.reauthor")).toBeNull();
  });

  it("요청을 받으면 그 화면을 렌더해 밑그림으로 띄운다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    render(
      <>
        <SectionReauthorController store={store} generatedId="gid" />
        <DetailPagePageToolbar store={store} page={store.pages[0]} />
      </>,
    );
    await user.click(screen.getByLabelText("detailPage.pageToolbar.reauthor"));
    await waitFor(() =>
      expect(store.toDataURL).toHaveBeenCalledWith({
        pageId: "brand-open",
        pixelRatio: 1,
      }),
    );
    expect(screen.getByText("detailPage.reauthor.title")).toBeTruthy();
  });

  it("결과 페이지만 갈아 끼우고 다른 화면은 그대로 둔다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    mockedReauthor.mockResolvedValue({
      label: "brand-open",
      page: { id: "brand-open", children: [{ id: "new" }] },
      lint_ok: true,
      lint_findings: [],
      rounds: 1,
      text_used: 1,
      text_limit: 30,
    });
    render(
      <>
        <SectionReauthorController store={store} generatedId="gid" />
        <DetailPagePageToolbar store={store} page={store.pages[0]} />
      </>,
    );
    await user.click(screen.getByLabelText("detailPage.pageToolbar.reauthor"));
    await screen.findByPlaceholderText("detailPage.annotate.placeholder");
    await user.type(screen.getByPlaceholderText("detailPage.annotate.placeholder"), "칸을 두 개로");
    await user.click(screen.getByRole("button", { name: "detailPage.reauthor.submit" }));

    await waitFor(() => expect(store.loaded).toHaveLength(1));
    const doc = store.loaded[0] as { pages: Array<{ id: string; children: unknown[] }> };
    expect(doc.pages.map((p) => p.id)).toEqual(["brand-open", "point-1"]);
    expect(doc.pages[0].children).toEqual([{ id: "new" }]);
    expect(doc.pages[1].children).toEqual([{ id: "keep" }]);
  });

  it("마킹 없이 글만으로도 보낼 수 있다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    mockedReauthor.mockResolvedValue({
      label: "brand-open",
      page: { id: "brand-open", children: [] },
      lint_ok: true,
      lint_findings: [],
      rounds: 1,
      text_used: 1,
      text_limit: 30,
    });
    render(
      <>
        <SectionReauthorController store={store} generatedId="gid" />
        <DetailPagePageToolbar store={store} page={store.pages[0]} />
      </>,
    );
    await user.click(screen.getByLabelText("detailPage.pageToolbar.reauthor"));
    await user.type(
      await screen.findByPlaceholderText("detailPage.annotate.placeholder"),
      "표를 넣어 주세요",
    );
    await user.click(screen.getByRole("button", { name: "detailPage.reauthor.submit" }));
    await waitFor(() =>
      expect(mockedReauthor).toHaveBeenCalledWith("gid", {
        label: "brand-open",
        instruction: "표를 넣어 주세요",
        annotated_image: undefined,
        reference_images: undefined,
        template_id: undefined,
      }),
    );
  });

  it("열려 있는 문서의 템플릿을 알려 준다", async () => {
    // dev-canvas 는 픽스처를 브라우저에서만 띄운다 — 서버 scratch 인스턴스에는 템플릿도
    // HTML 도 없어서, 알려 주지 않으면 시연 하니스에서 눌러 볼 수 없다.
    const user = userEvent.setup();
    const store = makeStore();
    mockedReauthor.mockResolvedValue({
      label: "brand-open",
      page: { id: "brand-open", children: [] },
      lint_ok: true,
      lint_findings: [],
      rounds: 1,
      text_used: 1,
      text_limit: 30,
    });
    render(
      <>
        <SectionReauthorController
          store={store}
          generatedId="gid"
          templateId="casual_10_N_0602_01"
        />
        <DetailPagePageToolbar store={store} page={store.pages[0]} />
      </>,
    );
    await user.click(screen.getByLabelText("detailPage.pageToolbar.reauthor"));
    await user.type(
      await screen.findByPlaceholderText("detailPage.annotate.placeholder"),
      "바꿔 주세요",
    );
    await user.click(
      screen.getByRole("button", { name: "detailPage.reauthor.submit" }),
    );
    await waitFor(() =>
      expect(mockedReauthor).toHaveBeenCalledWith(
        "gid",
        expect.objectContaining({ template_id: "casual_10_N_0602_01" }),
      ),
    );
  });

  // --- 레퍼런스 채널 -------------------------------------------------------- //
  //
  // 마킹본과 역할이 다르다: 마킹본은 고칠 화면 자체, 레퍼런스는 참고할 남의 화면이다.
  // 섞여 나가면 모델이 레퍼런스를 고쳐서 내놓는다.

  function refFile(name: string) {
    return new File(["x"], name, { type: "image/png" });
  }

  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    const store = makeStore();
    mockedReauthor.mockResolvedValue({
      label: "brand-open",
      page: { id: "brand-open", children: [] },
      lint_ok: true,
      lint_findings: [],
      rounds: 1,
      text_used: 1,
      text_limit: 30,
    });
    render(
      <>
        <SectionReauthorController store={store} generatedId="gid" />
        <DetailPagePageToolbar store={store} page={store.pages[0]} />
      </>,
    );
    await user.click(screen.getByLabelText("detailPage.pageToolbar.reauthor"));
    await screen.findByPlaceholderText("detailPage.annotate.placeholder");
    return store;
  }

  it("붙인 참고 사진을 함께 보낸다", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, refFile("ref.png"));
    await screen.findByAltText("detailPage.reauthor.referenceAlt");

    await user.type(
      screen.getByPlaceholderText("detailPage.annotate.placeholder"),
      "이렇게 2단으로",
    );
    await user.click(
      screen.getByRole("button", { name: "detailPage.reauthor.submit" }),
    );

    await waitFor(() =>
      expect(mockedReauthor).toHaveBeenCalledWith(
        "gid",
        expect.objectContaining({
          reference_images: [
            { url: expect.stringContaining("data:"), aspects: [] },
          ],
        }),
      ),
    );
  });

  it("참고 사진마다 번호가 붙는다", async () => {
    // 유저가 실제로 쓰는 문장이 "1번 이미지의 색감처럼"이다. 번호를 화면에 안 적어 두면
    // 그 문장을 쓸 근거가 없다.
    const user = userEvent.setup();
    await openDialog(user);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, [refFile("a.png"), refFile("b.png")]);

    await waitFor(() =>
      expect(
        screen.getAllByAltText("detailPage.reauthor.referenceAlt"),
      ).toHaveLength(2),
    );
    expect(screen.getByText("1번")).toBeInTheDocument();
    expect(screen.getByText("2번")).toBeInTheDocument();
  });

  it("고른 축이 그 장에만 붙어서 간다", async () => {
    // 축을 못 고르면 모델이 한 장을 통째로 따라가 남의 상세페이지가 된다. 그리고 축은
    // **그 장의 것**이라, 한 장에서 고른 것이 다른 장까지 번지면 안 된다.
    const user = userEvent.setup();
    await openDialog(user);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, [refFile("a.png"), refFile("b.png")]);
    await waitFor(() =>
      expect(
        screen.getAllByAltText("detailPage.reauthor.referenceAlt"),
      ).toHaveLength(2),
    );

    await user.click(screen.getAllByRole("button", { name: "색감" })[0]);
    await user.click(screen.getAllByRole("button", { name: "서체" })[0]);
    await user.click(screen.getAllByRole("button", { name: "레이아웃" })[1]);

    await user.type(
      screen.getByPlaceholderText("detailPage.annotate.placeholder"),
      "1번 색감·폰트, 2번 레이아웃",
    );
    await user.click(
      screen.getByRole("button", { name: "detailPage.reauthor.submit" }),
    );

    await waitFor(() =>
      expect(mockedReauthor).toHaveBeenCalledWith(
        "gid",
        expect.objectContaining({
          reference_images: [
            expect.objectContaining({ aspects: ["palette", "typography"] }),
            expect.objectContaining({ aspects: ["layout"] }),
          ],
        }),
      ),
    );
  });

  it("너무 큰 사진은 붙이는 자리에서 막는다", async () => {
    // 서버에서만 막으면 유저는 그림을 고르고 축을 고르고 지시를 다 적은 **다음에야** 안다.
    // (형식은 input 의 accept 가 먼저 거른다 — 여기서 재는 것은 크기다.)
    const user = userEvent.setup();
    await openDialog(user);

    const huge = new File([new Uint8Array(1)], "huge.png", { type: "image/png" });
    Object.defineProperty(huge, "size", { value: 30 * 1024 * 1024 });

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, huge);

    expect(await screen.findByText(/MB 까지예요/)).toBeInTheDocument();
    expect(
      screen.queryAllByAltText("detailPage.reauthor.referenceAlt"),
    ).toHaveLength(0);
  });

  it("뺀 참고 사진은 보내지 않는다", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, refFile("ref.png"));
    await user.click(
      await screen.findByLabelText("detailPage.reauthor.referenceRemove"),
    );

    await user.type(
      screen.getByPlaceholderText("detailPage.annotate.placeholder"),
      "그냥 두 칸으로",
    );
    await user.click(
      screen.getByRole("button", { name: "detailPage.reauthor.submit" }),
    );

    await waitFor(() =>
      expect(mockedReauthor).toHaveBeenCalledWith(
        "gid",
        expect.objectContaining({ reference_images: undefined }),
      ),
    );
  });

  it("상한을 넘겨 고르면 상한까지만 붙는다", async () => {
    // 서버도 같은 수에서 자른다. 프론트가 더 보내면 유저는 붙인 사진이 반영되지 않은
    // 이유를 알 수 없다.
    const user = userEvent.setup();
    await openDialog(user);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(
      input,
      Array.from({ length: MAX_DESIGN_REFERENCES + 2 }, (_, i) =>
        refFile(`${i}.png`),
      ),
    );

    await waitFor(() =>
      expect(screen.getAllByAltText("detailPage.reauthor.referenceAlt")).toHaveLength(
        MAX_DESIGN_REFERENCES,
      ),
    );
    // 상한에 닿으면 더 붙이는 버튼도 사라진다 — 눌러도 아무 일 없는 버튼은 고장으로 읽힌다.
    expect(screen.queryByText("detailPage.reauthor.referenceAdd")).toBeNull();
  });

  it("모달을 닫으면 붙였던 참고 사진이 남지 않는다", async () => {
    const user = userEvent.setup();
    const store = await openDialog(user);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, refFile("ref.png"));
    await screen.findByAltText("detailPage.reauthor.referenceAlt");

    await user.click(screen.getByLabelText("detailPage.annotate.close"));
    await user.click(screen.getByLabelText("detailPage.pageToolbar.reauthor"));
    await screen.findByPlaceholderText("detailPage.annotate.placeholder");

    expect(screen.queryByAltText("detailPage.reauthor.referenceAlt")).toBeNull();
    expect(store.toDataURL).toHaveBeenCalled();
  });

  it("규약 위반이 남아도 결과를 적용하고 알린다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    mockedReauthor.mockResolvedValue({
      label: "brand-open",
      page: { id: "brand-open", children: [{ id: "new" }] },
      lint_ok: false,
      lint_findings: [{ code: "E-SVG-002" }],
      rounds: 2,
      text_used: 1,
      text_limit: 30,
    });
    render(
      <>
        <SectionReauthorController store={store} generatedId="gid" />
        <DetailPagePageToolbar store={store} page={store.pages[0]} />
      </>,
    );
    await user.click(screen.getByLabelText("detailPage.pageToolbar.reauthor"));
    await user.type(await screen.findByPlaceholderText("detailPage.annotate.placeholder"), "바꿔 주세요");
    await user.click(screen.getByRole("button", { name: "detailPage.reauthor.submit" }));

    await waitFor(() => expect(store.loaded).toHaveLength(1));
    expect(await screen.findByText("detailPage.reauthor.lintWarning")).toBeTruthy();
  });

  it("실패하면 문서를 건드리지 않고 이유를 보여 준다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    mockedReauthor.mockRejectedValue(new Error("편집 한도를 다 썼어요."));
    render(
      <>
        <SectionReauthorController store={store} generatedId="gid" />
        <DetailPagePageToolbar store={store} page={store.pages[0]} />
      </>,
    );
    await user.click(screen.getByLabelText("detailPage.pageToolbar.reauthor"));
    await user.type(await screen.findByPlaceholderText("detailPage.annotate.placeholder"), "바꿔 주세요");
    await user.click(screen.getByRole("button", { name: "detailPage.reauthor.submit" }));

    expect(await screen.findByText("편집 한도를 다 썼어요.")).toBeTruthy();
    expect(store.loaded).toHaveLength(0);
  });
});
