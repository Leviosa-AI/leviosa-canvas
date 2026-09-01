"use client";

/**
 * 판을 **다른 벌로 끌어오는 층.**
 *
 * ## 왜 캔버스가 아니라 여기서 하나
 *
 * 판마다 제 무대(Konva Stage)가 따로다. 판 위의 것을 끌어 그 무대 밖으로 나가면 그
 * 캔버스에 **잘려서 사라진다** — 끌고 있다는 느낌 자체가 없다. 그래서 끌리는 동안
 * 보이는 것은 무대가 아니라 모든 무대 **위에 뜬 이 층**이 그린다.
 *
 * ## 끄는 동안 문서는 한 글자도 안 바뀐다
 *
 * 놓는 순간에만 바꾼다. 그래야 중간에 그만두거나 창을 닫아도 남는 것이 없고,
 * 되돌리기도 «놓은 것» 한 단계로 깔끔하다.
 *
 * ## 열 장은 놓기 **전에** 막는다
 *
 * 넘겨 놓고 서버가 거절하게 두면, 3초마다 도는 자동저장이 «저장 실패»만 띄우고
 * 사람은 무엇을 되돌려야 하는지 모른다. 여기서 미리 막고 이유를 한 줄 적는다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";

import { copyPageToFrame } from "@leviosa-ai/canvas/edit/commands";
import { frameOf, groupFrames } from "@leviosa-ai/canvas/render/frames";
import type { CanvasStore } from "@leviosa-ai/canvas/store";
import { detailPageEditorProfile } from "../../lib/detail-page/editor-profile";

/**
 * 손잡이 한 변(화면 px).
 *
 * 아이콘보다 훨씬 크다. 작게 두면 «겨우 맞히는» 물건이 되는데, 이건 끌기의 시작점이라
 * 한 번에 잡혀야 한다.
 */
const GRIP = 32;

/**
 * 판을 벗어나도 손잡이를 이만큼은 붙잡아 둔다(화면 px).
 *
 * 손잡이가 판 모서리에 있어서, 바깥에서 다가가는 손은 «판 밖»을 지나 온다. 그때마다
 * 지우면 잡으러 가는 내내 눈앞에서 사라진다.
 */
const HOVER_SLACK = 56;

type Box = { left: number; top: number; width: number; height: number };

type Drop = {
  frameKey: string;
  /** 그 벌 안에서 몇 번째 자리인가. */
  at: number;
  /** 자리 표시선을 그릴 곳(층 좌표). */
  line: { left: number; top: number; width: number };
  /** 놓일 벌 전체(층 좌표). 여기를 통째로 밝혀 «저기로 간다»를 말한다. */
  area: Box;
  /** 넘쳐서 못 놓는가. */
  full: boolean;
};

function boxIn(node: Element, host: DOMRect): Box {
  const rect = node.getBoundingClientRect();
  return {
    left: rect.left - host.left,
    top: rect.top - host.top,
    width: rect.width,
    height: rect.height,
  };
}

export function FrameDragLayer({
  store,
  containerRef,
}: {
  store: CanvasStore;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [hover, setHover] = useState<{ id: string; box: Box } | null>(null);
  const [drag, setDrag] = useState<{
    pageId: string;
    from: string;
    box: Box;
    x: number;
    y: number;
    drop: Drop | null;
  } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // 벌이 하나뿐이면 끌어올 데가 없다 — 손잡이도 안 띄운다.
  const many = groupFrames(store.pages).length > 1;

  /** 커서 아래에서 놓을 자리를 읽는다. DOM 에서 직접 잰다 — 배율·스크롤이 다 반영돼 있다. */
  const readDrop = useCallback(
    (clientX: number, clientY: number, movingId: string): Drop | null => {
      const host = containerRef.current?.getBoundingClientRect();
      if (!host) return null;
      const frames = Array.from(
        document.querySelectorAll<HTMLElement>("[data-lc-frame]"),
      );
      if (!frames.length) return null;

      // 커서를 품은 열, 없으면 가로로 제일 가까운 열.
      const scored = frames.map((node) => {
        const rect = node.getBoundingClientRect();
        const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
        return { node, rect, dx };
      });
      scored.sort((a, b) => a.dx - b.dx);
      const target = scored[0];
      const frameKey = target.node.dataset.lcFrame ?? "";

      const pages = Array.from(
        target.node.querySelectorAll<HTMLElement>("[data-lc-page]"),
      );
      // 커서보다 위에서 끝난 판의 개수가 곧 끼어들 자리다.
      let at = pages.length;
      for (let index = 0; index < pages.length; index += 1) {
        const rect = pages[index].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          at = index;
          break;
        }
      }

      const held = store.pages.filter((page) => frameOf(page) === frameKey).length;
      const full = held >= detailPageEditorProfile().maxPages;

      const frameBox = boxIn(target.node, host);
      const edge =
        at === 0
          ? boxIn(pages[0] ?? target.node, host).top
          : (() => {
              const previous = boxIn(pages[at - 1] ?? target.node, host);
              return previous.top + previous.height;
            })();

      return {
        frameKey,
        at,
        line: { left: frameBox.left + 6, top: edge, width: frameBox.width - 12 },
        area: frameBox,
        full,
      };
    },
    [containerRef, store],
  );

  // 마우스가 지나는 판에만 손잡이를 띄운다. 마흔 개를 늘 그려 두면 화면이 시끄럽다.
  useEffect(() => {
    const host = containerRef.current;
    if (!host || !many) return;
    const onMove = (event: PointerEvent) => {
      if (dragRef.current) return;
      const target = event.target as HTMLElement | null;
      // 손잡이 위로 올라간 것은 «판을 벗어난 것»이 아니다. 이걸 안 봐 주면 손이
      // 닿는 순간 손잡이가 사라져서 영영 못 잡는다.
      if (target?.closest("[data-dp-frame-grip]")) return;
      const hostBox = host.getBoundingClientRect();
      const page = target?.closest<HTMLElement>("[data-lc-page]");
      const id = page?.dataset.lcPage;
      if (page && id) {
        setHover({ id, box: boxIn(page, hostBox) });
        return;
      }
      // 판 밖이라고 곧장 지우면, 손잡이는 판 **모서리**에 있으므로 바깥에서
      // 다가가는 동안 눈앞에서 사라진다 — 그래서 깜빡이는 것처럼 보인다.
      // 방금 보던 판 언저리면 그대로 둔다.
      const x = event.clientX - hostBox.left;
      const y = event.clientY - hostBox.top;
      setHover((current) => {
        if (!current) return null;
        const box = current.box;
        const near =
          x >= box.left - HOVER_SLACK &&
          x <= box.left + box.width + HOVER_SLACK &&
          y >= box.top - HOVER_SLACK &&
          y <= box.top + box.height + HOVER_SLACK;
        return near ? current : null;
      });
    };
    const onLeave = () => {
      if (!dragRef.current) setHover(null);
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [containerRef, many]);

  // 끄는 동안은 창 전체를 듣는다 — 커서가 판 밖으로 나가도 따라가야 한다.
  useEffect(() => {
    if (!drag) return;
    const host = containerRef.current?.getBoundingClientRect();
    if (!host) return;

    const onMove = (event: PointerEvent) => {
      setDrag((current) =>
        current
          ? {
              ...current,
              x: event.clientX - host.left,
              y: event.clientY - host.top,
              drop: readDrop(event.clientX, event.clientY, current.pageId),
            }
          : current,
      );
    };
    const onUp = () => {
      const current = dragRef.current;
      setDrag(null);
      setHover(null);
      if (!current?.drop || current.drop.full) return;
      // 제자리에 도로 놓는 것은 아무 일도 아니다.
      if (current.drop.frameKey === current.from) return;
      copyPageToFrame(store, current.pageId, current.drop.frameKey, current.drop.at);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [containerRef, drag, readDrop, store]);

  if (!many) return null;

  const shown = drag
    ? { id: drag.pageId, box: drag.box }
    : hover
      ? hover
      : null;

  return (
    <>
      {/* 손잡이. 판 왼쪽 위에 얹는다 — 판 안을 누르면 요소를 고르는 자리라 겹치면 안 된다. */}
      {shown && !drag ? (
        <button
          type="button"
          data-dp-frame-grip=""
          title="다른 벌로 끌어오기"
          aria-label="이 판을 다른 벌로 끌어오기"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const page = store.getPageById(shown.id);
            if (!page) return;
            const host = containerRef.current?.getBoundingClientRect();
            if (!host) return;
            setDrag({
              pageId: shown.id,
              from: frameOf(page),
              box: shown.box,
              x: event.clientX - host.left,
              y: event.clientY - host.top,
              drop: null,
            });
          }}
          style={{
            position: "absolute",
            left: shown.box.left + 4,
            top: shown.box.top + 4,
            width: GRIP,
            height: GRIP,
            zIndex: 25,
          }}
          className="flex cursor-grab items-center justify-center rounded-dpe-md border border-dpe-ink-200 bg-dpe-surface/95 text-dpe-ink-500 shadow-sm hover:text-dpe-ink-900"
        >
          <GripVertical aria-hidden="true" size={14} />
        </button>
      ) : null}

      {drag ? (
        <>
          {/* 끌리는 판. 무대 밖에서도 보여야 하므로 여기서 그린다. */}
          <div
            style={{
              position: "absolute",
              left: drag.x - drag.box.width / 2,
              top: drag.y - drag.box.height / 2,
              width: drag.box.width,
              height: drag.box.height,
              zIndex: 40,
              pointerEvents: "none",
            }}
            className="rounded-dpe-md border-2 border-dpe-ink-900 bg-dpe-ink-900/10"
          />

          {drag.drop ? (
            <>
              {/* 놓일 벌을 통째로 밝힌다. 가는 선 하나로는 «어디로 가는지»가 안 읽힌다. */}
              <div
                style={{
                  position: "absolute",
                  left: drag.drop.area.left,
                  top: drag.drop.area.top,
                  width: drag.drop.area.width,
                  height: drag.drop.area.height,
                  zIndex: 39,
                  pointerEvents: "none",
                  borderRadius: 10,
                  outline: `3px solid ${drag.drop.full ? "#c0392b" : "#2563eb"}`,
                  background: drag.drop.full
                    ? "rgba(192, 57, 43, 0.06)"
                    : "rgba(37, 99, 235, 0.06)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: drag.drop.line.left,
                  top: drag.drop.line.top - 3,
                  width: drag.drop.line.width,
                  height: 6,
                  zIndex: 41,
                  pointerEvents: "none",
                  borderRadius: 3,
                  background: drag.drop.full ? "#c0392b" : "#2563eb",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: drag.x + 16,
                  top: drag.y + 16,
                  zIndex: 42,
                  pointerEvents: "none",
                }}
                className={[
                  "rounded-dpe-md px-2 py-1 text-[11px] font-dpe-semibold text-dpe-on-accent",
                  drag.drop.full ? "bg-dpe-danger-600" : "bg-dpe-ink-900",
                ].join(" ")}
              >
                {drag.drop.full
                  ? `${detailPageEditorProfile().maxPages}장이 최대입니다`
                  : drag.drop.frameKey === drag.from
                    ? "같은 벌 — 놓아도 그대로"
                    : `${drag.drop.frameKey} · ${drag.drop.at + 1}번째로`}
              </span>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
