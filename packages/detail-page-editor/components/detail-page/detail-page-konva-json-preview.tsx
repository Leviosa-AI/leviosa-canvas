"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Group,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Text,
} from "react-konva/es/ReactKonvaCore";

import { roundedRectPath } from "../../lib/detail-page-canvas/clip-rect";
import {
  normalizeCanvasJsonForKonva,
  type ParsedGradient,
  type CanvasFallbackElement,
} from "../../lib/detail-page-canvas/konva-fallback";
import { computeHighlightBands } from "../../lib/detail-page-canvas/text-highlight-bands";
import type { LeviosaCanvasDocument } from "../../types/detail-page-canvas";

/** Konva gradient/shadow/cornerRadius props derived from a fallback element. */
type KonvaDecorationProps = {
  fill?: string;
  fillLinearGradientStartPoint?: { x: number; y: number };
  fillLinearGradientEndPoint?: { x: number; y: number };
  fillLinearGradientColorStops?: Array<number | string>;
  fillRadialGradientStartPoint?: { x: number; y: number };
  fillRadialGradientStartRadius?: number;
  fillRadialGradientEndPoint?: { x: number; y: number };
  fillRadialGradientEndRadius?: number;
  fillRadialGradientColorStops?: Array<number | string>;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  shadowEnabled?: boolean;
  cornerRadius?: number;
};

/** Build Konva fill props from a parsed gradient, in the element's local box. */
function gradientFillProps(
  gradient: ParsedGradient,
  width: number,
  height: number,
): KonvaDecorationProps {
  const colorStops = gradient.stops.flatMap((stop) => [stop.offset, stop.color]);
  if (gradient.type === "linear") {
    // CSS angle: 0deg points up, increasing clockwise.
    const radians = (gradient.angle * Math.PI) / 180;
    const dx = Math.sin(radians);
    const dy = -Math.cos(radians);
    const length = Math.abs(width * dx) + Math.abs(height * dy);
    const cx = width / 2;
    const cy = height / 2;
    return {
      fillLinearGradientStartPoint: {
        x: cx - (dx * length) / 2,
        y: cy - (dy * length) / 2,
      },
      fillLinearGradientEndPoint: {
        x: cx + (dx * length) / 2,
        y: cy + (dy * length) / 2,
      },
      fillLinearGradientColorStops: colorStops,
    };
  }
  const cx = gradient.cx * width;
  const cy = gradient.cy * height;
  const endRadius = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy),
  );
  return {
    fillRadialGradientStartPoint: { x: cx, y: cy },
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndPoint: { x: cx, y: cy },
    fillRadialGradientEndRadius: endRadius,
    fillRadialGradientColorStops: colorStops,
  };
}

/** Collect gradient/shadow/cornerRadius Konva props for a scaled element. */
function decorationProps(
  element: CanvasFallbackElement,
  scale: number,
  width: number,
  height: number,
): KonvaDecorationProps {
  const props: KonvaDecorationProps = {};
  if (element.gradient) {
    Object.assign(props, gradientFillProps(element.gradient, width, height));
  }
  if (element.shadow) {
    props.shadowEnabled = true;
    props.shadowColor = element.shadow.color;
    props.shadowBlur = element.shadow.blur * scale;
    props.shadowOffsetX = element.shadow.offsetX * scale;
    props.shadowOffsetY = element.shadow.offsetY * scale;
    props.shadowOpacity = 1;
  }
  if (element.cornerRadius > 0) {
    // 999-style pills resolve to a half-min-side radius.
    props.cornerRadius = Math.min(element.cornerRadius * scale, Math.min(width, height) / 2);
  }
  return props;
}

/** Clip children to the element's owning rectangle (overflow:hidden parent). */
function ClipToRect({
  element,
  scale,
  children,
}: {
  element: CanvasFallbackElement;
  scale: number;
  children: ReactNode;
}) {
  const clip = element.clipToRect;
  if (!clip) return <>{children}</>;
  return (
    <Group
      clipFunc={(ctx) =>
        roundedRectPath(
          ctx,
          clip.x * scale,
          clip.y * scale,
          clip.width * scale,
          clip.height * scale,
          clip.radius * scale,
        )
      }
    >
      {children}
    </Group>
  );
}

type DetailPageKonvaJsonPreviewProps = {
  document: LeviosaCanvasDocument;
  slotData?: Record<string, unknown>;
};

function useRemoteImage(src: string) {
  const [loaded, setLoaded] = useState<{
    src: string;
    image: HTMLImageElement | null;
  }>({ src: "", image: null });

  useEffect(() => {
    if (!src) return;
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => setLoaded({ src, image: nextImage });
    nextImage.onerror = () => setLoaded({ src, image: null });
    nextImage.src = src;
    return () => {
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [src]);

  return loaded.src === src ? loaded.image : null;
}

function slotValue(slotData: Record<string, unknown>, element: CanvasFallbackElement) {
  if (!element.slot) return null;
  const value = slotData[element.slot];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function NativeImageElement({
  element,
  scale,
  slotData,
}: {
  element: CanvasFallbackElement;
  scale: number;
  slotData: Record<string, unknown>;
}) {
  const resolvedSrc = slotValue(slotData, element) ?? element.src;
  const image = useRemoteImage(resolvedSrc);
  const x = element.x * scale;
  const y = element.y * scale;
  const width = element.width * scale;
  const height = element.height * scale;
  const decoration = decorationProps(element, scale, width, height);

  if (image) {
    return (
      <KonvaImage
        image={image}
        x={x}
        y={y}
        width={width}
        height={height}
        opacity={element.opacity}
        rotation={element.rotation}
        cornerRadius={decoration.cornerRadius}
        shadowEnabled={decoration.shadowEnabled}
        shadowColor={decoration.shadowColor}
        shadowBlur={decoration.shadowBlur}
        shadowOffsetX={decoration.shadowOffsetX}
        shadowOffsetY={decoration.shadowOffsetY}
        shadowOpacity={decoration.shadowOpacity}
      />
    );
  }

  return (
    <>
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#f4f4f5"
        stroke="#d4d4d8"
        strokeWidth={1}
      />
      <Text
        x={x + 12}
        y={y + Math.max(12, height / 2 - 18)}
        width={Math.max(40, width - 24)}
        height={36}
        text={resolvedSrc ? "image loading failed" : "image slot empty"}
        fontSize={Math.max(10, 13 * scale)}
        fill="#71717a"
        align="center"
      />
    </>
  );
}

function NativeElement({
  element,
  scale,
  slotData,
  showSlots,
}: {
  element: CanvasFallbackElement;
  scale: number;
  slotData: Record<string, unknown>;
  showSlots: boolean;
}) {
  const x = element.x * scale;
  const y = element.y * scale;
  const width = element.width * scale;
  const height = element.height * scale;
  const slotText = element.slot ? ` ${element.slot}` : "";

  if (element.kind === "image") {
    return (
      <ClipToRect element={element} scale={scale}>
        <NativeImageElement element={element} scale={scale} slotData={slotData} />
        {showSlots && element.slot ? (
          <Rect x={x} y={y} width={width} height={height} stroke="#0f766e" strokeWidth={2} dash={[6, 5]} />
        ) : null}
      </ClipToRect>
    );
  }

  if (element.kind === "text") {
    const resolvedText = slotValue(slotData, element) ?? element.text;
    // The decomposer splits each visual line into its own element and sizes the
    // box to that line. A box only one line tall must never wrap: the frontend's
    // font metrics differ slightly from the decomposer's, so wrapping would push
    // a word onto a second line that the one-line height then clips. Let such
    // text overflow horizontally instead. Genuinely multi-line bodies (taller
    // boxes, no explicit breaks) keep wrapping to their width.
    const isSingleLine =
      element.height <= element.fontSize * element.lineHeight * 1.6;
    const pad = element.backgroundEnabled ? element.backgroundPadding * scale : 0;
    // A user marker highlight: one band per wrapped line, hugging each line's
    // glyph width (measured with the same Konva engine, then scaled). Takes
    // precedence over the native box so loose line-heights don't merge lines.
    const bands = element.highlightColor
      ? computeHighlightBands({
          text: resolvedText,
          fontSize: element.fontSize,
          fontFamily: element.fontFamily,
          fontWeight: element.fontWeight,
          boxWidth: element.width,
          lineHeightRatio: element.lineHeight,
          align: element.align,
          color: element.highlightColor,
        })
      : [];
    return (
      <ClipToRect element={element} scale={scale}>
        {bands.length > 0 && element.highlightColor ? (
          bands.map((b, i) => (
            <Rect
              key={i}
              x={x + b.x * scale}
              y={y + b.y * scale}
              width={b.width * scale}
              height={b.height * scale}
              cornerRadius={b.cornerRadius * scale}
              fill={element.highlightColor ?? undefined}
              opacity={element.opacity}
              rotation={element.rotation}
            />
          ))
        ) : element.backgroundEnabled || element.backgroundGradient ? (
          <Rect
            x={x}
            y={y}
            width={width}
            height={height}
            // A gradient highlight (e.g. a highlighter band) cannot be a solid
            // ``backgroundColor`` — paint it with the parsed CSS gradient and drop
            // the (usually transparent) solid fill so the band shows through.
            fill={element.backgroundGradient ? undefined : element.backgroundColor}
            {...(element.backgroundGradient
              ? gradientFillProps(element.backgroundGradient, width, height)
              : {})}
            cornerRadius={Math.min(
              element.backgroundCornerRadius * scale,
              Math.min(width, height) / 2,
            )}
            opacity={element.opacity}
            rotation={element.rotation}
          />
        ) : null}
        <Text
          x={x + pad}
          y={y}
          // A single-line box must not constrain width: Konva clips a no-wrap
          // line to ``width`` rather than letting it overflow, so we drop the
          // width and let the text size to its content (it is left-anchored at
          // ``x``). Multi-line bodies keep their width to wrap against.
          width={isSingleLine ? undefined : Math.max(1, width - pad * 2)}
          height={height}
          text={resolvedText}
          fill={element.fill}
          fontSize={element.fontSize * scale}
          fontFamily={element.fontFamily}
          fontStyle={element.fontWeight}
          lineHeight={element.lineHeight}
          align={element.align}
          verticalAlign={element.verticalAlign}
          opacity={element.opacity}
          rotation={element.rotation}
          wrap={isSingleLine ? "none" : "word"}
        />
        {showSlots && element.slot ? (
          <Rect x={x} y={y} width={width} height={height} stroke="#2563eb" strokeWidth={2} dash={[6, 5]} />
        ) : null}
      </ClipToRect>
    );
  }

  if (element.kind === "rect") {
    const decoration = decorationProps(element, scale, width, height);
    return (
      <ClipToRect element={element} scale={scale}>
        <Rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={element.gradient ? undefined : element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          opacity={element.opacity}
          rotation={element.rotation}
          fillLinearGradientStartPoint={decoration.fillLinearGradientStartPoint}
          fillLinearGradientEndPoint={decoration.fillLinearGradientEndPoint}
          fillLinearGradientColorStops={decoration.fillLinearGradientColorStops}
          fillRadialGradientStartPoint={decoration.fillRadialGradientStartPoint}
          fillRadialGradientStartRadius={decoration.fillRadialGradientStartRadius}
          fillRadialGradientEndPoint={decoration.fillRadialGradientEndPoint}
          fillRadialGradientEndRadius={decoration.fillRadialGradientEndRadius}
          fillRadialGradientColorStops={decoration.fillRadialGradientColorStops}
          cornerRadius={decoration.cornerRadius}
          shadowEnabled={decoration.shadowEnabled}
          shadowColor={decoration.shadowColor}
          shadowBlur={decoration.shadowBlur}
          shadowOffsetX={decoration.shadowOffsetX}
          shadowOffsetY={decoration.shadowOffsetY}
          shadowOpacity={decoration.shadowOpacity}
        />
      </ClipToRect>
    );
  }

  if (!showSlots) return null;
  return (
    <Text
      x={x}
      y={y}
      width={Math.max(100, width)}
      height={24}
      text={`unsupported${slotText}`}
      fontSize={12 * scale}
      fill="#a16207"
    />
  );
}

export function DetailPageKonvaJsonPreview({
  document,
  slotData = {},
}: DetailPageKonvaJsonPreviewProps) {
  const pages = useMemo(
    () => normalizeCanvasJsonForKonva(document.canvas_json),
    [document.canvas_json],
  );
  const [showSlots, setShowSlots] = useState(true);
  const scale = 0.48;

  return (
    <div className="h-screen overflow-auto bg-dpe-ink-100">
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-dpe-ink-200 bg-dpe-surface px-4">
        <div>
          <p className="text-sm font-dpe-semibold text-dpe-ink-950">Native Konva JSON Preview</p>
          <p className="text-xs text-dpe-ink-500">
            Canvas 없이 JSON을 직접 렌더링하는 최소 fallback
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSlots((value) => !value)}
          className="inline-flex h-8 items-center rounded-dpe-md border border-dpe-ink-200 px-3 text-xs font-dpe-semibold text-dpe-ink-700"
        >
          {showSlots ? "Hide slots" : "Show slots"}
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-6">
        {pages.map((page, pageIndex) => (
          <section key={page.id} className="overflow-hidden rounded-dpe-md border border-dpe-ink-200 bg-dpe-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-dpe-ink-200 px-3 py-2">
              <span className="text-xs font-dpe-semibold text-dpe-ink-800">
                {page.id || `page-${pageIndex + 1}`}
              </span>
              <span className="text-xs text-dpe-ink-500">
                {Math.round(page.width)} x {Math.round(page.height)}
              </span>
            </div>
            <Stage
              width={page.width * scale}
              height={page.height * scale}
              data-testid="detail-page-native-konva-stage"
            >
              <Layer>
                <Rect
                  x={0}
                  y={0}
                  width={page.width * scale}
                  height={page.height * scale}
                  fill={page.background}
                />
                {page.elements.map((element) => (
                  <NativeElement
                    key={element.id}
                    element={element}
                    scale={scale}
                    slotData={slotData}
                    showSlots={showSlots}
                  />
                ))}
              </Layer>
            </Stage>
          </section>
        ))}
      </div>
    </div>
  );
}
