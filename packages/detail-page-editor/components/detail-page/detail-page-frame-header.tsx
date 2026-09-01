"use client";

/**
 * 벌 하나의 표시 — **이게 결과물인가.**
 *
 * ## 왜 네모 하나로는 안 되나
 *
 * 우상단에 체크박스만 두면 «이걸 켜면 무슨 일이 일어나는가»를 알 길이 없다. 켜 보기
 * 전에는 모르고, 켜 봐도 옅기만 바뀌니 여전히 모른다. 그래서 **글자가 붙는다** —
 * 벌의 이름이 아니라(그건 판이 말한다) 지금 무엇인지·누르면 무엇이 되는지를 말하는
 * 글자다.
 *
 *   고른 벌   →  ✓ 최종안        (검게 찬 알약. 누를 것이 아니라 «상태»다)
 *   나머지    →    최종안으로     (테두리 알약. 누르면 이게 최종안이 된다)
 *
 * 하나만 검게 차 있으므로 무엇이 켜져 있는지 세지 않아도 되고, 나머지의 «…으로»가
 * 바꿀 수 있다는 사실을 알려 준다.
 *
 * ## 선택과 최종안은 다른 것이다
 *
 * **선택**은 지금 보고 있는 벌, **최종안**은 결과물이 될 벌이다. 둘은 자주 다르다 —
 * 2안을 들여다보면서 1안을 최종안으로 둘 수 있어야 한다. 선택은 **테두리**가, 최종안은
 * 이 알약이 말한다.
 *
 * 상자 **안** 우상단에 앉힌다. 밖에 두면 스크롤 영역 바깥으로 잘려 아예 안 보인다.
 */

/** 알약이 앉을 자리의 높이(화면 px). 배율과 무관하게 읽고 눌러야 하므로 안 줄인다. */
export const FRAME_HEAD_HEIGHT = 24;

const COPY = {
  chosen: "최종안",
  choose: "최종안으로",
  hint: "내려받기와 발행은 최종안만 나갑니다",
};

export function DetailPageFrameHeader({
  chosen,
  onChoose,
}: {
  chosen: boolean;
  /** 안 주면 아무것도 안 그린다 — 고를 것이 없는 문서도 있다. */
  onChoose?: () => void;
}) {
  if (!onChoose) return null;

  const base =
    "absolute flex items-center gap-1 rounded-full px-2.5 text-[11px] font-dpe-semibold whitespace-nowrap transition-colors";
  const place = { top: 6, right: 8, height: FRAME_HEAD_HEIGHT - 4 } as const;

  // 이미 최종안인 것은 누를 것이 아니라 **상태**다. 버튼으로 두면 «끄면 어떻게 되지»를
  // 묻게 되는데, 최종안 없는 상태라는 것은 없다.
  if (chosen) {
    return (
      <span
        style={place}
        title={COPY.hint}
        className={`${base} border border-dpe-ink-900 bg-dpe-ink-900 text-dpe-on-accent`}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3 8.5 6.5 12 13 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {COPY.chosen}
      </span>
    );
  }

  return (
    <button
      type="button"
      style={place}
      title={COPY.hint}
      onClick={onChoose}
      className={`${base} border border-dpe-ink-300 bg-dpe-surface text-dpe-ink-500 opacity-70 hover:border-dpe-ink-900 hover:text-dpe-ink-900 hover:opacity-100`}
    >
      {COPY.choose}
    </button>
  );
}
