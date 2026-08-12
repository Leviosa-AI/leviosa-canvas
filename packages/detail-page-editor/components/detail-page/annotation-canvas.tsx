"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  Eraser,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
} from "lucide-react";

/**
 * 그림으로 가리키는 편집 — 이미지·화면 위에 덧그리는 주석 캔버스.
 *
 * 그림은 **어디를**(WHERE), 글은 **무엇을**(WHAT) 이다. 둘 중 하나만으로는 성립하지
 * 않는 요청이 많다("여기만 비워 주세요"). 그래서 이 캔버스가 만드는 것은 그림이 아니라
 * **지시의 절반**이고, 나머지 절반은 프롬프트가 채운다.
 *
 * 좌표는 **원본 자연 픽셀**로 산다. 화면 크기로 저장하면 창을 줄였다 키우는 것만으로
 * 마킹이 어긋난다 — 유저가 가리킨 자리가 곧 계약이라 어긋나면 편집 자체가 틀린다.
 *
 * ``flatten()`` 은 원본 위에 마킹을 합성한 PNG data URI 를 낸다. 그린 것이 없으면
 * ``null`` — 백엔드는 마킹본만으로 원본을 대체하지 않고, 원본이 없는 마킹은 버린다.
 *
 * ⚠️ ``imageUrl`` 은 **오염되지 않는 출처**여야 한다(data URI 또는 동일 출처). 교차
 * 출처 이미지를 캔버스에 그리면 ``toDataURL`` 이 SecurityError 로 터진다. 호출부가
 * 먼저 data URI 로 바꿔서 넘긴다.
 */

const COLORS = ["#ff2d2d", "#ffffff", "#111111", "#2563eb"] as const;

export type PenAnnotation = {
  id: string;
  type: "pen";
  points: [number, number][];
  color: string;
};
type RectAnnotation = {
  id: string;
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
};
type ArrowAnnotation = {
  id: string;
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
};
type TextAnnotation = {
  id: string;
  type: "text";
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
};
export type Annotation =
  | PenAnnotation
  | RectAnnotation
  | ArrowAnnotation
  | TextAnnotation;

type Tool = "select" | "pen" | "eraser" | "rect" | "arrow" | "text";

type Gesture =
  | { kind: "draw"; start: { x: number; y: number } }
  | {
      kind: "move";
      id: string;
      start: { x: number; y: number };
      snapshot: Annotation[];
      moved: boolean;
    }
  | { kind: "erase"; snapshot: Annotation[]; removed: boolean };

export interface AnnotationCanvasHandle {
  /** 원본+마킹 합성 PNG data URI. 그린 것이 없으면 null. */
  flatten(): Promise<string | null>;
  hasAnnotations(): boolean;
}

export interface AnnotationCanvasProps {
  /** 밑그림. data URI 또는 동일 출처 URL(교차 출처면 합성이 SecurityError). */
  imageUrl: string;
  /** 합성 결과의 긴 변 상한(px). 모델 입력 비용과 정밀도의 절충. */
  maxEdge?: number;
  /** 그린 것이 생기거나 사라질 때(제출 버튼 활성화용). */
  onChange?: (hasAnnotations: boolean) => void;
  labels?: Partial<Record<Tool | "color" | "undo" | "redo" | "note", string>>;
}

let seq = 0;
function uid(): string {
  seq += 1;
  return `ann-${seq}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 동일 출처 프록시를 타는 경우에도 캔버스 오염을 막으려면 명시해야 한다.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    img.src = src;
  });
}

/** 주석 하나를 감싸는 사각형(선택 표시·히트 판정용). */
export function annotationBox(a: Annotation): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  switch (a.type) {
    case "rect":
      return { x: a.x, y: a.y, w: a.w, h: a.h };
    case "text":
      // 폰트 실측 없이 어림잡는다 — 선택 테두리 크기일 뿐 합성에는 안 쓰인다.
      return {
        x: a.x,
        y: a.y - a.size,
        w: a.size * 0.6 * a.text.length,
        h: a.size * 1.2,
      };
    case "arrow": {
      const x = Math.min(a.x1, a.x2);
      const y = Math.min(a.y1, a.y2);
      return { x, y, w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
    }
    case "pen": {
      const xs = a.points.map((p) => p[0]);
      const ys = a.points.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
  }
}

function pointSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function hitAnnotation(
  a: Annotation,
  p: { x: number; y: number },
  threshold: number,
): boolean {
  if (a.type === "pen") {
    for (let i = 0; i < a.points.length - 1; i += 1) {
      const [x1, y1] = a.points[i];
      const [x2, y2] = a.points[i + 1];
      if (pointSegmentDistance(p.x, p.y, x1, y1, x2, y2) < threshold)
        return true;
    }
    return (
      a.points.length === 1 &&
      Math.hypot(p.x - a.points[0][0], p.y - a.points[0][1]) < threshold
    );
  }
  if (a.type === "arrow")
    return pointSegmentDistance(p.x, p.y, a.x1, a.y1, a.x2, a.y2) < threshold;
  const b = annotationBox(a);
  return (
    p.x >= b.x - threshold &&
    p.x <= b.x + b.w + threshold &&
    p.y >= b.y - threshold &&
    p.y <= b.y + b.h + threshold
  );
}

function moveAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case "pen":
      return {
        ...a,
        points: a.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
      };
    case "rect":
    case "text":
      return { ...a, x: a.x + dx, y: a.y + dy };
    case "arrow":
      return {
        ...a,
        x1: a.x1 + dx,
        y1: a.y1 + dy,
        x2: a.x2 + dx,
        y2: a.y2 + dy,
      };
  }
}

/**
 * 펜 획을 지우개 지점 기준으로 자른다. 반경 안의 점은 버리고, 살아남은 구간은 각각
 * 별개의 획이 된다(첫 구간이 원래 id 를 물려받는다).
 *
 * 획을 통째로 지우지 않는 이유: 실제 지우개는 닿은 데만 지운다. 긴 획 하나를 그은 뒤
 * 끝만 다듬으려던 유저가 전부 잃으면 다시 그리게 된다.
 */
export function erasePen(
  a: PenAnnotation,
  p: { x: number; y: number },
  radius: number,
): PenAnnotation[] {
  const runs: [number, number][][] = [];
  let current: [number, number][] = [];
  for (const point of a.points) {
    if (Math.hypot(point[0] - p.x, point[1] - p.y) > radius) {
      current.push(point);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs
    .filter((points) => points.length > 1)
    .map((points, i) =>
      i === 0 ? { ...a, points } : { ...a, id: uid(), points },
    );
}

export const AnnotationCanvas = forwardRef<
  AnnotationCanvasHandle,
  AnnotationCanvasProps
>(function AnnotationCanvas(
  { imageUrl, maxEdge = 2048, onChange, labels },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const editorOpenAtDownRef = useRef(false);

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [textEditor, setTextEditor] = useState<{
    x: number;
    y: number;
    value: string;
  } | null>(null);
  const [eraserCursor, setEraserCursor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [history, setHistory] = useState<{
    past: Annotation[][];
    present: Annotation[];
    future: Annotation[][];
  }>({ past: [], present: [], future: [] });

  const annotations = history.present;

  useEffect(() => {
    onChange?.(annotations.length > 0);
  }, [annotations.length, onChange]);

  const commit = useCallback((next: Annotation[]) => {
    setHistory((h) => ({ past: [...h.past, h.present], present: next, future: [] }));
  }, []);
  const replace = useCallback((next: Annotation[]) => {
    setHistory((h) => ({ ...h, present: next }));
  }, []);
  const pushSnapshot = useCallback((snapshot: Annotation[]) => {
    setHistory((h) => ({ past: [...h.past, snapshot], present: h.present, future: [] }));
  }, []);
  const undo = useCallback(() => {
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [...h.future, h.present],
          }
        : h,
    );
    setSelectedId(null);
  }, []);
  const redo = useCallback(() => {
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.present],
            present: h.future[h.future.length - 1],
            future: h.future.slice(0, -1),
          }
        : h,
    );
    setSelectedId(null);
  }, []);

  const layout = useCallback(() => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img || !img.naturalWidth) return;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    setBox({ left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h });
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(layout);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [layout]);

  // Delete / undo / redo — 입력 중에는 무시한다(프롬프트 textarea 가 바로 옆에 있다).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        commit(annotations.filter((a) => a.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [annotations, selectedId, commit, undo, redo]);

  // 굵기·글자 크기는 원본 픽셀 기준으로 잡는다 — 화면 배율이 달라도 결과가 같다.
  const strokeWidth = natural ? Math.max(2, natural.w * 0.005) : 2;
  const fontSize = natural ? Math.max(14, natural.w * 0.035) : 24;

  function toImage(e: { clientX: number; clientY: number }): {
    x: number;
    y: number;
  } {
    const svg = svgRef.current;
    if (!svg || !natural) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * natural.w;
    const y = ((e.clientY - r.top) / r.height) * natural.h;
    return {
      x: Math.max(0, Math.min(natural.w, x)),
      y: Math.max(0, Math.min(natural.h, y)),
    };
  }

  function screenThreshold(): number {
    const svg = svgRef.current;
    if (!svg || !natural) return 12;
    const width = svg.getBoundingClientRect().width || 1;
    return (12 * natural.w) / width;
  }

  function eraseRadius(): number {
    if (!natural || !box || !box.width) return 20;
    return (20 * natural.w) / box.width;
  }

  function hitTest(p: { x: number; y: number }): Annotation | null {
    const threshold = screenThreshold();
    for (let i = annotations.length - 1; i >= 0; i -= 1) {
      if (hitAnnotation(annotations[i], p, threshold)) return annotations[i];
    }
    return null;
  }

  function eraseAt(
    p: { x: number; y: number },
    gesture: Extract<Gesture, { kind: "erase" }>,
  ) {
    if (!natural) return;
    const radius = eraseRadius();
    let changed = false;
    const next: Annotation[] = [];
    for (const a of annotations) {
      if (a.type === "pen") {
        if (hitAnnotation(a, p, radius)) {
          const pieces = erasePen(a, p, radius);
          changed =
            changed ||
            pieces.length !== 1 ||
            pieces[0].points.length !== a.points.length;
          next.push(...pieces);
        } else {
          next.push(a);
        }
      } else if (hitAnnotation(a, p, screenThreshold())) {
        // 도형·화살표·글자는 통째로 지운다 — 테두리 일부만 지우려면 path 로 바꿔야 한다.
        changed = true;
      } else {
        next.push(a);
      }
    }
    if (changed) {
      gesture.removed = true;
      replace(next);
    }
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    editorOpenAtDownRef.current = Boolean(textEditor);
    if (!natural || textEditor) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e);
    if (tool === "select") {
      const hit = hitTest(p);
      setSelectedId(hit?.id ?? null);
      if (hit) {
        gestureRef.current = {
          kind: "move",
          id: hit.id,
          start: p,
          snapshot: annotations,
          moved: false,
        };
      }
    } else if (tool === "eraser") {
      const gesture: Gesture = { kind: "erase", snapshot: annotations, removed: false };
      gestureRef.current = gesture;
      eraseAt(p, gesture);
    } else if (tool === "pen") {
      setDraft({ id: uid(), type: "pen", points: [[p.x, p.y]], color });
      gestureRef.current = { kind: "draw", start: p };
    } else if (tool === "rect") {
      setDraft({ id: uid(), type: "rect", x: p.x, y: p.y, w: 0, h: 0, color });
      gestureRef.current = { kind: "draw", start: p };
    } else if (tool === "arrow") {
      setDraft({
        id: uid(),
        type: "arrow",
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
        color,
      });
      gestureRef.current = { kind: "draw", start: p };
    }
  }

  // 글자 입력칸은 pointerdown 이 아니라 click 에서 연다. 클릭 도중에 mount 된 input 은
  // autoFocus 직후 같은 클릭의 마무리로 blur 돼 곧바로 닫힌다.
  function onCanvasClick(e: React.MouseEvent<SVGSVGElement>) {
    if (tool !== "text" || !natural || textEditor || editorOpenAtDownRef.current)
      return;
    const p = toImage(e);
    setTextEditor({ x: p.x, y: p.y, value: "" });
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (tool === "eraser" && natural) setEraserCursor(toImage(e));
    const gesture = gestureRef.current;
    if (!gesture || !natural) return;
    const p = toImage(e);
    if (gesture.kind === "draw" && draft) {
      if (draft.type === "pen") {
        setDraft({ ...draft, points: [...draft.points, [p.x, p.y]] });
      } else if (draft.type === "rect") {
        setDraft({
          ...draft,
          x: Math.min(gesture.start.x, p.x),
          y: Math.min(gesture.start.y, p.y),
          w: Math.abs(p.x - gesture.start.x),
          h: Math.abs(p.y - gesture.start.y),
        });
      } else if (draft.type === "arrow") {
        setDraft({ ...draft, x2: p.x, y2: p.y });
      }
    } else if (gesture.kind === "move") {
      const dx = p.x - gesture.start.x;
      const dy = p.y - gesture.start.y;
      gesture.moved = gesture.moved || Math.hypot(dx, dy) > 1;
      replace(
        gesture.snapshot.map((a) =>
          a.id === gesture.id ? moveAnnotation(a, dx, dy) : a,
        ),
      );
    } else if (gesture.kind === "erase") {
      eraseAt(p, gesture);
    }
  }

  function onPointerUp() {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture) return;
    if (gesture.kind === "draw" && draft) {
      // 클릭만 하고 만 자국은 버린다 — 점 하나가 "여기"로 읽히면 편집이 엉뚱해진다.
      const keep =
        (draft.type === "pen" && draft.points.length > 1) ||
        (draft.type === "rect" && (draft.w > 4 || draft.h > 4)) ||
        (draft.type === "arrow" &&
          Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 6);
      if (keep) commit([...annotations, draft]);
      setDraft(null);
    } else if (gesture.kind === "move" && gesture.moved) {
      pushSnapshot(gesture.snapshot);
    } else if (gesture.kind === "erase" && gesture.removed) {
      pushSnapshot(gesture.snapshot);
    }
  }

  function commitText() {
    if (textEditor && textEditor.value.trim()) {
      commit([
        ...annotations,
        {
          id: uid(),
          type: "text",
          x: textEditor.x,
          y: textEditor.y,
          text: textEditor.value.trim(),
          size: fontSize,
          color,
        },
      ]);
    }
    setTextEditor(null);
  }

  useImperativeHandle(
    ref,
    () => ({
      hasAnnotations: () => annotations.length > 0,
      flatten: async () => {
        const svg = svgRef.current;
        if (!svg || !natural || annotations.length === 0) return null;
        const base = await loadImage(imageUrl);
        const scale = Math.min(1, maxEdge / Math.max(natural.w, natural.h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(natural.w * scale);
        canvas.height = Math.round(natural.h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
        // UI 표식(선택 테두리·지우개 원)은 지시가 아니다. 남기면 모델이 그것까지 읽는다.
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.querySelectorAll("[data-ui]").forEach((node) => node.remove());
        clone.removeAttribute("style");
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", String(natural.w));
        clone.setAttribute("height", String(natural.h));
        const markup = new XMLSerializer().serializeToString(clone);
        const overlay = await loadImage(
          `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`,
        );
        ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      },
    }),
    [annotations, natural, imageUrl, maxEdge],
  );

  function renderAnnotation(a: Annotation) {
    switch (a.type) {
      case "pen":
        return (
          <polyline
            key={a.id}
            points={a.points.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={a.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case "rect":
        return (
          <rect
            key={a.id}
            x={a.x}
            y={a.y}
            width={a.w}
            height={a.h}
            fill="none"
            stroke={a.color}
            strokeWidth={strokeWidth}
          />
        );
      case "arrow":
        return (
          <line
            key={a.id}
            x1={a.x1}
            y1={a.y1}
            x2={a.x2}
            y2={a.y2}
            stroke={a.color}
            strokeWidth={strokeWidth}
            markerEnd={`url(#dp-arrow-${a.color.slice(1)})`}
          />
        );
      case "text":
        return (
          <text
            key={a.id}
            x={a.x}
            y={a.y}
            fill={a.color}
            fontSize={a.size}
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight={700}
          >
            {a.text}
          </text>
        );
    }
  }

  const selected = annotations.find((a) => a.id === selectedId) ?? null;
  const selectedBox = selected ? annotationBox(selected) : null;

  const TOOLS: [Tool, string, React.ReactNode][] = [
    ["pen", labels?.pen ?? "그리기", <Pencil key="p" size={16} />],
    ["rect", labels?.rect ?? "박스", <Square key="r" size={16} />],
    ["arrow", labels?.arrow ?? "화살표", <ArrowUpRight key="a" size={16} />],
    ["text", labels?.text ?? "메모", <Type key="t" size={16} />],
    ["eraser", labels?.eraser ?? "지우개", <Eraser key="e" size={16} />],
    ["select", labels?.select ?? "이동", <MousePointer2 key="s" size={16} />],
  ];

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-neutral-100"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        onLoad={layout}
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-contain"
      />
      {natural && box ? (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${natural.w} ${natural.h}`}
          onPointerDown={onPointerDown}
          onClick={onCanvasClick}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setEraserCursor(null)}
          style={{
            position: "absolute",
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            touchAction: "none",
            cursor:
              tool === "select" ? "grab" : tool === "eraser" ? "none" : "crosshair",
          }}
        >
          <defs>
            {COLORS.map((c) => (
              <marker
                key={c}
                id={`dp-arrow-${c.slice(1)}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {annotations.map(renderAnnotation)}
          {draft ? renderAnnotation(draft) : null}
          {tool === "eraser" && eraserCursor ? (
            <circle
              data-ui="1"
              cx={eraserCursor.x}
              cy={eraserCursor.y}
              r={eraseRadius()}
              fill="rgba(255,255,255,0.3)"
              stroke="#111111"
              strokeWidth={Math.max(1, strokeWidth / 4)}
              pointerEvents="none"
            />
          ) : null}
          {selectedBox ? (
            <rect
              data-ui="1"
              x={selectedBox.x - strokeWidth}
              y={selectedBox.y - strokeWidth}
              width={selectedBox.w + strokeWidth * 2}
              height={selectedBox.h + strokeWidth * 2}
              fill="none"
              stroke="#111111"
              strokeWidth={strokeWidth / 2}
              strokeDasharray={`${strokeWidth * 2} ${strokeWidth * 1.5}`}
              pointerEvents="none"
            />
          ) : null}
          {textEditor ? (
            <foreignObject
              data-ui="1"
              x={textEditor.x}
              y={Math.max(0, textEditor.y - fontSize)}
              width={Math.max(fontSize * 4, natural.w - textEditor.x - strokeWidth)}
              height={fontSize * 1.6}
            >
              <input
                autoFocus
                value={textEditor.value}
                placeholder={labels?.note ?? "메모 입력"}
                onChange={(e) =>
                  setTextEditor({ ...textEditor, value: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitText();
                  if (e.key === "Escape") setTextEditor(null);
                }}
                onBlur={commitText}
                style={{
                  width: "100%",
                  fontSize,
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 700,
                  color,
                  background: "transparent",
                  border: `1px dashed ${color}`,
                  outline: "none",
                  padding: 0,
                }}
              />
            </foreignObject>
          ) : null}
        </svg>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-neutral-200 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur-sm">
          {TOOLS.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
              className={[
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                tool === id
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
              ].join(" ")}
            >
              {icon}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-neutral-200" />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`${labels?.color ?? "색상"} ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className="flex h-8 w-6 items-center justify-center"
            >
              <span
                className="h-4 w-4 rounded-full border"
                style={{
                  background: c,
                  borderColor: color === c ? "#111111" : "#d4d4d4",
                  borderWidth: color === c ? 2 : 1,
                }}
              />
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-neutral-200" />
          <button
            type="button"
            title={labels?.undo ?? "실행 취소"}
            aria-label={labels?.undo ?? "실행 취소"}
            disabled={!history.past.length}
            onClick={undo}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            title={labels?.redo ?? "다시 실행"}
            aria-label={labels?.redo ?? "다시 실행"}
            disabled={!history.future.length}
            onClick={redo}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
});
AnnotationCanvas.displayName = "AnnotationCanvas";
