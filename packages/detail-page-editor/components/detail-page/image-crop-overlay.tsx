"use client";

/**
 * 사진 자르기.
 *
 * 캔버스 위에 얹히는 층이다. 켜지면 **원본 전체**를 지금 그려지는 자리에 그대로 겹쳐
 * 놓고, 남길 사각형만 밝게 두고 나머지를 가라앉힌다 — 잘려 나가는 바깥이 보여야 자르기다.
 * 셈은 전부 `lib/detail-page/image-crop.ts`에 있고 여기서는 그리기와 손짓만 한다.
 *
 * 화면 좌표로 그리되 **끄는 양은 요소 좌표로 되돌려** 셈한다(배율로 나누고, 회전한
 * 요소면 그 각도만큼 되감는다). 그래야 확대해 놓고 잘라도 같은 결과가 나온다.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { Check, ChevronDown, Minimize2, Proportions, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { elementScreenBox, type ScreenBox } from "./element-rects";
import {
  CROP_PRESETS,
  MAX_CROP_ZOOM,
  applyAspect,
  cropPatch,
  cropStart,
  dragCrop,
  fitRect,
  rectZoom,
  resolveAspect,
  zoomRect,
  type CropAspect,
  type CropHandle,
  type CropPreset,
  type CropPresetId,
  type CropStart,
  type Rect,
} from "../../lib/detail-page/image-crop";
import { imageHasAlpha } from "@leviosa-ai/canvas/render/image-frame";
import { loadImage } from "@leviosa-ai/canvas/render/image-cache";
import type { Attrs } from "@leviosa-ai/canvas/types";

export type CropElement = {
  id: string;
  type?: string;
  src?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  rotation?: unknown;
  set: (patch: Record<string, unknown>) => void;
};

const ACCENT = "rgb(0, 161, 255)";
const HANDLE = 10;
/** 자르기 밖을 덮는 그림자의 짙기. 잘려 나가는 부분이 보이되 상자 안이 또렷해야 한다. */
const OUTSIDE_OPACITY = 0.5;
/** 조작 줄을 작업 영역 안에 남기는 여백/높이. */
const BAR_MARGIN = 180;
const BAR_HEIGHT = 56;

const CORNERS: CropHandle[] = ["nw", "ne", "sw", "se"];
const EDGES: CropHandle[] = ["n", "s", "e", "w"];

const CURSOR: Record<CropHandle, string> = {
  move: "move",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
};

/** 손잡이 하나의 자리(자르기 상자 기준, 화면 px). */
function handleOffset(handle: CropHandle, size: { width: number; height: number }) {
  const east = handle === "e" || handle === "ne" || handle === "se";
  const west = handle === "w" || handle === "nw" || handle === "sw";
  const south = handle === "s" || handle === "sw" || handle === "se";
  const north = handle === "n" || handle === "nw" || handle === "ne";
  return {
    left: east ? size.width : west ? 0 : size.width / 2,
    top: south ? size.height : north ? 0 : size.height / 2,
  };
}

type DragState = {
  pointerId: number;
  handle: CropHandle;
  startX: number;
  startY: number;
  rect: Rect;
};

export function ImageCropOverlay({
  el,
  containerRef,
  scrollRef,
  onClose,
}: {
  el: CropElement;
  containerRef: RefObject<HTMLElement | null>;
  scrollRef?: RefObject<HTMLElement | null>;
  /** 자르기를 끝낸다. `applied`는 문서를 실제로 고쳤는지. */
  onClose: (applied: boolean) => void;
}) {
  const { t } = useTranslation("branding");
  const src = typeof el.src === "string" ? el.src : "";
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [box, setBox] = useState<ScreenBox | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [presetId, setPresetId] = useState<CropPresetId>("custom");
  const [menuOpen, setMenuOpen] = useState(false);
  const drag = useRef<DragState | null>(null);

  // 그림은 캔버스가 이미 받아 둔 것을 그대로 꺼내 쓴다 — 다시 받으면 같은 그림이 두 벌
  // 디코드되고, 교차 출처 설정이 달라 알파 판정이 어긋날 수 있다.
  useEffect(() => {
    let cancelled = false;
    void loadImage(src).then((loaded) => {
      if (!cancelled) setImage(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const natural = useMemo(
    () =>
      image
        ? { width: image.naturalWidth, height: image.naturalHeight }
        : { width: 0, height: 0 },
    [image],
  );

  const start: CropStart | null = useMemo(() => {
    if (!image || !natural.width || !natural.height) return null;
    const width = typeof el.width === "number" ? el.width : 0;
    const height = typeof el.height === "number" ? el.height : 0;
    if (!(width > 0 && height > 0)) return null;
    return cropStart(
      el as unknown as Attrs,
      natural,
      { width, height },
      imageHasAlpha(image),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, natural, el.id, el.width, el.height]);

  // 자르기 상자의 처음 값은 지금 보이는 자리다 — 창을 여는 것만으로 그림이 변하지 않는다.
  useEffect(() => {
    if (start) setRect({ ...start.view });
  }, [start]);

  const preset = CROP_PRESETS.find((item) => item.id === presetId) ?? CROP_PRESETS[0];
  const aspect: CropAspect = resolveAspect(preset, natural);

  const measure = useCallback(() => {
    const host = containerRef.current;
    const next = elementScreenBox(el.id);
    if (!host || !next) {
      setBox(null);
      return;
    }
    const hostBox = host.getBoundingClientRect();
    setBox({ ...next, left: next.left - hostBox.left, top: next.top - hostBox.top });
  }, [containerRef, el.id]);

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [measure]);

  // 스크롤·확대·창 크기가 바뀌면 캔버스가 움직인다. 자르기 상자는 요소 좌표로 들고
  // 있으므로 다시 재기만 하면 따라온다.
  useEffect(() => {
    const scroller = scrollRef?.current;
    let frame: number | null = null;
    const onMove = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };
    scroller?.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      scroller?.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [measure, scrollRef]);

  const apply = useCallback(() => {
    if (!start || !rect) {
      onClose(false);
      return;
    }
    el.set(
      cropPatch(el as unknown as Attrs, start, rect, { circle: preset.circle }),
    );
    onClose(true);
  }, [el, start, rect, preset.circle, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (menuOpen) setMenuOpen(false);
        else onClose(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        apply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, menuOpen, onClose]);

  const choosePreset = (next: CropPreset) => {
    setPresetId(next.id);
    setMenuOpen(false);
    if (!rect || !start) return;
    setRect(applyAspect(rect, start.image, resolveAspect(next, natural)));
  };

  if (!start || !rect || !box) return null;

  const scale = box.scale || 1;
  const radians = (box.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const zoom = rectZoom(rect, start.image, aspect);

  const begin = (event: ReactPointerEvent<HTMLElement>, handle: CropHandle) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      rect,
    };
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    const screenX = event.clientX - state.startX;
    const screenY = event.clientY - state.startY;
    // 화면에서 끈 양을 요소 좌표로 되돌린다(배율을 나누고 회전을 되감는다).
    const dx = (screenX * cos + screenY * sin) / scale;
    const dy = (-screenX * sin + screenY * cos) / scale;
    setRect(dragCrop(state.rect, state.handle, dx, dy, start.image, { aspect }));
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) return;
    drag.current = null;
  };

  const px = (value: number) => value * scale;
  const view = {
    left: px(rect.x),
    top: px(rect.y),
    width: px(rect.width),
    height: px(rect.height),
  };
  const full = {
    left: px(start.image.x),
    top: px(start.image.y),
    width: px(start.image.width),
    height: px(start.image.height),
  };

  // 조작 줄은 자르기 상자 아래에 붙되 작업 영역 안에 남는다 — 화면 끝에 걸친 사진을
  // 자를 때 버튼이 잘려 나가면 빠져나갈 길이 사라진다(작업 영역은 넘치는 것을 자른다).
  const host = containerRef.current;
  const hostWidth = host?.clientWidth ?? 0;
  const hostHeight = host?.clientHeight ?? 0;
  const barCenter = box.left + view.left + view.width / 2;
  const barPosition = {
    left: hostWidth
      ? Math.max(BAR_MARGIN, Math.min(barCenter, hostWidth - BAR_MARGIN))
      : barCenter,
    top: hostHeight
      ? Math.min(box.top + view.top + view.height + 12, hostHeight - BAR_HEIGHT)
      : box.top + view.top + view.height + 12,
  };

  return (
    <div data-dp-image-crop="" style={{ position: "absolute", inset: 0, zIndex: 40 }}>
      {/* 바깥을 누르면 지금 고른 대로 적용하고 나간다 — 피그마와 같은 손버릇이다. */}
      <div
        data-dp-crop-backdrop=""
        onPointerDown={(event) => {
          event.preventDefault();
          if (menuOpen) {
            setMenuOpen(false);
            return;
          }
          apply();
        }}
        style={{ position: "absolute", inset: 0, cursor: "default" }}
      />

      <div
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          transform: `rotate(${box.rotation}deg)`,
          transformOrigin: "0 0",
        }}
      >
        {/* 원본 **전체**를 지금 자리에 그대로 얹는다. 캔버스가 그리고 있는 것은 이미 잘린
            그림이라, 이 한 장이 없으면 잘려 나간 바깥을 볼 수가 없다. */}
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            ...full,
            pointerEvents: "none",
            userSelect: "none",
          }}
        />

        {/* 남길 자리. 바깥은 **아주 큰 그림자 하나**로 덮어 가라앉힌다 — 사각형 넷을 맞춰
            그리는 것보다 셈이 없고, 캔버스의 나머지까지 같이 어두워져 지금 무엇을 고르고
            있는지가 분명해진다. */}
        <div
          data-dp-crop-rect=""
          onPointerDown={(event) => begin(event, "move")}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          style={{
            position: "absolute",
            ...view,
            boxShadow: `0 0 0 9999px rgba(0, 0, 0, ${OUTSIDE_OPACITY})`,
            outline: `1px solid ${ACCENT}`,
            borderRadius: preset.circle ? "50%" : undefined,
            cursor: "move",
            touchAction: "none",
          }}
        >
          {/* 삼등분 선 — 구도를 잡는 눈금이다. */}
          {[1, 2].map((step) => (
            <span
              key={`v${step}`}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: (view.width * step) / 3,
                top: 0,
                width: 1,
                height: "100%",
                background: "rgba(255, 255, 255, 0.45)",
              }}
            />
          ))}
          {[1, 2].map((step) => (
            <span
              key={`h${step}`}
              aria-hidden="true"
              style={{
                position: "absolute",
                top: (view.height * step) / 3,
                left: 0,
                height: 1,
                width: "100%",
                background: "rgba(255, 255, 255, 0.45)",
              }}
            />
          ))}
        </div>

        {/* 손잡이는 상자 밖에 둔다 — 안에 두면 그림자·눈금에 가려 안 잡힌다. */}
        {[...CORNERS, ...EDGES].map((handle) => {
          const at = handleOffset(handle, view);
          return (
            <span
              key={handle}
              data-dp-crop-handle={handle}
              onPointerDown={(event) => begin(event, handle)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              style={{
                position: "absolute",
                left: view.left + at.left - HANDLE / 2,
                top: view.top + at.top - HANDLE / 2,
                width: HANDLE,
                height: HANDLE,
                borderRadius: CORNERS.includes(handle) ? 2 : 999,
                background: "#fff",
                border: `1px solid ${ACCENT}`,
                boxSizing: "border-box",
                cursor: CURSOR[handle],
                touchAction: "none",
              }}
            />
          );
        })}
      </div>

      {/* 조작 줄은 회전과 무관하게 세워 둔다 — 기울어진 버튼은 누르기 어렵다. */}
      <div
        data-dp-crop-bar=""
        onPointerDown={(event) => event.stopPropagation()}
        style={{ position: "absolute", ...barPosition, transform: "translateX(-50%)" }}
        className="flex items-center gap-2 rounded-le-xl border border-le-ink-200 bg-le-surface/95 py-1.5 pl-3 pr-1.5 shadow-md backdrop-blur-sm"
      >
        <span className="text-[13px] font-le-semibold text-le-ink-900">
          {t("detailPage.crop.title")}
        </span>

        <span className="h-5 w-px bg-le-ink-200" aria-hidden="true" />

        {/* 확대 — 1배는 원본을 다 쓰는 자리, 키울수록 가운데를 지키며 좁아진다. */}
        <input
          type="range"
          aria-label={t("detailPage.crop.zoom")}
          min={1}
          max={MAX_CROP_ZOOM}
          step={0.01}
          value={Math.min(zoom, MAX_CROP_ZOOM)}
          onChange={(event) =>
            setRect(zoomRect(rect, start.image, aspect, Number(event.target.value)))
          }
          className="h-1 w-32 accent-le-ink-900"
        />

        {/* 비율 — 고르면 그 자리에서 상자를 그 비율로 맞추고, 이후 손잡이도 따라 움직인다. */}
        <div className="relative">
          <button
            type="button"
            data-dp-crop-preset-toggle=""
            aria-label={t("detailPage.crop.ratio")}
            title={t(`detailPage.crop.presets.${presetId}`)}
            onClick={() => setMenuOpen((open) => !open)}
            className={[
              "flex h-8 items-center gap-0.5 rounded-le-md px-1.5 text-le-ink-700 transition-colors",
              menuOpen ? "bg-le-ink-100" : "hover:bg-le-ink-100",
            ].join(" ")}
          >
            <Proportions aria-hidden="true" size={16} />
            <ChevronDown aria-hidden="true" size={13} />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              data-dp-crop-presets=""
              className="absolute bottom-10 left-1/2 z-10 w-44 -translate-x-1/2 rounded-le-lg border border-le-ink-200 bg-le-surface py-1 shadow-lg"
            >
              {CROP_PRESETS.map((item, index) => (
                <div key={item.id}>
                  {index > 0 && item.group !== CROP_PRESETS[index - 1].group ? (
                    <div className="my-1 border-t border-le-ink-100" />
                  ) : null}
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.id === presetId}
                    data-dp-crop-preset={item.id}
                    onClick={() => choosePreset(item)}
                    className="flex h-[30px] w-full items-center gap-2 px-3 text-left text-[13px] text-le-ink-700 transition-colors hover:bg-le-ink-100"
                  >
                    <Check
                      aria-hidden="true"
                      size={13}
                      className={item.id === presetId ? "" : "invisible"}
                    />
                    {t(`detailPage.crop.presets.${item.id}`)}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* 원본 전체로 되돌리기 — 지금 비율을 지키며 담을 수 있는 최대로 넓힌다. */}
        <button
          type="button"
          data-dp-crop-reset=""
          aria-label={t("detailPage.crop.reset")}
          title={t("detailPage.crop.reset")}
          onClick={() => setRect(fitRect(start.image, aspect))}
          className="flex h-8 w-8 items-center justify-center rounded-le-md text-le-ink-700 transition-colors hover:bg-le-ink-100"
        >
          <Minimize2 aria-hidden="true" size={15} />
        </button>

        <span className="h-5 w-px bg-le-ink-200" aria-hidden="true" />

        <button
          type="button"
          onClick={() => onClose(false)}
          className="flex h-8 items-center rounded-le-md px-2.5 text-[13px] font-le-medium text-le-ink-600 transition-colors hover:bg-le-ink-100"
        >
          <X aria-hidden="true" size={14} className="mr-1" />
          {t("detailPage.crop.cancel")}
        </button>
        <button
          type="button"
          data-dp-crop-apply=""
          aria-label={t("detailPage.crop.apply")}
          onClick={apply}
          className="flex h-8 w-8 items-center justify-center rounded-le-md bg-le-active-600 text-le-on-accent"
        >
          <Check aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  );
}
