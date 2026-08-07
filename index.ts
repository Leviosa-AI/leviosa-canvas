/**
 * leviosa-canvas — 우리 편집기 엔진.
 *
 * 저장 포맷은 Polotno JSON 그대로다(무손실 라운드트립). 언젠가 패키지로 떼어낼 수
 * 있도록 앱 코드는 이 배럴만 통해 들어온다.
 *
 * **여기서 안 나가는 것은 `leviosa-agency`에서 못 쓴다.** 패키지가 될 때 이 파일이
 * 곧 진입점이 되므로, 바깥이 필요로 하는 것은 전부 여기로 내보낸다.
 *
 * 계획: `docs/leviosa-canvas-plan.md` · 관문: `docs/leviosa-canvas-gates.md`
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

export { CanvasView } from "./render/canvas-view";
export {
  collectFontRequests,
  useDocumentFonts,
  type FontLoader,
  type FontRequest,
} from "./render/use-document-fonts";
export {
  encodeSvgSrc,
  normalizeColor,
  replaceSvgColors,
  svgSourceFor,
} from "./render/svg-source";

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
