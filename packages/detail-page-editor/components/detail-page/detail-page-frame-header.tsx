"use client";

/**
 * 벌 위에 붙는 것 — **이게 결과물인가**, 그리고 **바꾸는 길**.
 *
 * ## 화면에 라벨은 최대 둘
 *
 * 넷에 다 라벨을 달면 «라벨 넷»으로 읽히고, 무엇이 상태이고 무엇이 행동인지 모양으로
 * 구분이 안 된다. Shopify 의 테마 목록도 Vercel 의 배포 목록도 반대로 한다 — 지금
 * 나가는 것 **하나에만** 표를 달고, 바꾸는 행동은 조용한 곳에 둔다.
 *
 *   대표인 벌     →  «대표»          글씨. 누를 것이 아니라 상태다
 *   보고 있는 벌  →  «대표로 지정»    테두리 버튼. 누르면 바뀐다
 *   나머지        →  아무것도 없음
 *
 * 고르려면 먼저 그 벌을 본다 — 이미 하던 동작이라 클릭이 하나 느는 것이 아니다.
 *
 * ## 뱃지에 손잡이를 달지 않는다
 *
 * 상태를 나타내는 표는 누르는 것이 아니고, 누르는 것은 버튼처럼 생겨야 한다. 둘을
 * 같은 모양으로 두면 어느 쪽이 무엇인지 읽어 봐야 안다. 그래서 대표는 **글씨**,
 * 지정은 **테두리 있는 버튼**이다.
 *
 * ## 왜 «최종»이 아닌가
 *
 * 언제든 바꾸는 값인데 «최종»이라 적으면 되돌릴 수 없다는 느낌을 준다 — 누르기 전에
 * 한 번 망설이게 된다. 게다가 계속 고칠 문서라 최종도 아니다. «대표»는 여럿 중 밖으로
 * 나가는 하나라는 뜻이 이미 붙어 있는 말이고(대표 사진), 실제로 이 값이 목록 카드
 * 썸네일과 레퍼런스로 나가는 판까지 정한다.
 *
 * ## 흰 판 위가 아니라 회색 바닥 위
 *
 * 작업물을 가리지 않는 자리다. 피그마가 프레임 이름을 두는 그 자리이기도 하다.
 */

/** 이 줄이 차지하는 높이(화면 px). 배율과 무관하게 읽혀야 하므로 안 줄인다. */
export const FRAME_HEAD_HEIGHT = 22;

const COPY = {
  chosen: "대표",
  choose: "대표로 지정",
  hint: "내려받기와 발행은 대표만 나갑니다",
};

export function DetailPageFrameHeader({
  chosen,
  selected,
  onChoose,
}: {
  chosen: boolean;
  /** 지금 보고 있는 벌인가. 여기에만 바꾸는 버튼이 뜬다. */
  selected: boolean;
  /** 안 주면 아무것도 안 그린다 — 고를 것이 없는 문서도 있다. */
  onChoose?: () => void;
}) {
  if (!onChoose) return null;

  const place = {
    position: "absolute" as const,
    left: 2,
    bottom: "100%" as const,
    marginBottom: 4,
    height: FRAME_HEAD_HEIGHT - 4,
    whiteSpace: "nowrap" as const,
  };

  if (chosen) {
    return (
      <span
        style={place}
        title={COPY.hint}
        className="flex items-center gap-1 text-[11px] font-le-bold text-le-ink-900"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3 8.5 6.5 12 13 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {COPY.chosen}
      </span>
    );
  }

  // 보고 있지 않은 벌은 아무 말도 안 한다. 누르면 보게 되고, 그때 이 버튼이 뜬다.
  if (!selected) return null;

  return (
    <button
      type="button"
      style={place}
      title={COPY.hint}
      onClick={onChoose}
      className="flex items-center rounded-full border border-le-ink-400 bg-le-surface px-2 text-[11px] font-le-semibold text-le-ink-700 transition-colors hover:border-le-ink-900 hover:text-le-ink-900"
    >
      {COPY.choose}
    </button>
  );
}
