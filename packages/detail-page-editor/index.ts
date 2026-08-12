/**
 * 편집기 셸의 대문.
 *
 * 소비자가 실제로 잡는 것은 몇 개 안 된다 — 편집기, 호스트 계약, 그리고 문서를 다루는
 * 몇 가지. 나머지는 깊은 경로(`exports` 맵)로 열어 둔다.
 */

export {
  DetailPageHostProvider,
  useDetailPageHost,
} from "./components/detail-page/detail-page-host-context";
export type {
  DetailPageHost,
  DetailPageHostApi,
  DetailPageHostBrand,
  DetailPageHostProduct,
  DetailPageHostQueryKeys,
  DetailPageHostSlots,
  DetailPageHostToast,
} from "./components/detail-page/detail-page-host-context";
export type * from "./types/detail-page-api";
export type * from "./types/commerce";

export { DetailPageEditor } from "./components/detail-page/detail-page-editor";
