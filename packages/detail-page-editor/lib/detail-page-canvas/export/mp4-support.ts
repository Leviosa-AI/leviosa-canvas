/**
 * MP4 를 구울 수 있는 브라우저인지만 본다.
 *
 * 인코더(`mp4-encode.ts`)와 갈라 둔 이유는 하나다 — 거기엔 muxer 가 딸려 있어서,
 * 형식 목록을 그리려고 그 파일을 import 하면 MP4 를 고르지도 않은 사람이 muxer 를
 * 내려받는다. 여기는 의존성이 없어야 한다.
 */

/**
 * 이 브라우저가 MP4 를 구울 수 있는가.
 *
 * 거짓이 되는 경우가 둘이다. 하나는 정말 WebCodecs 가 없는 브라우저, 다른 하나는
 * **보안 컨텍스트가 아닐 때**다 — `VideoEncoder` 는 https 와 localhost 에만 있어서,
 * 평문 http 로 편집기를 열면 이름조차 없다. 그래서 "코덱 문제" 처럼 보이지 않고
 * 그냥 MP4 항목이 사라진다.
 */
export function isMp4EncodeSupported(): boolean {
  return (
    typeof globalThis.VideoEncoder === "function" &&
    typeof globalThis.VideoFrame === "function"
  );
}
