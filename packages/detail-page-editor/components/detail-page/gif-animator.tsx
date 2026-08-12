"use client";

import { useEffect, useRef } from "react";
import { observer } from "./canvas-observer";
import Konva from "konva";

import { isGifSrc } from "../../lib/detail-page-canvas/export/gif-plan";
import {
  decodeAnimation,
  frameAtTime,
  type DecodedAnimation,
} from "../../lib/detail-page/gif-frames";

/**
 * 움직이는 이미지(GIF·WebP)를 캔버스에서 재생시키는 컨트롤러(오버레이 없음).
 *
 * 핵심 사실 하나에서 출발한다. **`drawImage(움직이는 이미지)` 는 언제나 첫 프레임을
 * 준다.** 이미지가 문서에 붙어 있든 아니든, GIF 든 WebP 든 마찬가지다(실측: 헤드리스·
 * 헤드풀 Chrome 양쪽에서 3프레임 애니메이션을 1.5초 동안 12번 찍어도 색이 하나였다).
 * 브라우저는 화면에 그려지는 `<img>` 만 프레임을 넘기고, 캔버스로 퍼 갈 때는 넘겨주지
 * 않는다. 그래서 "레이어를 계속 다시 그리면 브라우저가 넘긴 프레임이 찍힌다"는 접근은
 * 성립하지 않는다 — 첫 프레임을 15fps 로 다시 그릴 뿐이다.
 *
 * 그러므로 프레임은 우리가 직접 넘긴다. 소스를 한 번 디코딩해 두고(gif-frames), 매 틱
 * Konva.Image 의 `image` 를 그 시각의 프레임 캔버스로 갈아 끼운 뒤 레이어를 다시 그린다.
 * 프레임 캔버스는 원본과 같은 크기라서 엔진이 계산해 둔 `crop`·`cornerRadius`·배치가
 * 그대로 맞는다 — 잘라내기 수식을 여기서 다시 구현하지 않아도 된다(예전에는 편집기의
 * 오프스크린 스냅샷을 흉내 내느라 복제했고, 엔진이 바뀔 때마다 어긋났다).
 *
 * GIF는 진짜 Konva 노드이므로 z-order·그 위 텍스트·불투명도·드래그가 모두 네이티브로
 * 맞다. 실제 export 는 별도로 프레임을 합성하므로 이 프리뷰 경로와 무관하다.
 *
 * 성능: 움직이는 요소가 있고 탭이 보일 때만 돈다. 스택 워크스페이스는 활성 인덱스 주변
 * 몇 페이지만 마운트하므로 다시 그리는 레이어는 보통 1~2개다. 각 src는 한 번만 디코드.
 */

type ElementLike = {
  id: string;
  type?: string;
  src?: string;
  visible?: boolean;
  custom?: Record<string, unknown> | null;
  children?: ElementLike[];
};
type StoreLike = { pages?: Array<{ children?: ElementLike[] }> };

const FPS = 15;
const FRAME_MS = 1000 / FPS;

function isGifElement(el: ElementLike): boolean {
  if (el.custom && (el.custom as { detailPageGif?: unknown }).detailPageGif) return true;
  return (el.type === "image" || el.type === "svg") && isGifSrc(el.src);
}

function collectGifElements(children: ElementLike[] | undefined, out: ElementLike[]): void {
  for (const el of children ?? []) {
    if (isGifElement(el) && el.src && el.visible !== false) out.push(el);
    if (el.children) collectGifElements(el.children, out);
  }
}

/**
 * 재생 대상 요소 id(모든 페이지, 그룹 재귀). 숨김(visible:false)·src 없음은 제외.
 * 애니메이션 루프가 다시 그릴 노드를 이 id들로 찾는다.
 */
export function gifElementIds(pages: Array<{ children?: ElementLike[] }> | undefined): string[] {
  const els: ElementLike[] = [];
  for (const page of pages ?? []) collectGifElements(page.children, els);
  return els.map((el) => el.id);
}

/** `image()` 를 가진 노드 — 이미지 노드 자신이거나, 요소 그룹 안의 이미지 자식. */
type ImageNode = Konva.Node & { image: (value?: CanvasImageSource) => unknown };

function hasImageAccessor(node: Konva.Node | null): node is ImageNode {
  return typeof (node as { image?: unknown } | null)?.image === "function";
}

/**
 * 요소 id로 그릴 이미지 노드를 찾는다.
 *
 * 엔진이 요소 하나를 `id` 를 단 Group 으로 감싸고 그 안에 이미지 노드를 두므로, id 로
 * 찾은 노드가 곧 이미지 노드는 아니다. 한 겹 더 내려가야 한다.
 */
export function findImageNode(id: string, stages: Konva.Stage[]): ImageNode | null {
  for (const stage of stages) {
    const found = stage.findOne(`#${id}`);
    if (!found) continue;
    if (hasImageAccessor(found)) return found;
    const inner = (found as Konva.Container).findOne?.("Image");
    return hasImageAccessor(inner ?? null) ? (inner as ImageNode) : null;
  }
  return null;
}

export const GifAnimator = observer(function GifAnimator({ store }: { store: unknown }) {
  const s = store as StoreLike;
  // render 중에 읽어(mobx) GIF가 생기거나 숨겨지면 루프가 재구성되게 한다.
  const els: ElementLike[] = [];
  for (const page of s.pages ?? []) collectGifElements(page.children, els);
  const key = els.map((el) => `${el.id}:${el.src ?? ""}`).join(",");

  // 요소 참조/디코드 캐시(effect 밖 stable ref). 루프는 매 틱 최신 요소 속성을 읽는다.
  const elMapRef = useRef<Map<string, ElementLike>>(new Map());
  const decodedRef = useRef<Map<string, DecodedAnimation>>(new Map()); // src → 디코드 프레임
  const failedRef = useRef<Set<string>>(new Set()); // 디코드 실패한 src(재시도·재로그 억제)
  const staticRef = useRef<Set<string>>(new Set()); // 한 장으로 디코드된 src(재로그 억제)
  elMapRef.current = new Map(els.map((el) => [el.id, el]));

  useEffect(() => {
    if (!els.length) return;
    let raf = 0;
    let last = 0;
    let stopped = false;
    const startedAt = typeof performance !== "undefined" ? performance.now() : 0;

    // 새 src만 디코드(멱등). 실패하면 그 GIF는 정적으로 남는데, 예전엔 그걸 조용히
    // 삼켜서 "캔버스에서만 재생이 안 되는" 증상만 남았다(원인은 CSP connect-src 차단).
    // 같은 src로는 재시도하지 않고, 대신 이유를 한 번 남긴다.
    for (const el of els) {
      const src = el.src;
      if (src && !decodedRef.current.has(src) && !failedRef.current.has(src)) {
        decodeAnimation(src)
          .then((g) => {
            if (!stopped) decodedRef.current.set(src, g);
          })
          .catch((err) => {
            failedRef.current.add(src);
            console.warn("[GifAnimator] 디코드 실패 — 정적으로 표시됩니다.", src, err);
          });
      }
    }

    const tick = (t: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (t - last < FRAME_MS) return; // ~15fps로 스로틀.
      last = t;
      if (typeof document !== "undefined" && document.hidden) return;

      const layers = new Set<Konva.Layer>();
      for (const [id, el] of elMapRef.current) {
        const src = el.src;
        const gif = src ? decodedRef.current.get(src) : undefined;
        if (!gif) continue;
        // 한 장짜리(정지 이미지·디코드 폴백)는 갈아 끼울 것이 없다. 다만 **움직이는
        // 자산으로 꽂힌 요소가** 한 장으로 나오면 그건 사고다 — 디코더가 프레임 수를
        // 잘못 준 적이 있고(ImageDecoder tracks.ready 누락), 실패가 아니라서 콘솔에
        // 아무 흔적도 남지 않아 "그냥 안 움직인다"로만 보였다. 한 번은 남긴다.
        if (gif.frames.length <= 1) {
          if (src && !staticRef.current.has(src)) {
            staticRef.current.add(src);
            console.warn("[GifAnimator] 프레임이 한 장이라 정지 상태로 둡니다.", src);
          }
          continue;
        }

        const node = findImageNode(id, Konva.stages);
        const layer = node?.getLayer();
        if (!node || !layer) continue;

        const frame = frameAtTime(gif, t - startedAt);
        if (node.image() === frame.canvas) continue; // 같은 프레임이면 건드리지 않는다.
        node.image(frame.canvas);
        // 필터로 노드가 캐시돼 있으면 캐시를 비워야 갱신이 보인다(필터효과는 재생 중 생략).
        const cached = node as unknown as { isCached?: () => boolean; clearCache?: () => void };
        if (cached.isCached?.()) cached.clearCache?.();
        layers.add(layer);
      }
      for (const layer of layers) layer.batchDraw();
    };

    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
    // ids/속성은 key(문자열)로 대표. Konva.stages·요소는 라이브로 읽으므로 dep 불필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
});
GifAnimator.displayName = "GifAnimator";
