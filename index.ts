/**
 * leviosa-canvas — 우리 편집기 엔진.
 *
 * 저장 포맷은 Polotno JSON 그대로다(무손실 라운드트립). 언젠가 패키지로 떼어낼 수
 * 있도록 앱 코드는 이 배럴만 통해 들어온다.
 *
 * 계획: `docs/leviosa-canvas-plan.md`
 */

export {
  CanvasElement,
  CanvasHistory,
  CanvasPage,
  CanvasStore,
  createCanvasStore,
  walkElements,
  withFreshIds,
  type CanvasContainer,
} from "./store";

export {
  useCanvasVersion,
  useElementVersion,
  usePageVersion,
  useSelectionKey,
} from "./use-canvas";

export {
  asArray,
  asRecord,
  bool,
  createId,
  isContainerType,
  num,
  str,
  type Attrs,
  type DocumentJson,
  type ElementJson,
  type PageJson,
} from "./types";
