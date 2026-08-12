/**
 * 엔진 사용 키를 한 자리에서 넣는다.
 *
 * 키는 **보호 수단이 아니라 계량기**다(패키지의 `license.ts` 머리말). 우리 도메인과
 * localhost에서는 엔진이 아예 안 묻고, 키가 없어도 편집기는 똑같이 돈다. 그래도 넣는
 * 이유는 누가 얼마나 쓰는지 셀 자리를 지금부터 열어 두기 위해서다 — 나중에 외부에 팔
 * 때 스위치를 새로 만들지 않아도 된다.
 *
 * `createCanvasStore`가 아니라 여기인 것도 그 문서의 결정이다. 스토어를 만들 때마다
 * 키를 들고 다니면 호출부 전부가 키를 알아야 한다.
 */

import { configureCanvas } from "@leviosa-ai/canvas";

let configured = false;

/** 편집기를 여는 자리에서 부른다. 두 번 불러도 안전하다. */
export function ensureCanvasKey(): void {
  if (configured) return;
  configured = true;
  configureCanvas({ key: process.env.NEXT_PUBLIC_LEVIOSA_CANVAS_KEY });
}
