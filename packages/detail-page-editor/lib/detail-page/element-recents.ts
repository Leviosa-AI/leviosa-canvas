/**
 * 요소 서랍의 "최근 사용 / 즐겨찾기".
 *
 * 상세페이지는 같은 배지·구분선·체크 아이콘을 20섹션 내내 반복해서 넣는다. 그때마다 다시
 * 검색하는 것이 지금의 값이라 **검색의 절반은 "다시 안 찾기"** 다.
 *
 * ## 왜 마크업을 통째로 들고 있나
 *
 * 식별자(`"tabler:truck"`)만 저장하면 다시 넣을 때 제공처를 또 두드려야 하고, 세트에서
 * 아이콘이 사라지면 최근 목록이 죽는다. 마크업은 아이콘 하나에 수백 바이트라 통째로
 * 들고 있는 편이 싸고 확실하다.
 *
 * ## 왜 서버가 아니라 localStorage 인가
 *
 * 브랜드가 아니라 **사람의 손버릇**이다. 같은 브랜드를 여럿이 만져도 각자 최근이 다르고,
 * 이걸 서버에 두면 테이블·RLS·동기화가 붙는데 값에 비해 비싸다. 오래 두고 팀이 공유할
 * 자산은 이미 "내 도형"이 맡는다.
 */

const STORAGE_KEY = "leviosa.detail-page.element-recents";

/** 최근은 짧게. 길면 스트립이 스크롤이 되고 스트립인 이유가 사라진다. */
const RECENT_MAX = 24;
/** 즐겨찾기는 사람이 직접 고른 것이라 넉넉히. */
const PINNED_MAX = 48;
/** localStorage 한도(보통 5MB)를 혼자 먹지 않게. 넘치면 오래된 최근부터 버린다. */
const BYTE_BUDGET = 512 * 1024;

export type ElementRecent = {
  /** 같은 것인지 판정하는 키. 아이콘은 `"tabler:truck"`, 그 밖은 용도별 접두사를 붙인다. */
  key: string;
  markup: string;
  viewBox: string;
  /** 툴팁에 쓰는 사람 말. 없으면 키를 쓴다. */
  label?: string;
};

export type ElementRecentsState = {
  recent: ElementRecent[];
  pinned: ElementRecent[];
};

const EMPTY: ElementRecentsState = { recent: [], pinned: [] };

let cache: ElementRecentsState | null = null;
const listeners = new Set<() => void>();

function isEntry(value: unknown): value is ElementRecent {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.key === "string" &&
    entry.key.length > 0 &&
    typeof entry.markup === "string" &&
    entry.markup.length > 0 &&
    typeof entry.viewBox === "string"
  );
}

function sanitize(list: unknown, max: number): ElementRecent[] {
  if (!Array.isArray(list)) return [];
  const out: ElementRecent[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!isEntry(item) || seen.has(item.key)) continue;
    seen.add(item.key);
    out.push({
      key: item.key,
      markup: item.markup,
      viewBox: item.viewBox,
      ...(typeof item.label === "string" ? { label: item.label } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

function read(): ElementRecentsState {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = EMPTY;
      return cache;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    cache = {
      recent: sanitize(parsed.recent, RECENT_MAX),
      pinned: sanitize(parsed.pinned, PINNED_MAX),
    };
  } catch {
    // 남이 망가뜨린 값에 편집기가 멈추면 안 된다.
    cache = EMPTY;
  }
  return cache;
}

/**
 * 예산을 넘으면 **최근 목록의 꼬리부터** 버린다. 즐겨찾기는 사람이 고른 것이라 마지막까지
 * 지킨다. 그래도 안 되면 저장을 포기한다 — 최근 목록 때문에 편집이 막히면 안 된다.
 */
function write(next: ElementRecentsState): void {
  if (typeof window === "undefined") return;
  const state: ElementRecentsState = {
    recent: next.recent.slice(0, RECENT_MAX),
    pinned: next.pinned.slice(0, PINNED_MAX),
  };
  for (;;) {
    const payload = JSON.stringify(state);
    if (payload.length <= BYTE_BUDGET) {
      try {
        window.localStorage.setItem(STORAGE_KEY, payload);
      } catch {
        // 용량 초과·프라이빗 모드. 이번 세션 동안 메모리로만 산다.
      }
      break;
    }
    if (!state.recent.length) break;
    state.recent = state.recent.slice(0, -1);
  }
  cache = state;
  for (const listener of listeners) listener();
}

export function subscribeElementRecents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getElementRecents(): ElementRecentsState {
  return read();
}

/** 넣은 것을 최근 맨 앞으로. 이미 있으면 앞으로 끌어올린다(LRU). */
export function rememberElement(entry: ElementRecent): void {
  const state = read();
  write({
    pinned: state.pinned,
    recent: [entry, ...state.recent.filter((item) => item.key !== entry.key)],
  });
}

/** 즐겨찾기 토글. 새로 꽂으면 맨 앞에 온다. */
export function toggleElementPin(entry: ElementRecent): void {
  const state = read();
  const has = state.pinned.some((item) => item.key === entry.key);
  write({
    recent: state.recent,
    pinned: has
      ? state.pinned.filter((item) => item.key !== entry.key)
      : [entry, ...state.pinned],
  });
}

export function isElementPinned(key: string): boolean {
  return read().pinned.some((item) => item.key === key);
}

export function clearElementRecents(): void {
  write({ recent: [], pinned: read().pinned });
}

/** 테스트용 — 모듈 캐시를 비운다. */
export function resetElementRecentsCache(): void {
  cache = null;
}
