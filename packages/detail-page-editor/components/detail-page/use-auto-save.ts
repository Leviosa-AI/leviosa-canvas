// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { useCallback, useEffect, useRef, useState } from "react";

export type SaveReason = "auto" | "manual" | "leave";

/**
 * 첫 변경으로부터 여기까지는 기다려 준다. 디바운스만 두면 계속 그리는 동안 한 번도
 * 안 나가므로, 편집 중이어도 이 간격마다 한 번은 저장된다.
 *
 * 더 줄여도 요청이 겹치지는 않는다 — 한 번에 하나만 나가니까. 대신 저장 한 번에
 * 걸리는 시간보다 짧게 잡으면 그리는 내내 쉬지 않고 저장하는 꼴이 된다. 그게 실질
 * 하한이고, 캐러셀 저장이 실측 1.7초라 5초면 그 세 배쯤 된다.
 */
const MAX_WAIT_MS = 5_000;

/** 실패 뒤 다시 보내는 간격. 2·4·8초 세 번까지 — 그 뒤로는 다음 변경·이탈을 기다린다. */
const RETRY_BASE_MS = 2_000;
const MAX_RETRIES = 3;

/** 변경 알림만 받으면 되므로 스토어 전체를 요구하지 않는다. */
interface ChangeSource {
  on(event: "change", listener: () => void): () => void;
}

export interface AutoSave {
  /** 저장 안 된 변경이 남아 있다. 헤더가 «변경됨»을 그리는 데 쓴다. */
  dirty: boolean;
  /**
   * 지금 보낸다. 저장 버튼·⌘S 도 이 길로 온다 — 자동저장과 따로 보내면 서버가
   * 겹친 요청을 "처리 중"으로 거절한다. `manual` 은 바뀐 게 없어도 보낸다(앱이 그
   * 이유로 무거운 뒷일을 한다). 저장까지 끝났으면 true.
   */
  flush: (reason: SaveReason) => Promise<boolean>;
}

/**
 * 문서가 바뀌면 잠잠해진 뒤에 한 번 저장한다.
 *
 * 1. **한 번에 하나만 보낸다.** 상세페이지 서버는 저장을 멱등키로 직렬화해서, 겹쳐
 *    보내면 뒤엣것이 "처리 중"으로 거절당한다. 보내는 동안 또 바뀌었거나 저장 버튼을
 *    눌렀으면 끝난 뒤에 한 번 더 — 밀린 것이 몇 번이든 요청은 하나로 접힌다.
 * 2. **탭을 닫거나 숨기면 기다리지 않는다.** 디바운스를 기다리다 창이 닫히면 그
 *    구간의 편집이 통째로 사라진다. 이탈 저장은 `leave` 로 가고, 페이지가 내려가는
 *    중에도 요청이 살아남게 하는 것(`fetch(…, { keepalive: true })`·`sendBeacon`)은
 *    **호스트의 몫**이다 — 편집기는 `onSave` 만 알고 전송 수단을 모른다. 그래도 못
 *    보낸 채 닫힐 수 있으니, 변경이 남아 있으면 `beforeunload` 로 한 번 붙잡는다.
 * 3. **실패는 알리고 다시 보낸다.** 연속 실패의 첫 번째(와 저장 버튼 실패)만
 *    `onError` 로 알린다 — 재시도마다 토스트가 쌓이면 소음이다. 2·4·8초 뒤 세 번까지
 *    다시 보내고, 그 사이 다른 저장이 성공하면 재시도는 접는다. `retry` 가 false 를
 *    주는 실패(충돌)는 다시 보내 봐야 또 거절이라 안 보낸다. dirty 는 남는다.
 * 4. **기다림에 상한이 있다.** 편집 한 번마다 디바운스가 처음부터 다시 돌아가므로,
 *    손을 안 떼고 계속 그리면 요청이 영영 안 나간다. 첫 변경으로부터 `MAX_WAIT_MS`
 *    가 지나면 아직 그리는 중이어도 한 번 내보낸다.
 *
 * `delayMs` 가 없으면 스스로는 안 보낸다 — 자동저장을 아직 안 켠 화면이 그렇다.
 * dirty 추적·`flush`·`beforeunload` 는 그때도 돈다.
 */
export function useAutoSave(options: {
  store: ChangeSource;
  delayMs?: number;
  save: (reason: SaveReason) => Promise<void>;
  onError?: (error: unknown, reason: SaveReason) => void;
  /** 이 실패를 다시 보낼 가치가 있는가. 없으면 전부 다시 보낸다. */
  retry?: (error: unknown) => boolean;
}): AutoSave {
  const { store, delayMs } = options;
  // 콜백은 매 렌더 새로 온다. 구독을 그때마다 다시 걸면 디바운스가 초기화되므로
  // 최신 것만 상자에 담아 둔다.
  const optsRef = useRef(options);
  optsRef.current = options;

  const [dirty, setDirty] = useState(false);
  const stateRef = useRef({
    dirty: false,
    /** 저장 버튼이 눌렸다 — 바뀐 게 없어도 한 번 보낸다. */
    manual: false,
    running: null as Promise<boolean> | null,
    retries: 0,
    retryTimer: null as ReturnType<typeof setTimeout> | null,
    live: true,
  });

  const mark = useCallback((next: boolean) => {
    const s = stateRef.current;
    s.dirty = next;
    if (s.live) setDirty(next);
  }, []);

  const flush = useCallback(
    (reason: SaveReason): Promise<boolean> => {
      const s = stateRef.current;
      if (reason === "manual") s.manual = true;
      if (s.running) return s.running;

      const drain = async (): Promise<boolean> => {
        let saved = false;
        while (s.dirty || s.manual) {
          const why: SaveReason = s.manual ? "manual" : reason;
          s.manual = false;
          mark(false);
          try {
            await optsRef.current.save(why);
          } catch (error) {
            mark(true);
            const { onError, retry } = optsRef.current;
            if (s.retries === 0 || why === "manual") onError?.(error, why);
            if (s.live && s.retries < MAX_RETRIES && (retry?.(error) ?? true)) {
              const wait = RETRY_BASE_MS * 2 ** s.retries;
              s.retries += 1;
              if (s.retryTimer) clearTimeout(s.retryTimer);
              s.retryTimer = setTimeout(() => {
                s.retryTimer = null;
                void flush("auto");
              }, wait);
            }
            return false;
          }
          saved = true;
          // 성공했으면 밀린 재시도는 필요 없다.
          s.retries = 0;
          if (s.retryTimer) {
            clearTimeout(s.retryTimer);
            s.retryTimer = null;
          }
        }
        return saved;
      };

      const run = drain().finally(() => {
        s.running = null;
      });
      s.running = run;
      return run;
    },
    [mark],
  );

  useEffect(() => {
    const s = stateRef.current;
    s.live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 이번 저장 묶음의 첫 변경 시각. 상한을 재는 기준이고, 내보낸 뒤 0 으로 돌아간다.
    let firstChangeAt = 0;

    const off = store.on("change", () => {
      mark(true);
      if (!delayMs) return;
      const now = Date.now();
      if (!firstChangeAt) firstChangeAt = now;
      if (timer) clearTimeout(timer);
      // 잠잠해지면 `delayMs` 뒤에, 계속 그리는 중이면 상한에 걸려 그보다 먼저 나간다.
      const wait = Math.max(0, Math.min(delayMs, firstChangeAt + MAX_WAIT_MS - now));
      timer = setTimeout(() => {
        timer = null;
        firstChangeAt = 0;
        void flush("auto");
      }, wait);
    });

    const leave = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      firstChangeAt = 0;
      if (delayMs) void flush("leave");
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") leave();
    };
    // 보내는 중인 것도 아직 저장된 게 아니다 — 창이 닫히면 요청이 끊길 수 있다.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!s.dirty && !s.running) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("pagehide", leave);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      off();
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHidden);
      // 편집기를 떠나는 것도 이탈이다 — 다른 화면으로 넘어가는 길이 여기뿐이다.
      // 떠난 뒤에는 재시도를 걸지 않는다(아래 live=false).
      s.live = false;
      if (s.retryTimer) {
        clearTimeout(s.retryTimer);
        s.retryTimer = null;
      }
      leave();
    };
  }, [store, delayMs, flush, mark]);

  return { dirty, flush };
}
