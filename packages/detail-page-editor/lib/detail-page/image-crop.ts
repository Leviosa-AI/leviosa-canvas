/**
 * 사진 자르기의 셈.
 *
 * 자르기는 화면 일이 아니라 **좌표 일**이라 여기 따로 적는다. 오버레이는 이 함수들이
 * 돌려주는 사각형을 그리기만 한다.
 *
 * 문서에 남는 값은 `cropX/cropY/cropWidth/cropHeight` — 원본 크기에 대한 **비율**이다.
 * 렌더러(`@leviosa-ai/canvas/render/image-frame`)는 그 비율로 원본에서 오려 오되,
 * **상자 비율에 맞춰 자른 자리의 왼쪽 위에서** 다시 맞춘다. 그래서 자를 때 상자도 같이
 * 갈아 줘야 한다 — 자른 사각형과 상자의 비율이 같으면 렌더러가 더 깎을 것이 없다.
 * 상자를 그대로 두고 crop만 적으면 사용자가 고른 자리와 화면이 어긋난다.
 */

import { imageFrame, type Rect, type Size } from "@leviosa-ai/canvas/render/image-frame";
import { num, type Attrs } from "@leviosa-ai/canvas/types";

export type { Rect, Size };

/** 자르기 상자를 잡는 손잡이. `move`는 상자째 옮기기. */
export type CropHandle =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "nw"
  | "ne"
  | "sw"
  | "se";

export type CropStart = {
  /** 원본 **전체**가 놓이는 자리. 요소 상자의 원점 기준, 요소 좌표(px). */
  image: Rect;
  /** 지금 보이는 자리 = 자르기 상자의 처음 값. 같은 좌표계. */
  view: Rect;
};

/** 자르기 상자의 최소 크기(요소 px). 이보다 작아지면 다룰 수가 없다. */
export const MIN_CROP = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 자르기를 시작할 때의 두 사각형.
 *
 * 지금 화면이 어떻게 나오고 있는지는 렌더러에게 그대로 묻는다(`imageFrame`) — 여기서
 * cover/contain 규칙을 다시 적으면 언젠가 둘이 갈라지고, 그 순간 자르기 창을 여는 것만으로
 * 사진이 튄다.
 */
export function cropStart(
  el: Attrs,
  natural: Size,
  box: Size,
  transparent: boolean,
): CropStart {
  const frame = imageFrame(el, natural, box, transparent);
  const source =
    frame.crop ?? { x: 0, y: 0, width: natural.width, height: natural.height };
  const scaleX = source.width > 0 ? frame.dest.width / source.width : 1;
  const scaleY = source.height > 0 ? frame.dest.height / source.height : 1;
  return {
    image: {
      x: frame.dest.x - source.x * scaleX,
      y: frame.dest.y - source.y * scaleY,
      width: natural.width * scaleX,
      height: natural.height * scaleY,
    },
    view: { ...frame.dest },
  };
}

/** 가로세로 비(폭÷높이). `null`이면 자유 비율. */
export type CropAspect = number | null;

/** `bounds` 안에 들어가는 가장 큰 `aspect` 사각형 — 가운데에 둔다. */
export function fitRect(bounds: Rect, aspect: CropAspect): Rect {
  if (!aspect || aspect <= 0) return { ...bounds };
  let width = bounds.width;
  let height = width / aspect;
  if (height > bounds.height) {
    height = bounds.height;
    width = height * aspect;
  }
  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  };
}

/** 사각형을 `bounds` 안으로 밀어 넣는다(크기는 그대로, 넘치면 줄인다). */
function containRect(rect: Rect, bounds: Rect): Rect {
  const width = Math.min(rect.width, bounds.width);
  const height = Math.min(rect.height, bounds.height);
  return {
    x: clamp(rect.x, bounds.x, bounds.x + bounds.width - width),
    y: clamp(rect.y, bounds.y, bounds.y + bounds.height - height),
    width,
    height,
  };
}

/**
 * 비율을 바꾼다. 지금 상자의 가운데를 지키고 폭을 기준으로 높이를 다시 잡되, 원본 밖으로
 * 나가면 들어오는 크기까지 줄인다.
 */
export function applyAspect(rect: Rect, bounds: Rect, aspect: CropAspect): Rect {
  if (!aspect || aspect <= 0) return containRect(rect, bounds);
  let width = rect.width;
  let height = width / aspect;
  if (height > bounds.height) {
    height = bounds.height;
    width = height * aspect;
  }
  if (width > bounds.width) {
    width = bounds.width;
    height = width / aspect;
  }
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return containRect(
    { x: centerX - width / 2, y: centerY - height / 2, width, height },
    bounds,
  );
}

/**
 * 확대 배율 → 자르기 상자. 1이면 이 비율로 담을 수 있는 최대(=원본을 다 쓰는 자리)이고,
 * 키울수록 가운데를 지키며 좁아진다 — 사진 쪽에서 보면 확대다.
 */
export function zoomRect(
  rect: Rect,
  bounds: Rect,
  aspect: CropAspect,
  zoom: number,
): Rect {
  const base = fitRect(bounds, aspect ?? rect.width / (rect.height || 1));
  const factor = Math.max(1, zoom);
  const width = Math.max(MIN_CROP, base.width / factor);
  const height = Math.max(MIN_CROP, base.height / factor);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return containRect(
    { x: centerX - width / 2, y: centerY - height / 2, width, height },
    bounds,
  );
}

/** 지금 상자가 몇 배로 확대된 것인지 — 슬라이더 손잡이가 손짓을 따라오게 하는 값. */
export function rectZoom(rect: Rect, bounds: Rect, aspect: CropAspect): number {
  const base = fitRect(bounds, aspect ?? rect.width / (rect.height || 1));
  if (!rect.width) return 1;
  return Math.max(1, base.width / rect.width);
}

/**
 * 손잡이를 (dx, dy)만큼 끌었을 때의 자르기 상자.
 *
 * 원본 밖은 자를 것이 없으므로 `bounds`(원본이 놓인 자리) 안에 가둔다. 옮기기는 상자
 * 크기를 지키며 **밀어 넣고**, 크기 조절은 반대편 모서리를 붙잡아 둔다. 비율이 걸려
 * 있으면 끈 축을 따라가고 나머지 축은 그 비율로 따라온다.
 */
export function dragCrop(
  start: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: Rect,
  { min = MIN_CROP, aspect = null }: { min?: number; aspect?: CropAspect } = {},
): Rect {
  if (handle === "move") {
    const width = Math.min(start.width, bounds.width);
    const height = Math.min(start.height, bounds.height);
    return {
      x: clamp(start.x + dx, bounds.x, bounds.x + bounds.width - width),
      y: clamp(start.y + dy, bounds.y, bounds.y + bounds.height - height),
      width,
      height,
    };
  }

  const west = handle === "w" || handle === "nw" || handle === "sw";
  const east = handle === "e" || handle === "ne" || handle === "se";
  const north = handle === "n" || handle === "nw" || handle === "ne";
  const south = handle === "s" || handle === "sw" || handle === "se";

  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (west) left = clamp(left + dx, bounds.x, right - min);
  if (east) right = clamp(right + dx, left + min, bounds.x + bounds.width);
  if (north) top = clamp(top + dy, bounds.y, bottom - min);
  if (south) bottom = clamp(bottom + dy, top + min, bounds.y + bounds.height);

  const free = { x: left, y: top, width: right - left, height: bottom - top };
  if (!aspect || aspect <= 0) return free;

  // 비율이 걸려 있으면 **끈 축**이 주인이다. 위아래 손잡이는 높이가, 나머지는 폭이 주인.
  const vertical = handle === "n" || handle === "s";
  let width = vertical ? free.height * aspect : free.width;

  // 붙잡아 둘 자리: 끈 쪽의 반대편. 가운데를 잡은 축은 가운데를 지킨다.
  const anchorX = west ? free.x + free.width : east ? free.x : free.x + free.width / 2;
  const anchorY = north ? free.y + free.height : south ? free.y : free.y + free.height / 2;

  // 붙잡아 둔 자리에서 원본 끝까지가 늘릴 수 있는 전부다. **바깥 상자가 아니라 이 값**으로
  // 재야 한다 — 상자 전체로 재고 나중에 밀어 넣으면 붙잡아 둔 모서리가 슬그머니 움직인다.
  const maxWidth = west
    ? anchorX - bounds.x
    : east
      ? bounds.x + bounds.width - anchorX
      : 2 * Math.min(anchorX - bounds.x, bounds.x + bounds.width - anchorX);
  const maxHeight = north
    ? anchorY - bounds.y
    : south
      ? bounds.y + bounds.height - anchorY
      : 2 * Math.min(anchorY - bounds.y, bounds.y + bounds.height - anchorY);

  width = Math.max(min, Math.min(width, maxWidth, maxHeight * aspect));
  const height = width / aspect;

  const x = west ? anchorX - width : east ? anchorX : anchorX - width / 2;
  const y = north ? anchorY - height : south ? anchorY : anchorY - height / 2;

  return { x, y, width, height };
}

/**
 * 자른 결과를 요소에 적을 패치.
 *
 * 상자를 자른 사각형 자리로 옮기고(회전한 요소는 그 각도로 돌려서 옮긴다), 크기를 그
 * 사각형으로 맞춘 다음, 원본에서 오려 올 자리를 비율로 적는다. 좌표는 먼저 정수로
 * 반올림하고 **그 값으로** 비율을 뽑는다 — 순서를 바꾸면 상자와 자른 자리의 비율이 미세하게
 * 어긋나 렌더러가 한 픽셀을 더 깎는다.
 *
 * `stretchEnabled`는 끈다. 늘여 그리라는 지시는 자르라는 지시보다 먼저 읽히므로, 켜진 채로
 * 두면 방금 고른 자리가 무시된다.
 */
export function cropPatch(
  el: Attrs,
  start: CropStart,
  rect: Rect,
  { circle = false }: { circle?: boolean } = {},
): Attrs {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  const radians = (num(el, "rotation", 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const { image } = start;
  const safeWidth = image.width || 1;
  const safeHeight = image.height || 1;

  return {
    x: Math.round(num(el, "x", 0) + x * cos - y * sin),
    y: Math.round(num(el, "y", 0) + x * sin + y * cos),
    width,
    height,
    cropX: (x - image.x) / safeWidth,
    cropY: (y - image.y) / safeHeight,
    cropWidth: width / safeWidth,
    cropHeight: height / safeHeight,
    stretchEnabled: false,
    // 동그랗게 자르기는 자른 자리가 아니라 모서리로 낸다 — 렌더러가 이미 할 줄 아는 일이다.
    ...(circle ? { cornerRadius: Math.round(Math.min(width, height) / 2) } : {}),
  };
}

/**
 * 비율 프리셋.
 *
 * `original`은 값을 여기서 못 적는다 — 사진마다 다르므로 열 때 `resolveAspect`가 원본
 * 크기에서 뽑는다. `circle`은 비율이 아니라 **모서리**다: 1:1로 자르고 모서리를 반지름
 * 끝까지 굴려 동그랗게 만든다(렌더러의 `cornerRadius`가 그대로 그린다).
 */
export type CropPresetId =
  | "custom"
  | "original"
  | "square"
  | "circle"
  | "16-9"
  | "4-3"
  | "3-2"
  | "9-16"
  | "3-4"
  | "2-3";

export type CropPreset = {
  id: CropPresetId;
  group: "basic" | "landscape" | "portrait";
  /** 고정 비율. `null`은 자유, `"original"`은 원본 비율. */
  aspect: number | null | "original";
  circle?: boolean;
};

export const CROP_PRESETS: CropPreset[] = [
  { id: "custom", group: "basic", aspect: null },
  { id: "original", group: "basic", aspect: "original" },
  { id: "square", group: "basic", aspect: 1 },
  { id: "circle", group: "basic", aspect: 1, circle: true },
  { id: "16-9", group: "landscape", aspect: 16 / 9 },
  { id: "4-3", group: "landscape", aspect: 4 / 3 },
  { id: "3-2", group: "landscape", aspect: 3 / 2 },
  { id: "9-16", group: "portrait", aspect: 9 / 16 },
  { id: "3-4", group: "portrait", aspect: 3 / 4 },
  { id: "2-3", group: "portrait", aspect: 2 / 3 },
];

export function resolveAspect(preset: CropPreset, natural: Size): CropAspect {
  if (preset.aspect === "original") {
    return natural.height > 0 ? natural.width / natural.height : null;
  }
  return preset.aspect;
}

/** 슬라이더가 올라갈 수 있는 최대 배율. 이보다 키우면 원본 화질이 남지 않는다. */
export const MAX_CROP_ZOOM = 4;

/** 자르기를 지운다 — 렌더러가 다시 제 규칙(누끼는 통째로, 사진은 채워 자르기)으로 앉힌다. */
export function clearCropPatch(): Attrs {
  return {
    cropX: null,
    cropY: null,
    cropWidth: null,
    cropHeight: null,
  };
}
