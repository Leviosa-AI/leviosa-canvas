import { useEffect, useRef, useState } from "react";

export type SaveReason = "auto" | "manual" | "leave";

/**
 * 첫 변경으로부터 여기까지는 기다려 준다. 디바운스만 두면 계속 그리는 동안 한 번도
 * 안 나가므로, 편집 중이어도 이 간격마다 한 번은 저장된다.
 */
const MAX_WAIT_MS = 15_000;

/** 변경 알림만 받으면 되므로 스토어 전체를 요구하지 않는다. */
interface ChangeSource {
  on(event: "change", listener: () => void): () => void;
}

/**
 * 문서가 바뀌면 잠잠해진 뒤에 한 번 저장한다.
 *
 * 규칙 넷이 전부다.
 *
 * 1. **한 번에 하나만 보낸다.** 상세페이지 서버는 저장을 멱등키로 직렬화해서, 겹쳐
 *    보내면 뒤엣것이 "처리 중"으로 거절당한다. 보내는 동안 또 바뀌었으면 끝난 뒤에
 *    한 번 더 — 밀린 변경이 몇 번이든 요청은 하나로 접힌다.
 * 2. **탭을 닫거나 숨기면 기다리지 않는다.** 디바운스를 기다리다 창이 닫히면 그
 *    구간의 편집이 통째로 사라진다.
 * 3. **실패는 삼키되 잊지 않는다.** dirty 를 되돌려 두면 다음 변경이나 다음 이탈에
 *    다시 나간다. 자동저장이 실패했다고 편집을 막을 일은 아니고, 그렇다고 곧바로
 *    다시 보내지도 않는다 — 서버가 죽어 있는 동안 요청을 쉬지 않고 때리게 된다.
 * 4. **기다림에 상한이 있다.** 편집 한 번마다 디바운스가 처음부터 다시 돌아가므로,
 *    손을 안 떼고 계속 그리면 요청이 영영 안 나간다. 첫 변경으로부터 `MAX_WAIT_MS`
 *    가 지나면 아직 그리는 중이어도 한 번 내보낸다.
 *
 * `delayMs` 가 없으면 아무것도 안 한다 — 자동저장을 아직 안 켠 화면이 그렇다.
 *
 * @returns 저장 안 된 변경이 남아 있는지. 헤더가 «변경됨»을 그리는 데 쓴다.
 */
export function useAutoSave(options: {
  store: ChangeSource;
  delayMs?: number;
  save: (reason: SaveReason) => Promise<void>;
}): boolean {
  const { store, delayMs } = options;
  // 저장 함수는 매 렌더 새로 온다. 구독을 그때마다 다시 걸면 디바운스가 초기화되므로
  // 최신 것만 상자에 담아 둔다.
  const saveRef = useRef(options.save);
  saveRef.current = options.save;

  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!delayMs) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let live = true;

    const mark = (next: boolean) => {
      dirtyRef.current = next;
      if (live) setDirty(next);
    };

    const flush = async (reason: SaveReason): Promise<void> => {
      if (!dirtyRef.current || runningRef.current) return;
      mark(false);
      runningRef.current = true;
      let sent = false;
      try {
        await saveRef.current(reason);
        sent = true;
      } catch {
        mark(true);
      } finally {
        runningRef.current = false;
      }
      // 성공했을 때만 이어서 보낸다. 실패한 것을 곧바로 다시 보내면 서버가 죽어 있는
      // 동안 요청을 쉬지 않고 때린다 — 다음 변경이나 다음 이탈까지 기다린다.
      if (sent && dirtyRef.current) await flush(reason);
    };

    // 이번 저장 묶음의 첫 변경 시각. 상한을 재는 기준이고, 내보낸 뒤 0 으로 돌아간다.
    let firstChangeAt = 0;

    const off = store.on("change", () => {
      mark(true);
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
      void flush("leave");
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") leave();
    };

    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      live = false;
      off();
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onHidden);
      // 편집기를 떠나는 것도 이탈이다 — 다른 화면으로 넘어가는 길이 여기뿐이다.
      leave();
    };
  }, [store, delayMs]);

  return dirty;
}
