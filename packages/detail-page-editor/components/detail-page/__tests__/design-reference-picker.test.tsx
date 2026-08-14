import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * 레퍼런스 판독의 값(크레딧) 표시.
 *
 * 지켜야 할 주장 넷.
 *
 * 1. **누르기 전에 값을 안다.** 누른 뒤 402 로 알게 되면 이미 축 고르고 지시까지 다
 *    적은 뒤다.
 * 2. **값은 장수가 아니라 그림 크기에 붙는다.** 세로로 긴 캡쳐가 정사각 썸네일보다
 *    비싸야, 큰 그림을 붙인 사람을 작은 그림을 붙인 사람이 보조하지 않는다.
 * 3. **조각내기까지 세서 말한다.** 상세페이지 전체 캡쳐는 서버가 나눠 싣는다 — 그
 *    사실을 모르는 화면은 1이라 써 놓고 8을 받는다.
 * 4. **잔액 부족은 실패와 다른 말이다.** "읽지 못했어요"로 접으면 셀러는 다시 누른다 —
 *    다시 눌러도 결과는 같다. 할 일(충전)이 정해져 있으니 그 말을 해 준다.
 */

// jsdom 은 그림을 디코드하지 못해 크기가 늘 "모름"으로 떨어진다 — 그러면 크기에 따라
// 값이 달라진다는 주장 자체를 잴 수 없다. 줄이기 단계만 바꿔 끼워 크기를 준다.
const shrink = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/detail-page/reference-image", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../lib/detail-page/reference-image")>();
  return { ...actual, shrinkReferenceDataUri: shrink };
});

/** 정사각 썸네일(255토큰). 4장까지 1크레딧. */
const SMALL = { width: 512, height: 512 };
/**
 * 안 나뉘는 것 중 가장 비싼 모양(1,445토큰). 종횡비 2.45 로 조각내기 문턱(2.5) 바로
 * 아래다 — 여기서 조각이 끼면 "장수가 아니라 크기"라는 주장과 "조각내기"라는 주장이
 * 한 수에 섞여 무엇이 값을 올렸는지 못 가린다.
 */
const TALL = { width: 640, height: 1568 };
/** 상세페이지 전체 캡쳐. 서버가 28조각으로 나눠 싣는다(실측 job e538ce45). */
const PAGE_CAPTURE = { width: 900, height: 39418 };

function pictureSize(size: { width: number; height: number }) {
  shrink.mockImplementation(async (uri: string) => ({ uri, ...size }));
}

import { DesignReferencePicker } from "../design-reference-picker";
import { renderWithDetailPageHost } from "./host-stub";

const mockedAnalyze = vi.fn();

/**
 * 402 본문을 잔액 부족으로 읽는 것은 **호스트**의 일이다(소싱 서버 오류 규약).
 * 그 판별 자체는 `src/lib/__tests__/detail-page-image-personal.test.ts` 가 잰다.
 * 여기서 재는 것은 "호스트가 부족하다고 하면 셸이 그렇게 말하는가" 하나다.
 */
const SHORTFALL = { error: "insufficient_credits", remaining: 0 };

beforeEach(() => {
  pictureSize(SMALL);
});

afterEach(() => {
  mockedAnalyze.mockReset();
  shrink.mockReset();
});

function refFile(name: string) {
  return new File(["x"], name, { type: "image/png" });
}

function renderPicker() {
  return renderWithDetailPageHost(
    <DesignReferencePicker brief={null} onBriefChange={vi.fn()} />,
    {
      api: {
        analyzeDetailPageDesignReferences: mockedAnalyze,
        asInsufficientCreditsError: (err: unknown) =>
          err === SHORTFALL ? (SHORTFALL as never) : null,
      },
    },
  );
}

async function attach(
  user: ReturnType<typeof userEvent.setup>,
  files: File[],
) {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await user.upload(input, files);
  await waitFor(() =>
    expect(screen.getAllByRole("img")).toHaveLength(files.length),
  );
}

describe("DesignReferencePicker 크레딧", () => {
  it("누르기 전에 값을 알려 준다", async () => {
    const user = userEvent.setup();
    renderPicker();

    await attach(user, [refFile("a.png"), refFile("b.png")]);

    await waitFor(() => expect(screen.getByText(/1크레딧이/)).toBeInTheDocument());
  });

  it("같은 한 장이어도 세로로 긴 캡쳐가 더 비싸다", async () => {
    const user = userEvent.setup();
    pictureSize(TALL);
    renderPicker();

    await attach(user, [refFile("a.png")]);

    // 정사각 썸네일 한 장은 1크레딧이다(위 테스트) — 같은 장수인데 값이 다르다.
    await waitFor(() => expect(screen.getByText(/2크레딧이/)).toBeInTheDocument());
  });

  it("그림을 빼면 값도 줄어든다", async () => {
    const user = userEvent.setup();
    pictureSize(TALL);
    renderPicker();

    await attach(user, ["a", "b", "c", "d", "e"].map((n) => refFile(`${n}.png`)));
    await waitFor(() => expect(screen.getByText(/3크레딧이/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "5번 레퍼런스 빼기" }));

    await waitFor(() => expect(screen.getByText(/2크레딧이/)).toBeInTheDocument());
  });

  it("상세페이지 전체 캡쳐는 조각내기까지 세서 말한다", async () => {
    // 서버가 28조각으로 나눠 싣는다. 화면이 그것을 모르면 1크레딧이라 써 놓고 8을
    // 받는다 — 판독은 선차감이라 그 차이를 셀러가 나중에 안다.
    const user = userEvent.setup();
    pictureSize(PAGE_CAPTURE);
    renderPicker();

    await attach(user, [refFile("page.png")]);

    await waitFor(() => expect(screen.getByText(/8크레딧이/)).toBeInTheDocument());
  });

  it("잔액이 모자라면 필요한 크레딧과 남은 크레딧을 말한다", async () => {
    const user = userEvent.setup();
    mockedAnalyze.mockRejectedValue(SHORTFALL);
    renderPicker();

    await attach(user, [refFile("a.png"), refFile("b.png")]);
    await waitFor(() => expect(screen.getByText(/1크레딧이/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /레퍼런스 읽기/ }));

    const message = await screen.findByText(/크레딧이 모자라요/);
    expect(message.textContent).toContain("1크레딧이 필요해요");
    expect(message.textContent).toContain("남은 크레딧 0");
  });

  it("판독 실패는 서버가 말한 이유를 그대로 보여 준다", async () => {
    const user = userEvent.setup();
    mockedAnalyze.mockRejectedValue(new Error("판독 모델이 응답하지 않았습니다."));
    renderPicker();

    await attach(user, [refFile("a.png")]);
    await user.click(screen.getByRole("button", { name: /레퍼런스 읽기/ }));

    expect(
      await screen.findByText("판독 모델이 응답하지 않았습니다."),
    ).toBeInTheDocument();
  });
});
