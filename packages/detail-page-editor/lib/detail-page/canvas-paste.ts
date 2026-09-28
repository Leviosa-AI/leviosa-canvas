// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * 밖에서 캔버스로 들어오는 것 — OS 클립보드 붙여넣기와 파일 끌어다 놓기.
 *
 * 엔진의 ⌘V 는 **자기 클립보드**(localStorage)만 본다. 다른 앱에서 복사한 그림이나
 * 글자는 브라우저의 `paste` 이벤트로만 읽을 수 있어서, ⌘V 를 엔진에 넘기지 않고
 * 그 이벤트가 뜨게 둔 뒤 여기서 무엇을 붙일지 고른다.
 *
 * 어느 쪽이 "방금 복사한 것"인지는 OS 클립보드에 적어 둔 표식으로 가린다. 편집기
 * 안에서 복사하면(⌘C·⌘X) OS 클립보드에 `CANVAS_CLIPBOARD_MARK` 를 같이 적는다 —
 * 그러면 그 뒤 다른 앱에서 복사한 것이 표식을 덮어쓰므로, 표식이 보이면 엔진 것이
 * 최신이고 안 보이면 OS 것이 최신이다. 복사는 원래 시스템 클립보드를 갈아엎는 일이라
 * 사람이 기대하는 것과도 같다.
 *
 * ponytail: 우클릭 메뉴의 «복사»는 표식을 안 적는다(엔진 명령을 바로 부른다). 그 뒤
 * ⌘V 는 OS 에 글자가 남아 있으면 그 글자를 붙인다 — 메뉴 복사도 표식을 적게 하면 닫힌다.
 */

import { insertPersonalImage } from "./insert-image";
import { isAnimatedFile } from "./animation-sniff";

export const CANVAS_CLIPBOARD_MARK = "leviosa-canvas:elements";

export type PastePlan =
  | { kind: "engine" }
  | { kind: "files"; files: File[] }
  | { kind: "text"; text: string };

/** 붙여넣기에 딸려 온 이미지 파일들. */
export function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
}

/**
 * 무엇을 붙일지.
 *
 * 1. 우리 표식이면 엔진 클립보드(방금 편집기에서 복사한 것).
 * 2. 이미지 파일이 있고 올릴 수 있으면 그 파일들.
 * 3. 글자가 있으면 글상자.
 * 4. 아무것도 없으면 엔진 클립보드 — 다른 탭에서 복사한 요소가 거기 있다.
 */
export function planPaste(
  data: Pick<DataTransfer, "getData" | "files"> | null,
  canUpload: boolean,
): PastePlan {
  const text = data?.getData("text/plain") ?? "";
  if (text === CANVAS_CLIPBOARD_MARK) return { kind: "engine" };
  const files = imageFiles(data?.files);
  if (files.length && canUpload) return { kind: "files", files };
  if (text.trim()) return { kind: "text", text: text.trim() };
  return { kind: "engine" };
}

/** 편집기 안 복사를 OS 클립보드에 알린다. 권한이 없으면 조용히 넘어간다. */
export function markCanvasCopy(): void {
  try {
    void navigator.clipboard?.writeText?.(CANVAS_CLIPBOARD_MARK).catch(() => {});
  } catch {
    // 클립보드 API 가 없는 환경.
  }
}

/** 파일을 하나씩 올려 캔버스에 넣는다. 드롭·붙여넣기가 같이 쓴다. 넣은 수를 돌려준다. */
export async function insertImageFiles(
  store: unknown,
  files: File[],
  uploadFile: (file: File) => Promise<string>,
): Promise<number> {
  let inserted = 0;
  for (const file of files) {
    const url = await uploadFile(file);
    // 움직이는 WebP 와 정지 WebP 가 둘 다 image/webp 라 바이트를 본다(사진 패널과 같다).
    insertPersonalImage(store, url, { isGif: await isAnimatedFile(file) });
    inserted += 1;
  }
  return inserted;
}
