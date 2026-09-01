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
 * 잡는 자리(손잡이)는 여기 없다. 그건 판 상자 안에 산다(`frame-drag-grip`) — 밖에서
 * 자리를 재어 띄우면 손이 다가가는 동안 깜빡인다. 둘은 한 줄짜리 다리로 잇는다.
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

import { copyPageToFrame } from "@leviosa-ai/canvas/edit/commands";
import { frameOf, groupFrames } from "@leviosa-ai/canvas/render/frames";
import type { CanvasStore } from "@leviosa-ai/canvas/store";
import { detailPageEditorProfile } from "../../lib/detail-page/editor-profile";
import { setFrameDragStarter } from "./frame-drag-bus";

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

  /** 커서 아래에서 놓을 자리를 읽는다. DOM 에서 직접 잰다 — 배율·스크롤이 다 반영돼 있다. */
  const readDrop = useCallback(
    (clientX: number, clientY: number): Drop | null => {
      const host = containerRef.current?.getBoundingClientRect();
      if (!host) return null;
      const frames = Array.from(
        document.querySelectorAll<HTMLElement>("[data-lc-frame]"),
      );
      if (!frames.length) return null;

      // 커서를 품은 열, 없으면 가로로 제일 가까운 열.
      const scored = frames.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          node,
          dx: Math.max(rect.left - clientX, 0, clientX - rect.right),
        };
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
        full: held >= detailPageEditorProfile().maxPages,
      };
    },
    [containerRef, store],
  );

  // 손잡이가 부를 자리를 걸어 둔다.
  useEffect(() => {
    setFrameDragStarter((pageId, event) => {
      const host = containerRef.current?.getBoundingClientRect();
      const node = document.querySelector<HTMLElement>(
        `[data-lc-page="${CSS.escape(pageId)}"]`,
      );
      const page = store.getPageById(pageId);
      if (!host || !node || !page) return;
      setDrag({
        pageId,
        from: frameOf(page),
        box: boxIn(node, host),
        x: event.clientX - host.left,
        y: event.clientY - host.top,
        drop: null,
      });
    });
    return () => setFrameDragStarter(null);
  }, [containerRef, store]);

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
              drop: readDrop(event.clientX, event.clientY),
            }
          : current,
      );
    };
    const onUp = () => {
      const current = dragRef.current;
      setDrag(null);
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

  if (!drag) return null;

  return (
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
  );
}
