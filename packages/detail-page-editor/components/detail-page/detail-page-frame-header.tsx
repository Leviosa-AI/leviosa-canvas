"use client";

/**
 * 열 하나의 머리 — **이 판들이 한 벌이라는 표시.**
 *
 * 열만 벌려 놓으면 판이 그냥 흩어져 보인다. 피그마의 프레임이 그렇듯, 묶여 있다는
 * 느낌은 이름과 테두리에서 온다.
 *
 * ## 두 상태를 안 헷갈리게
 *
 * **선택**은 지금 보고 있는 벌이고 **확정**은 결과물이 될 벌이다. 둘은 자주 다르다 —
 * B안을 들여다보면서 A안을 확정으로 둘 수 있어야 한다. 그래서 표시를 갈라 둔다:
 * 선택은 **테두리**, 확정은 **체크박스**. 확정에는 글자를 안 붙인다 — 머리에 «확정»
 * 이라 써 두는 것보다 체크를 옮겨 보고 위쪽 버튼의 이름이 따라 바뀌는 걸 한 번
 * 보는 쪽이 빠르다.
 *
 * 이름표는 **흐름에 안 낀다**(절대 위치). 열은 판 너비만큼만 넓어야 하는데, 많이
 * 줄이면 글자가 판보다 넓어져서 열을 벌려 놓는다.
 *
 * 그렇다고 상자 **밖** 위쪽에 두면 스크롤 영역 바깥으로 잘려서 아예 안 보인다 —
 * 체크박스까지 같이 사라진다. 그래서 상자 안, 위쪽에 비워 둔 자리에 앉힌다.
 */

export function DetailPageFrameHeader({
  name,
  selected,
  chosen,
  onSelect,
  onChoose,
}: {
  name: string;
  selected: boolean;
  chosen: boolean;
  onSelect: () => void;
  /** 안 주면 체크박스를 안 그린다 — 고를 것이 없는 화면도 있다. */
  onChoose?: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 9,
        top: 4,
        display: "flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className={[
          "text-[11px] font-dpe-semibold tracking-wide transition-colors",
          selected
            ? "text-dpe-ink-900"
            : "text-dpe-ink-400 hover:text-dpe-ink-700",
        ].join(" ")}
      >
        {name}
      </button>
      {onChoose ? (
        <input
          type="checkbox"
          checked={chosen}
          onChange={onChoose}
          // 체크박스 하나만 두므로 무엇을 고르는 것인지는 읽어 주는 이름으로 남긴다.
          aria-label={`${name}을(를) 내려받기·발행 대상으로`}
          title="내려받기·발행 대상"
          className="h-3 w-3 cursor-pointer accent-dpe-ink-900"
        />
      ) : null}
    </div>
  );
}
