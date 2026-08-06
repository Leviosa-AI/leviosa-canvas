"use client";

/**
 * 요소 하나를 Konva 노드로.
 *
 * 요소마다 **자기 Group으로 감싼다.** 위치·회전·투명도·끌기·크기조절은 전부 그 Group이
 * 지고, 안쪽 그림은 (0,0) 기준으로 그린다. 그래서 배경 상자와 글자처럼 조각이 여럿인
 * 요소도 한 덩어리로 움직이고, 모든 노드에 요소 id가 박혀 히트 테스트가 경로 그대로
 * 나온다(Polotno는 그룹에 id를 안 박아서 잎에서 거꾸로 되짚어야 했다).
 *
 * 트리를 접지 않는다 — 그룹은 Konva Group이 되고 자식은 그룹 로컬 좌표를 그대로 쓴다
 * (문서 모델과 같은 좌표계). 미리보기(`detail-page-konva-json-preview`)가 트리를 평평하게
 * 눌러 그리던 것과 다른 점이고, 편집기라서 다른 점이다.
 */

import "konva/lib/shapes/Ellipse";
import "konva/lib/shapes/Image";
import "konva/lib/shapes/Rect";
import "konva/lib/shapes/Text";

import type { ReactNode } from "react";
import {
  Ellipse,
  Group,
  Image as KonvaImage,
  Rect,
  Text,
} from "react-konva/es/ReactKonvaCore";

import { roundedRectPath } from "@/lib/detail-page-polotno/clip-rect";
import { parseCssGradient } from "@/lib/detail-page-polotno/konva-fallback";
import { computeHighlightBands } from "@/lib/detail-page-polotno/text-highlight-bands";

import { CanvasElement } from "../store";
import { num, str, type Attrs } from "../types";
import { useElementVersion } from "../use-canvas";
import {
  boxOf,
  clipBox,
  cornerRadius,
  displayText,
  fillProps,
  gradientProps,
  imageSrc,
  isSingleLineBox,
  konvaFontStyle,
  lineHeightRatio,
  shadowProps,
  textDecoration,
  textStroke,
} from "./attrs";
import { useEditHandlers, type EditHandlers } from "./edit-context";
import { useImage } from "./use-image";

/**
 * 지금 이 요소를 직접 끌 수 있는가.
 *
 * 그룹 안쪽을 들여다보고 있지 않으면 자식은 못 끈다 — 그룹이 통째로 움직여야 한다.
 * 잠긴 요소도 못 끈다.
 */
function isDraggable(el: CanvasElement, edit: EditHandlers | null): boolean {
  if (!edit?.interactive || el.locked) return false;
  const parent = el.parent;
  if (!(parent instanceof CanvasElement)) return true; // 페이지 직속
  return parent.id === edit.scopeId;
}

type DragEvent = { target: { x(): number; y(): number } };
type TransformEvent = {
  target: {
    x(): number;
    y(): number;
    width(): number;
    height(): number;
    rotation(): number;
    scaleX(): number;
    scaleY(): number;
    scale(value: { x: number; y: number }): void;
  };
};

/** 요소를 감싸는 Group — 위치·회전·투명도와 편집 이벤트를 전부 여기서 진다. */
function ElementFrame({
  el,
  edit,
  children,
}: {
  el: CanvasElement;
  edit: EditHandlers | null;
  children: ReactNode;
}) {
  const box = boxOf(el);
  const draggable = isDraggable(el, edit);

  return (
    <Group
      id={el.id}
      name="lc-element"
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      rotation={num(el, "rotation", 0)}
      opacity={num(el, "opacity", 1)}
      listening={edit?.interactive ?? false}
      draggable={draggable}
      onDragEnd={
        draggable && edit
          ? (event: DragEvent) =>
              edit.onDragEnd(el.id, {
                x: event.target.x(),
                y: event.target.y(),
              })
          : undefined
      }
      onTransformEnd={
        edit?.interactive
          ? (event: TransformEvent) => {
              const node = event.target;
              const result = {
                x: node.x(),
                y: node.y(),
                width: node.width(),
                height: node.height(),
                rotation: node.rotation(),
                scaleX: node.scaleX(),
                scaleY: node.scaleY(),
              };
              // scale은 폭·높이로 흡수하고 노드에서는 지운다 — 안 지우면 다음
              // 조절에 그 위에 또 곱해진다.
              node.scale({ x: 1, y: 1 });
              edit.onTransformEnd(el.id, result);
            }
          : undefined
      }
    >
      {children}
    </Group>
  );
}

/** `custom.clipToRect`가 있으면 그 사각형으로 자른다(부모의 overflow:hidden). */
function ClipTo({ el, children }: { el: Attrs; children: ReactNode }) {
  const clip = clipBox(el);
  if (!clip) return <>{children}</>;
  // 요소 로컬 좌표계 — 잘라낼 사각형도 요소 원점 기준으로 옮겨 온다.
  const x = clip.x - num(el, "x", 0);
  const y = clip.y - num(el, "y", 0);
  return (
    <Group
      clipFunc={(ctx) => roundedRectPath(ctx, x, y, clip.width, clip.height, clip.radius)}
    >
      {children}
    </Group>
  );
}

function FigureBody({ el }: { el: CanvasElement }) {
  const box = boxOf(el);
  const shared = {
    ...fillProps(el, box.width, box.height),
    ...shadowProps(el),
    stroke: str(el, "stroke") || undefined,
    strokeWidth: num(el, "strokeWidth", 0) || undefined,
  };
  const subType = str(el, "subType", "rect");

  if (subType === "ellipse" || subType === "circle") {
    // Konva의 타원은 중심 기준이다 — 상자 좌상단 기준인 우리 좌표를 옮겨 준다.
    return (
      <Ellipse
        {...shared}
        x={box.width / 2}
        y={box.height / 2}
        radiusX={box.width / 2}
        radiusY={box.height / 2}
      />
    );
  }

  return (
    <Rect
      {...shared}
      x={0}
      y={0}
      width={box.width}
      height={box.height}
      cornerRadius={cornerRadius(el)}
    />
  );
}

function ImageBody({ el }: { el: CanvasElement }) {
  const box = boxOf(el);
  const image = useImage(imageSrc(el));

  if (!image) {
    // 빈 슬롯 자리표시. 투명하게 두면 "깨진 것"으로 읽힌다.
    return (
      <Rect
        x={0}
        y={0}
        width={box.width}
        height={box.height}
        fill="#f4f4f5"
        stroke="#d4d4d8"
        strokeWidth={1}
        dash={[6, 5]}
        cornerRadius={cornerRadius(el)}
      />
    );
  }

  return (
    <KonvaImage
      {...shadowProps(el)}
      x={0}
      y={0}
      image={image}
      width={box.width}
      height={box.height}
      cornerRadius={cornerRadius(el)}
    />
  );
}

function TextBody({ el, editing }: { el: CanvasElement; editing: boolean }) {
  const box = boxOf(el);
  const fontSize = num(el, "fontSize", 14);
  const ratio = lineHeightRatio(el.lineHeight, fontSize);
  const text = displayText(el);
  const align = str(el, "align", "left");
  const fontFamily = str(el, "fontFamily", "sans-serif");
  const custom = (el.custom ?? {}) as Attrs;
  const highlight = str(custom, "highlightColor");
  const backgroundGradient = parseCssGradient(custom.backgroundGradient);

  // 사람이 칠한 형광펜: 줄마다 그 줄 글자 폭에 딱 맞는 띠 하나. 통짜 박스로 그리면
  // 줄 간격이 넉넉할 때 줄 사이가 메워져 덩어리로 보인다.
  const bands = highlight
    ? computeHighlightBands({
        text,
        fontSize,
        fontFamily,
        fontWeight: str(el, "fontWeight", "normal"),
        boxWidth: box.width,
        lineHeightRatio: ratio,
        align,
        color: highlight,
      })
    : [];

  const backgroundEnabled = el.backgroundEnabled === true;
  const padding = backgroundEnabled ? num(el, "backgroundPadding", 0) : 0;

  return (
    <ClipTo el={el}>
      {bands.length > 0 ? (
        bands.map((band, i) => (
          <Rect
            key={i}
            x={band.x}
            y={band.y}
            width={band.width}
            height={band.height}
            cornerRadius={band.cornerRadius}
            fill={highlight}
          />
        ))
      ) : backgroundEnabled || backgroundGradient ? (
        <Rect
          x={0}
          y={0}
          width={box.width}
          height={box.height}
          fill={backgroundGradient ? undefined : str(el, "backgroundColor")}
          {...(backgroundGradient
            ? gradientProps(backgroundGradient, box.width, box.height)
            : {})}
          cornerRadius={Math.min(
            num(el, "backgroundCornerRadius", 0),
            Math.min(box.width, box.height) / 2,
          )}
        />
      ) : null}
      {/* 편집 중에는 글자를 두 번 그리지 않는다 — textarea가 같은 자리에 있다. */}
      {editing ? null : (
      <Text
        x={padding}
        y={0}
        width={Math.max(1, box.width - padding * 2)}
        height={box.height}
        text={text}
        fontSize={fontSize}
        fontFamily={fontFamily}
        fontStyle={konvaFontStyle(el)}
        textDecoration={textDecoration(el)}
        fill={str(el, "fill", "#000000")}
        align={align}
        verticalAlign={str(el, "verticalAlign", "top")}
        lineHeight={ratio}
        // Polotno의 letterSpacing은 em 단위다(Konva는 px). 문서가 그 세계에서
        // 왔으니 폰트 크기를 곱해 되돌린다.
        letterSpacing={num(el, "letterSpacing", 0) * fontSize}
        // 디컴포저는 보이는 줄마다 요소를 하나씩 뽑고 상자를 그 줄에 맞춘다. 한 줄
        // 높이 상자가 줄바꿈되면 두 번째 줄이 상자 밖으로 밀려 잘린다 — 폰트 메트릭이
        // 디컴포저와 미세하게 다를 수 있으므로, 한 줄 상자는 넘치게 두고 접지 않는다.
        wrap={isSingleLineBox(el) ? "none" : "word"}
        {...shadowProps(el)}
        {...textStroke(el)}
      />
      )}
    </ClipTo>
  );
}

function GroupBody({ el }: { el: CanvasElement }) {
  return (
    <>
      {el.children.map((child) => (
        <ElementView key={child.id} el={child} />
      ))}
    </>
  );
}

function bodyFor(el: CanvasElement, editing: boolean): ReactNode {
  switch (el.type) {
    case "group":
      return <GroupBody el={el} />;
    case "text":
      return <TextBody el={el} editing={editing} />;
    case "image":
    case "svg":
      return <ImageBody el={el} />;
    case "figure":
      return <FigureBody el={el} />;
    default:
      return null;
  }
}

export function ElementView({ el }: { el: CanvasElement }) {
  // 이 숫자가 그대로면 React가 리렌더를 건너뛴다(그룹은 자식 목록 변경도 여기 온다).
  useElementVersion(el);
  const edit = useEditHandlers();
  if (el.visible === false) return null;

  const body = bodyFor(el, edit?.editingId === el.id);
  if (body === null) return null;

  return (
    <ElementFrame el={el} edit={edit}>
      {body}
    </ElementFrame>
  );
}
