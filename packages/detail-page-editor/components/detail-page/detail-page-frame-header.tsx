"use client";

/**
 * 벌 하나의 표시 — **이게 결과물인가.**
 *
 * 이름은 안 적는다. 어느 벌인지는 판이 말하고, 위쪽 버튼(내려받기·발행)이 어느
 * 벌을 향하는지 이름을 들고 있다. 여기에 또 적으면 같은 말이 두 곳에 있게 된다.
 *
 * ## 선택과 확정은 다른 것이다
 *
 * **선택**은 지금 보고 있는 벌, **확정**은 결과물이 될 벌이다. 둘은 자주 다르다 —
 * B안을 들여다보면서 A안을 확정으로 둘 수 있어야 한다. 선택은 **테두리**가, 확정은
 * 이 **체크**가 말한다.
 *
 * 상자 **안** 우상단에 앉힌다. 밖에 두면 스크롤 영역 바깥으로 잘려 아예 안 보인다 —
 * 실제로 그렇게 사라져 있었다.
 */

/** 네모의 한 변(화면 px). 배율과 무관하게 눌러야 하므로 안 줄인다. */
export const FRAME_CHECK_SIZE = 22;

export function DetailPageFrameHeader({
  chosen,
  onChoose,
}: {
  chosen: boolean;
  /** 안 주면 아무것도 안 그린다 — 고를 것이 없는 문서도 있다. */
  onChoose?: () => void;
}) {
  if (!onChoose) return null;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={chosen}
      aria-label="내려받기·발행 대상으로"
      title="내려받기·발행 대상"
      onClick={onChoose}
      style={{
        position: "absolute",
        top: 6,
        right: 8,
        width: FRAME_CHECK_SIZE,
        height: FRAME_CHECK_SIZE,
      }}
      className={[
        "flex items-center justify-center rounded-dpe-md border transition-colors",
        chosen
          ? "border-dpe-ink-900 bg-dpe-ink-900 text-dpe-on-accent"
          : "border-dpe-ink-300 bg-dpe-surface text-transparent hover:border-dpe-ink-500",
      ].join(" ")}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3 8.5 6.5 12 13 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
