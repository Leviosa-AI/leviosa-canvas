/**
 * 새 상품 브리프 초안 — 시작 화면(`/branding/detail-page-generator/new`)과 생성 화면
 * 사이의 **손바꿈**.
 *
 * ## 왜 쿼리스트링을 그만두는가
 *
 * 예전에는 다이얼로그가 `?new=1&name=…&kind=…&memo=…` 로 넘겼다. 글자 세 개일 때는
 * 그것으로 됐다. 사진이 들어오는 순간 끝난다 — 주소창에 그림을 태울 수는 없다.
 *
 * ## 왜 세 겹인가
 *
 * 1. **메모리** — 같은 탭에서 바로 이어지는 이동의 빠른 길이다. 저장소를 안 건드린다.
 * 2. **IndexedDB** — 미리보기와 디자인 레퍼런스(둘 다 data URI)가 여기 산다. 한도가
 *    사실상 없어서 4MB 짜리 레퍼런스 여섯 장도 받는다. **새로고침을 견디는 것이
 *    이 겹이다.**
 * 3. **`sessionStorage`** — 글자와 S3 키만. IndexedDB 가 막힌 브라우저(잠긴 WebView,
 *    일부 비공개 모드)에서 마지막으로 남는 몫이다. 그림을 안 실으므로 한도를 넘길
 *    일이 없다.
 *
 * 아래로 갈수록 잃는 것이 많고, 위가 실패해야 아래로 떨어진다.
 *
 * ## 왜 읽기가 비동기인가
 *
 * IndexedDB 가 비동기라서다. 대신 한 번 읽으면 메모리에 얹어 두고, 같은 초안을 다시
 * 물으면 저장소까지 가지 않는다 — 화면이 리렌더될 때마다 디스크를 두드리면 안 된다.
 *
 * ## 왜 초안이 하나인가
 *
 * 초안은 "지금 만들던 것" 하나뿐이다. 여러 개를 쌓아 두면 어느 것이 살아 있는지
 * 화면이 알 수 없고, 지우는 시점도 정할 수 없다. 새로 저장하면 앞의 것을 덮는다.
 * 대신 오래된 것은 :data:`MAX_DRAFT_AGE_MS` 를 넘기면 스스로 없는 셈이 된다 —
 * 지난달에 만들다 만 초안이 오늘 불쑥 돌아오면 그것대로 사고다.
 */

import type { DesignReferenceAspect } from "./design-reference";
import {
  deleteStoredDraft,
  readStoredDraft,
  writeStoredDraft,
} from "./new-product-draft-store";

const STORAGE_KEY = "leviosa.detail-page.new-product-draft.v1";

/** 이만큼 지난 초안은 없는 것으로 친다. */
export const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 이미 브랜드 버킷에 올라간 사진 한 장. */
export interface NewProductDraftImage {
  name: string;
  s3Key: string;
  contentType: string;
  size: number;
  /**
   * 브라우저가 만든 미리보기(data URI). IndexedDB 에 실리므로 새로고침을 견딘다.
   * IndexedDB 가 막힌 자리에서만 비어 있다 — 그림이 안 보일 뿐, 사진은 이미 S3 에
   * 올라가 있어 생성에는 영향이 없다.
   */
  previewUrl?: string;
}

/** 아직 판독하지 않은 디자인 레퍼런스 한 장. */
export interface NewProductDraftReference {
  uri: string;
  aspects: DesignReferenceAspect[];
  /**
   * 줄이면서 함께 잰 비전 입력 토큰. 판독 값이 장수가 아니라 이 크기로 정해지므로
   * 같이 넘긴다 — 안 넘기면 넘어온 그림만 "크기 모름"으로 떨어져 비싼 쪽으로 잡힌다.
   * 0 은 못 쟀다는 뜻이다.
   */
  inputTokens: number;
  /**
   * 줄인 뒤의 가로세로. 세로로 긴 캡쳐는 서버가 조각내 싣고 그 조각 수가 **몇 장을
   * 붙였는지**에 따라 달라져서, 굳혀 둔 토큰 수 하나로는 값을 낼 수 없다.
   *
   * 이 필드가 없던 시절의 초안도 그대로 열려야 하므로 선택이다 — 그때는 위
   * ``inputTokens`` 로 떨어진다(세로로 긴 장이면 값을 낮게 잡는다).
   */
  width?: number;
  height?: number;
}

export interface NewProductDraft {
  id: string;
  name: string;
  kind: string;
  description: string;
  appeal: string;
  spec: string;
  targetGender: string;
  targetAge: string;
  designTone: string;
  /** 페이지에 실릴 상품 사진. 시작 화면이 **최소 한 장**을 요구한다. */
  productImages: NewProductDraftImage[];
  /** 모델·연출 사진. 없어도 된다. */
  modelImages: NewProductDraftImage[];
  /** 페이지에 실리지 않는 참고 그림. 판독은 생성 화면에서 누른다. */
  references: NewProductDraftReference[];
  /** 저장한 시각. 오래된 초안을 걸러내는 데만 쓴다. */
  savedAt: number;
}

export type NewProductDraftInput = Omit<NewProductDraft, "id" | "savedAt">;

/** 저장소까지 가지 않고 답하는 몫. 마지막으로 저장했거나 읽어 온 초안 하나다. */
let cached: NewProductDraft | null = null;
/** 같은 초안을 동시에 물었을 때 저장소를 두 번 두드리지 않게 붙잡아 두는 약속. */
let inflight: { id: string; promise: Promise<NewProductDraft | null> } | null = null;
let seq = 0;

function nextId(): string {
  seq += 1;
  return `npd-${Date.now().toString(36)}-${seq.toString(36)}`;
}

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // 사파리 비공개 모드처럼 접근 자체가 던지는 자리가 있다.
    return null;
  }
}

/** `sessionStorage` 에 실을 가벼운 몫 — 그림 바이트를 뺀 나머지. */
function lightweight(draft: NewProductDraft): NewProductDraft {
  const strip = (images: NewProductDraftImage[]): NewProductDraftImage[] =>
    images.map(({ previewUrl: _preview, ...rest }) => rest);
  return {
    ...draft,
    productImages: strip(draft.productImages),
    modelImages: strip(draft.modelImages),
    references: [],
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function fresh(savedAt: unknown): boolean {
  // 시각을 못 읽으면 오래된 것으로 치지 않는다 — 예전 초안에는 이 값이 없다.
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return true;
  return Date.now() - savedAt <= MAX_DRAFT_AGE_MS;
}

function images(value: unknown, withPreview: boolean): NewProductDraftImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const s3Key = text(item.s3Key);
    if (!s3Key) return [];
    const preview = withPreview ? text(item.previewUrl) : "";
    return [
      {
        name: text(item.name),
        s3Key,
        contentType: text(item.contentType) || "image/jpeg",
        size: typeof item.size === "number" ? item.size : 0,
        ...(preview ? { previewUrl: preview } : {}),
      },
    ];
  });
}

function references(value: unknown): NewProductDraftReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const uri = text(item.uri);
    if (!uri) return [];
    const aspects = Array.isArray(item.aspects)
      ? (item.aspects.filter((one) => typeof one === "string") as DesignReferenceAspect[])
      : [];
    return [
      {
        uri,
        aspects,
        inputTokens: typeof item.inputTokens === "number" ? item.inputTokens : 0,
        ...(typeof item.width === "number" ? { width: item.width } : {}),
        ...(typeof item.height === "number" ? { height: item.height } : {}),
      },
    ];
  });
}

function hydrate(
  record: Record<string, unknown>,
  id: string,
  withImages: boolean,
): NewProductDraft {
  return {
    id,
    name: text(record.name),
    kind: text(record.kind),
    description: text(record.description),
    appeal: text(record.appeal),
    spec: text(record.spec),
    targetGender: text(record.targetGender) || "N",
    targetAge: text(record.targetAge) || "30",
    designTone: text(record.designTone) || "info",
    productImages: images(record.productImages, withImages),
    modelImages: images(record.modelImages, withImages),
    references: withImages ? references(record.references) : [],
    savedAt: typeof record.savedAt === "number" ? record.savedAt : 0,
  };
}

/**
 * 저장하고 초안 id 를 돌려준다. 이 id 를 `?new=1&draft=<id>` 로 넘긴다.
 *
 * 저장소 쓰기가 실패해도 던지지 않는다 — 메모리 사본이 이미 완전하므로 바로 이어지는
 * 이동은 멀쩡히 산다. 잃는 것은 새로고침 복구뿐이다.
 */
export async function saveNewProductDraft(input: NewProductDraftInput): Promise<string> {
  const draft: NewProductDraft = { ...input, id: nextId(), savedAt: Date.now() };
  cached = draft;
  inflight = null;
  try {
    session()?.setItem(STORAGE_KEY, JSON.stringify(lightweight(draft)));
  } catch {
    // 한도를 넘겼거나 저장소가 막혔다. 아래 IndexedDB 와 메모리로 계속 간다.
  }
  await writeStoredDraft(draft);
  return draft.id;
}

/**
 * id 가 맞는 초안을 돌려준다.
 *
 * 메모리 → IndexedDB → `sessionStorage` 순으로 찾는다. 앞에서 찾을수록 완전하다.
 * IndexedDB 에서 찾아 왔으면 메모리에 얹어 두고 다음부터는 거기서 답한다.
 */
export async function readNewProductDraft(id: string): Promise<NewProductDraft | null> {
  if (!id) return null;
  if (cached?.id === id) return fresh(cached.savedAt) ? cached : null;
  if (inflight?.id === id) return inflight.promise;

  const promise = loadDraft(id);
  inflight = { id, promise };
  try {
    return await promise;
  } finally {
    if (inflight?.promise === promise) inflight = null;
  }
}

async function loadDraft(id: string): Promise<NewProductDraft | null> {
  const stored = await readStoredDraft();
  if (stored && typeof stored === "object") {
    const record = stored as Record<string, unknown>;
    if (text(record.id) === id && fresh(record.savedAt)) {
      const draft = hydrate(record, id, true);
      cached = draft;
      return draft;
    }
  }

  const raw = (() => {
    try {
      return session()?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  })();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (text(record.id) !== id || !fresh(record.savedAt)) return null;

  // 그림 없는 몫이다. 메모리에 얹지 않는다 — 나중에 IndexedDB 가 풀리면 완전한 사본을
  // 다시 받을 수 있어야 한다.
  return hydrate(record, id, false);
}

/** 초안을 버린다. 로그아웃처럼 이 브라우저에서 흔적을 지울 때 부른다. */
export async function clearNewProductDraft(): Promise<void> {
  cached = null;
  inflight = null;
  try {
    session()?.removeItem(STORAGE_KEY);
  } catch {
    // 지우지 못해도 다음 저장이 덮는다.
  }
  await deleteStoredDraft();
}
