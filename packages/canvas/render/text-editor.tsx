"use client";

/**
 * 캔버스 위 글자 편집 — 이 프로젝트의 관문(`docs/leviosa-canvas-plan.md` §4).
 *
 * ## 왜 `<textarea>`인가
 *
 * 캐럿·드래그 선택·⌘A·방향키·**한글 조합 입력**을 직접 구현하면 그것만으로 몇 달이고,
 * 브라우저마다 다르게 틀린다. 브라우저에게 맡기고 우리는 **글자를 같은 자리에 놓는
 * 일**만 한다. 스톡 편집기의 `text-element.js`에도 textarea가 있지만 거기엔
 * `compositionstart`가 없다 — 한글 조합을 다루지 않는다는 뜻이고, 우리가 이기려면
 * 반드시 풀어야 하는 자리이기도 하다.
 *
 * ## 조합 입력을 깨뜨리지 않는 방법
 *
 * textarea를 **비제어(uncontrolled)로 둔다.** 입력이 들어오면 문서에 쓰지만, 문서 값을
 * textarea로 되돌려 넣지 않는다. 조합 중인 글자를 React가 다시 밀어 넣는 순간 조합이
 * 끊기고 "ㅇㅏㄴ녕"이 된다 — 되먹임 고리를 아예 만들지 않는 것이 답이다.
 *
 * ## 자리 맞추기
 *
 * 확대/축소는 CSS `transform: scale()`로만 준다. 글자 크기·자간·줄높이를 배율로 곱하면
 * 반올림이 쌓여 캐럿이 한두 픽셀씩 밀린다. 세로 정렬 오프셋은 Konva에게 직접 물어본
 * 줄 수로 계산한다(`measureTextLayout`).
 */

import { useEffect, useLayoutEffect, useRef } from "react";

import type { CanvasElement, CanvasStore } from "../store";
import { num, str, type Attrs } from "../types";
import { useElementVersion } from "../use-canvas";
import { isSingleLineBox, konvaFontStyle, lineHeightRatio, textDecoration } from "./attrs";
import { measureTextLayout } from "./text-layout";

function cssFontWeight(el: Attrs): number | string {
  const raw = el.fontWeight;
  if (typeof raw === "number") return raw;
  const text = str(el, "fontWeight");
  return text || "normal";
}

export function TextEditorOverlay({
  store,
  el,
  scale,
  onDone,
}: {
  store: CanvasStore;
  el: CanvasElement;
  scale: number;
  onDone: () => void;
}) {
  useElementVersion(el);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const composing = useRef(false);
  const initialCustom = (el.custom ?? {}) as Attrs;
  const anchorWidth = useRef(
    num(initialCustom, "textFitAnchorWidth", num(el, "width", 0)),
  );
  const anchorHeight = useRef(
    num(initialCustom, "textFitAnchorHeight", num(el, "height", 0)),
  );

  const fontSize = num(el, "fontSize", 14);
  const ratio = lineHeightRatio(el.lineHeight, fontSize);
  const box = {
    width: num(el, "width", 0),
    height: num(el, "height", 0),
  };
  const padding = el.backgroundEnabled === true ? num(el, "backgroundPadding", 0) : 0;
  const layout = measureTextLayout(el);
  const custom = (el.custom ?? {}) as Attrs;
  const savedAnchorWidth = num(custom, "textFitAnchorWidth", box.width);
  const growX =
    str(el, "align", "left") === "center"
      ? (savedAnchorWidth - box.width) / 2
      : ["right", "end"].includes(str(el, "align", "left"))
        ? savedAnchorWidth - box.width
        : 0;
  const position = el.absolutePosition;
  const singleLine = isSingleLineBox(el);
  const style = konvaFontStyle(el);

  // 편집 한 판을 통째로 한 단계로 — 안 묶으면 ⌘Z를 글자 수만큼 눌러야 한다.
  useEffect(() => {
    store.history.startTransaction();
    return () => store.history.endTransaction();
  }, [store]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    // 캐럿을 끝에 둔다 — 전체 선택으로 시작하면 한 글자만 쳐도 문구가 날아간다.
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  return (
    <div
      data-lc-text-editor={el.id}
      style={{
        position: "absolute",
        left: position.x * scale,
        top: position.y * scale,
        transform: `scale(${scale}) rotate(${num(el, "rotation", 0)}deg)`,
        transformOrigin: "top left",
        // 상자 자체는 문서 단위 그대로 — 배율은 transform이 혼자 진다.
        width: box.width,
        height: box.height,
      }}
    >
      <textarea
        ref={ref}
        defaultValue={str(el, "text")}
        spellCheck={false}
        onInput={(event) => {
          const value = event.currentTarget.value;
          // 조합 중에도 문서에 쓴다 — 캔버스가 조합 글자를 그대로 보여 준다. 되돌려
          // 넣지만 않으면 조합은 안 끊긴다.
          const next = measureTextLayout(el, value);
          const patch: Attrs = {
            text: value,
            height: Math.max(anchorHeight.current, next.blockHeight),
          };
          if (singleLine) {
            patch.width = Math.max(
              anchorWidth.current,
              next.blockWidth + padding * 2,
            );
          }
          patch.custom = {
            ...custom,
            textFitAnchorWidth: anchorWidth.current,
            textFitAnchorHeight: anchorHeight.current,
          };
          el.set(patch);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          el.set({ text: event.currentTarget.value });
        }}
        onKeyDown={(event) => {
          // 조합 중 Esc/Enter는 IME의 것이다 — 가로채면 조합이 깨진다.
          if (composing.current) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onDone();
            return;
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onDone();
          }
        }}
        onBlur={onDone}
        style={{
          position: "absolute",
          left: growX + padding,
          top: layout.offsetY,
          width: Math.max(1, box.width - padding * 2),
          height: Math.max(layout.blockHeight, layout.lineHeight),
          margin: 0,
          padding: 0,
          border: "none",
          outline: "1px solid rgba(37, 99, 235, 0.6)",
          background: "transparent",
          resize: "none",
          overflow: "hidden",
          boxSizing: "content-box",
          color: str(el, "fill", "#000000"),
          fontSize,
          fontFamily: `"${str(el, "fontFamily", "sans-serif")}"`,
          fontWeight: cssFontWeight(el),
          fontStyle: style.includes("italic") ? "italic" : "normal",
          textDecoration: textDecoration(el) || "none",
          lineHeight: ratio,
          letterSpacing: num(el, "letterSpacing", 0) * fontSize,
          textAlign: str(el, "align", "left") as "left" | "center" | "right",
          // 한 줄 상자는 캔버스와 똑같이 접지 않는다.
          whiteSpace: singleLine ? "pre" : "pre-wrap",
          wordBreak: "normal",
        }}
      />
    </div>
  );
}
