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

/**
 * 편집기가 부르는 주소(라우트 · 정적 자산)를 앱에 맞춘다.
 *
 * `basePath` 를 쓰는 앱은 **반드시** 불러야 한다 — 루트 절대경로 `fetch` 는 Next 의
 * basePath 를 안 타므로, 안 부르면 아이콘·사진·폰트가 앱 바깥을 두드린다.
 */
export {
  configureDetailPageEditor,
  detailPageEditorConfig,
} from "./lib/detail-page/runtime-config";
export type {
  DetailPageEditorAssets,
  DetailPageEditorConfig,
  DetailPageEditorEndpoints,
} from "./lib/detail-page/runtime-config";
