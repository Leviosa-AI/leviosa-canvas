"use client";

/**
 * 요소 하나를 Konva 노드로.
 *
 * 요소마다 **자기 Group으로 감싼다.** 위치·회전·투명도·끌기·크기조절은 전부 그 Group이
 * 지고, 안쪽 그림은 (0,0) 기준으로 그린다. 그래서 배경 상자와 글자처럼 조각이 여럿인
 * 요소도 한 덩어리로 움직이고, 모든 노드에 요소 id가 박혀 히트 테스트가 경로 그대로
 * 나온다(스톡 편집기는 그룹에 id를 안 박아서 잎에서 거꾸로 되짚어야 했다).
 *
 * 트리를 접지 않는다 — 그룹은 Konva Group이 되고 자식은 그룹 로컬 좌표를 그대로 쓴다
 * (문서 모델과 같은 좌표계). 미리보기(`detail-page-konva-json-preview`)가 트리를 평평하게
 * 눌러 그리던 것과 다른 점이고, 편집기라서 다른 점이다.
 */

import "konva/lib/shapes/Ellipse";
import "konva/lib/shapes/Image";
import "konva/lib/shapes/Path";
import "konva/lib/shapes/Rect";
import "konva/lib/shapes/Text";

import type Konva from "konva";
import { useEffect, useRef, type ReactNode } from "react";
import {
  Ellipse,
  Group,
  Image as KonvaImage,
  Path,
  Rect,
  Text,
} from "react-konva/es/ReactKonvaCore";

import {
  bubblePathD,
  readBubbleParams,
} from "../paint/bubble-path";
import { roundedRectPath } from "../paint/clip-rect";
import { parseCssGradient } from "../paint/konva-fallback";
import { computeHighlightBands } from "../paint/text-highlight-bands";

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
  shadowPropsList,
  textDecoration,
  textStroke,
} from "./attrs";
import { useEditHandlers, type EditHandlers } from "./edit-context";
import { imageFrame, imageHasAlpha } from "./image-frame";
import { measureTextLayout } from "./text-layout";
import { svgSourceFor } from "./svg-source";
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

type DragEvent = {
  target: { x(): number; y(): number; position(pos: { x: number; y: number }): void };
  evt?: { altKey?: boolean };
};
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
  const frameRef = useRef<Konva.Group | null>(null);
  const filter =
    el.type === "image" ? "" : str((el.custom ?? {}) as Attrs, "filter");
  const version = useElementVersion(el);

  /*
   * 반투명한 그룹은 «한 장으로 구워서» 투명도를 먹인다 — 디자인 툴이 다 그렇게 한다.
   *
   * 안 구우면 Konva가 자식마다 따로 투명도를 먹여서, 겹친 자리가 두 번 깔려 진해진다.
   * 브라우저는 자식을 다 그린 뒤 그 «한 장»을 반투명하게 하므로 그림이 다르다.
   *
   * 자식이 하나뿐이면 겹칠 상대가 없어 결과가 같다 — 굳이 비트맵을 만들지 않는다.
   * 판이 1080×1350이라 캐시 한 장이 싸지 않다.
   */
  const flatten =
    el.type === "group" &&
    num(el, "opacity", 1) < 1 &&
    (el.children?.length ?? 0) > 1;

  useEffect(() => {
    const node = frameRef.current;
    const wants = (filter && filter !== "none") || flatten;
    if (!node || !wants) return;
    node.cache({ pixelRatio: window.devicePixelRatio, offset: 64 });
    node.getLayer()?.batchDraw();
    return () => {
      node.clearCache();
    };
    // 자식이 바뀌면 구운 그림도 낡는다 — version 이 바뀔 때 다시 굽는다.
  }, [filter, flatten, version]);
  // ⌥를 누른 채 끌면 복제 — Figma·Canva·미리캔버스가 전부 같은 손버릇이다. 누른 사실은
  // **시작할 때** 잡아 둔다. 놓는 순간에는 이미 손을 뗐을 수 있고, 끄는 도중에 트리를
  // 건드리면 리렌더가 끌고 있는 노드의 좌표를 문서 값으로 되돌려 그림이 튄다.
  const altRef = useRef(false);

  return (
    <Group
      ref={frameRef}
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
      filters={filter && filter !== "none" ? [filter] : undefined}
      onDragStart={
        draggable && edit
          ? (event: DragEvent) => {
              altRef.current = event.evt?.altKey === true;
              edit.onDragStart(el.id);
            }
          : undefined
      }
      onDragMove={
        draggable && edit
          ? (event: DragEvent) => {
              const node = event.target;
              const snapped = edit.onDragMove(el.id, {
                x: node.x(),
                y: node.y(),
              });
              // 붙일 자리가 있으면 그 자리로 노드를 옮긴다. 문서는 아직 그대로다.
              if (snapped.x !== node.x() || snapped.y !== node.y()) {
                node.position(snapped);
              }
            }
          : undefined
      }
      onDragEnd={
        draggable && edit
          ? (event: DragEvent) => {
              const alt = altRef.current;
              altRef.current = false;
              edit.onDragEnd(
                el.id,
                { x: event.target.x(), y: event.target.y() },
                alt,
              );
            }
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

/**
 * 그림자가 여러 겹일 때, «아래 겹부터» 같은 도형을 한 장씩 더 그린다.
 *
 * Konva 도형은 그림자가 하나뿐이다(캔버스 2D 의 `ctx.shadowBlur` 가 값 하나라서다).
 * CSS 는 «먼저 적은 겹이 위»에 오므로 뒤에서부터 깔고, 맨 위 겹은 요소 자신이 진다.
 * 덧그리는 장은 «맨 위 겹이 덮어 준다» — 색·모서리가 같아서 실루엣만 남는다.
 *
 * 실측: 상세페이지 템플릿의 box-shadow 188번 중 여러 겹은 17번이다.
 * 겹이 하나면 이 함수는 아무것도 안 그린다 — 노드가 늘지 않는다.
 */
function ShadowUnderlays({
  el,
  render,
}: {
  el: CanvasElement;
  render: (shadow: Attrs, key: string) => ReactNode;
}) {
  const layers = shadowPropsList(el);
  if (layers.length < 2) return null;
  // 첫 칸(맨 위 겹)은 요소 자신이 진다. 나머지를 아래에서부터.
  return (
    <>
      {layers
        .slice(1)
        .reverse()
        .map((shadow, i) => render(shadow, `shadow-${i}`))}
    </>
  );
}

function FigureBody({ el }: { el: CanvasElement }) {
  const box = boxOf(el);
  // 굵기가 0이면 **색까지 같이 떨어뜨린다.** Konva는 strokeWidth를 안 주면 1로 채우므로
  // `stroke`만 넘기면 굵기 0인 도형에 1px 선이 그려진다. 분해기 문서는 획을 안 쓰는
  // figure에도 `stroke: rgb(26,26,26) / strokeWidth: 0`을 남기기 때문에, 섹션 바탕마다
  // 검은 테두리가 생긴다. 내보내기 네 갈래(ai·svg·raster·psd)는 모두 `width > 0`으로
  // 게이트하고 있었다 — 어긋나 있던 쪽은 화면이다.
  const strokeWidth = num(el, "strokeWidth", 0);
  const stroke = strokeWidth > 0 ? str(el, "stroke") || undefined : undefined;
  const shared = {
    ...fillProps(el, box.width, box.height),
    ...shadowProps(el),
    stroke,
    strokeWidth: stroke ? strokeWidth : undefined,
  };
  const subType = str(el, "subType", "rect");

  if (subType === "ellipse" || subType === "circle") {
    // Konva의 타원은 중심 기준이다 — 상자 좌상단 기준인 우리 좌표를 옮겨 준다.
    const ellipse = (extra: Attrs, key?: string) => (
      <Ellipse
        key={key}
        {...shared}
        {...extra}
        x={box.width / 2}
        y={box.height / 2}
        radiusX={box.width / 2}
        radiusY={box.height / 2}
      />
    );
    return (
      <>
        <ShadowUnderlays el={el} render={(shadow, key) => ellipse(shadow, key)} />
        {ellipse({})}
      </>
    );
  }

  const rect = (extra: Attrs, key?: string) => (
    <Rect
      key={key}
      {...shared}
      {...extra}
      x={0}
      y={0}
      width={box.width}
      height={box.height}
      cornerRadius={cornerRadius(el)}
    />
  );
  return (
    <>
      <ShadowUnderlays el={el} render={(shadow, key) => rect(shadow, key)} />
      {rect({})}
    </>
  );
}

function ImageBody({ el, src }: { el: CanvasElement; src?: string }) {
  const box = boxOf(el);
  const image = useImage(src ?? imageSrc(el));
  const imageRef = useRef<Konva.Image | null>(null);
  const filter = str((el.custom ?? {}) as Attrs, "filter");

  useEffect(() => {
    const node = imageRef.current;
    if (!node || !image) return;
    if (filter && filter !== "none") {
      node.cache({ pixelRatio: window.devicePixelRatio, offset: 64 });
    }
    let parent = node.getParent();
    while (parent) {
      if (parent.filters()?.length) {
        parent.clearCache();
        parent.cache({ pixelRatio: window.devicePixelRatio, offset: 64 });
      }
      parent = parent.getParent();
    }
    node.getLayer()?.batchDraw();
    return () => {
      if (filter && filter !== "none") node.clearCache();
    };
  }, [filter, image]);

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

  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  const { dest, crop } = imageFrame(el, natural, box, imageHasAlpha(image));

  return (
    <KonvaImage
      ref={imageRef}
      {...shadowProps(el)}
      x={dest.x}
      y={dest.y}
      image={image}
      width={dest.width}
      height={dest.height}
      crop={crop}
      cornerRadius={cornerRadius(el)}
      filters={filter && filter !== "none" ? [filter] : undefined}
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
  const singleLine = isSingleLineBox(el);
  const layout = measureTextLayout(el, text);
  const anchorWidth = num(custom, "textFitAnchorWidth", box.width);
  const growX =
    align === "center"
      ? (anchorWidth - box.width) / 2
      : align === "right" || align === "end"
        ? anchorWidth - box.width
        : 0;
  const textWidth = Math.max(1, box.width - padding * 2);
  const textX = singleLine
    ? growX + padding +
      (align === "center"
        ? (textWidth - layout.blockWidth) / 2
        : align === "right" || align === "end"
          ? textWidth - layout.blockWidth
          : 0)
    : padding;

  /*
   * 상자 높이를 Konva에 주지 않는다. 주면 **넘치는 줄을 조용히 버린다**
   * (`Text._setTextData`의 `fixedHeight` 분기). 디컴포저가 잰 상자는 실제 글꼴보다
   * 몇 px 짧을 때가 있어서, 헤아림 1쪽의 "100% 환불해 드립니다."가 그렇게 통째로
   * 사라졌다 — 넘칠지언정 글자를 버리지는 않는 쪽이 맞다(문서를 만든 렌더러도 넘긴다).
   *
   * 대신 세로 정렬은 우리가 계산해서 앉힌다. 맨 위 정렬이면 잴 것도 없다.
   */
  const verticalAlign = str(el, "verticalAlign", "top");
  const offsetY =
    verticalAlign === "top" ? 0 : layout.offsetY;

  return (
    <ClipTo el={el}>
      {bands.length > 0 ? (
        bands.map((band, i) => (
          <Rect
            key={i}
            x={band.x + growX}
            y={band.y}
            width={band.width}
            height={band.height}
            cornerRadius={band.cornerRadius}
            fill={highlight}
          />
        ))
      ) : backgroundEnabled || backgroundGradient ? (
        <Rect
          x={growX}
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
      <>
      <ShadowUnderlays
        el={el}
        render={(shadow, key) => (
          <Text
            key={key}
            x={textX}
            y={offsetY}
            width={singleLine ? undefined : textWidth}
            text={text}
            fontSize={fontSize}
            fontFamily={fontFamily}
            fontStyle={konvaFontStyle(el)}
            align={align}
            lineHeight={ratio}
            letterSpacing={num(el, "letterSpacing", 0) * fontSize}
            fill={str(el, "fill", "#000000")}
            wrap={isSingleLineBox(el) ? "none" : "word"}
            {...shadow}
          />
        )}
      />
      <Text
        x={textX}
        y={offsetY}
        width={singleLine ? undefined : textWidth}
        text={text}
        fontSize={fontSize}
        fontFamily={fontFamily}
        fontStyle={konvaFontStyle(el)}
        textDecoration={textDecoration(el)}
        fill={str(el, "fill", "#000000")}
        align={align}
        lineHeight={ratio}
        // 스톡 편집기의 letterSpacing은 em 단위다(Konva는 px). 문서가 그 세계에서
        // 왔으니 폰트 크기를 곱해 되돌린다.
        letterSpacing={num(el, "letterSpacing", 0) * fontSize}
        // 디컴포저는 보이는 줄마다 요소를 하나씩 뽑고 상자를 그 줄에 맞춘다. 한 줄
        // 높이 상자가 줄바꿈되면 두 번째 줄이 상자 밖으로 밀려 잘린다 — 폰트 메트릭이
        // 디컴포저와 미세하게 다를 수 있으므로, 한 줄 상자는 넘치게 두고 접지 않는다.
        wrap={singleLine ? "none" : "word"}
        {...shadowProps(el)}
        {...textStroke(el)}
      />
      </>
      )}
    </ClipTo>
  );
}

/**
 * 벡터 장식.
 *
 * 말풍선은 **네이티브 path로 그린다.** 마크업을 이미지로 구워 붙이면 확대할 때 뭉개지고
 * 꼬리를 끌 때마다 data URI를 다시 만들어 이미지가 깜빡인다. 몸통+꼬리가 한 path라
 * (`bubble-path.ts`) 그대로 Konva에 넘기면 된다 — 우리가 렌더러를 들고 있어서 되는 일이다.
 *
 * 그 외 SVG는 색 치환을 먹인 마크업을 이미지로 그린다.
 */
function SvgBody({ el }: { el: CanvasElement }) {
  const box = boxOf(el);
  const bubble = readBubbleParams(el.custom);

  if (bubble) {
    // 마크업의 viewBox는 (-pad,-pad)에서 시작한다 — 요소 원점으로 옮기고 상자에 맞춘다.
    const vbWidth = bubble.w + bubble.pad * 2;
    const vbHeight = bubble.h + bubble.pad * 2;
    const sx = vbWidth > 0 ? box.width / vbWidth : 1;
    const sy = vbHeight > 0 ? box.height / vbHeight : 1;
    return (
      <Group x={bubble.pad * sx} y={bubble.pad * sy} scaleX={sx} scaleY={sy}>
        <Path
          data={bubblePathD(bubble)}
          fill={bubble.fill}
          stroke={bubble.stroke || undefined}
          strokeWidth={bubble.stroke ? (bubble.strokeWidth ?? 2) : undefined}
          lineJoin="round"
          {...shadowProps(el)}
        />
      </Group>
    );
  }

  return <ImageBody el={el} src={svgSourceFor(el) ?? undefined} />;
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
    case "svg":
      return <SvgBody el={el} />;
    case "image":
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
