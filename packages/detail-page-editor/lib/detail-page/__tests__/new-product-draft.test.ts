import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// IndexedDB 는 jsdom 에 없다. 통 하나만 흉내 낸다 — 실제 저장소는 넣고 빼는 것 말고
// 하는 일이 없으므로, 여기서 확인할 것은 "무엇을 어느 겹에 실었는가"다.
// `vi.hoisted` 라 `vi.resetModules()`(=새로고침) 뒤에도 통은 그대로 남는다.
const idb = vi.hoisted(() => ({ slot: null as unknown, blocked: false }));

vi.mock("../new-product-draft-store", () => ({
  readStoredDraft: async () => (idb.blocked ? null : idb.slot),
  writeStoredDraft: async (value: unknown) => {
    // 진짜 IndexedDB 도 구조적 복제로 담는다. 참조를 그대로 들고 있으면 메모리 사본과
    // 저장 사본이 같은 물건이 되어 겹이 갈렸는지 확인할 수 없다.
    if (!idb.blocked) idb.slot = structuredClone(value);
  },
  deleteStoredDraft: async () => {
    idb.slot = null;
  },
}));

import {
  clearNewProductDraft,
  readNewProductDraft,
  saveNewProductDraft,
  MAX_DRAFT_AGE_MS,
  type NewProductDraftInput,
} from "../new-product-draft";

const STORAGE_KEY = "leviosa.detail-page.new-product-draft.v1";

function draftInput(overrides: Partial<NewProductDraftInput> = {}): NewProductDraftInput {
  return {
    name: "무선 미니 가습기",
    kind: "생활가전",
    description: "조용하고 세척이 쉬운 가습기입니다.",
    appeal: "28dB 저소음",
    spec: "본체 120×120×210mm",
    targetGender: "F",
    targetAge: "20",
    designTone: "minimal",
    productImages: [
      {
        name: "front.jpg",
        s3Key: "brand/1/front.jpg",
        contentType: "image/jpeg",
        size: 1234,
        previewUrl: "data:image/jpeg;base64,AAAA",
      },
    ],
    modelImages: [
      {
        name: "model.jpg",
        s3Key: "brand/1/model.jpg",
        contentType: "image/jpeg",
        size: 5678,
        previewUrl: "data:image/jpeg;base64,BBBB",
      },
    ],
    references: [
      {
        uri: "data:image/png;base64,CCCC",
        aspects: ["palette", "layout"],
        inputTokens: 1105,
      },
    ],
    ...overrides,
  };
}

/** 새로고침 = 모듈 메모리만 사라지고 저장소는 남는다. */
async function reload() {
  vi.resetModules();
  return import("../new-product-draft");
}

beforeEach(async () => {
  idb.blocked = false;
  await clearNewProductDraft();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("new-product-draft", () => {
  it("hands the whole draft over, photos and references included", async () => {
    const id = await saveNewProductDraft(draftInput());
    const draft = await readNewProductDraft(id);

    expect(draft?.description).toBe("조용하고 세척이 쉬운 가습기입니다.");
    expect(draft?.productImages).toHaveLength(1);
    expect(draft?.productImages[0].previewUrl).toBe("data:image/jpeg;base64,AAAA");
    // 판독 값이 장수가 아니라 그림 크기로 정해진다. 크기를 안 넘기면 넘어온 그림만
    // "모름"으로 떨어져 비싼 쪽으로 잡힌다.
    expect(draft?.references).toEqual([
      {
        uri: "data:image/png;base64,CCCC",
        aspects: ["palette", "layout"],
        inputTokens: 1105,
      },
    ]);
  });

  it("answers only to its own id", async () => {
    const id = await saveNewProductDraft(draftInput());

    expect(await readNewProductDraft(`${id}-nope`)).toBeNull();
    expect(await readNewProductDraft("")).toBeNull();
  });

  it("gives every save a fresh id so a later draft never answers to the earlier one", async () => {
    const first = await saveNewProductDraft(draftInput({ name: "가습기" }));
    const second = await saveNewProductDraft(draftInput({ name: "제습기" }));

    expect(second).not.toBe(first);
    expect((await readNewProductDraft(second))?.name).toBe("제습기");
    expect(await readNewProductDraft(first)).toBeNull();
  });

  // 레퍼런스 한 장이 4MB 까지 허용된다. 여섯 장을 sessionStorage 에 그대로 실으면 한도를
  // 넘겨 쓰기가 통째로 실패하고, 글자까지 같이 잃는다.
  it("keeps image bytes out of sessionStorage", async () => {
    await saveNewProductDraft(draftInput());

    const stored = sessionStorage.getItem(STORAGE_KEY) ?? "";
    expect(stored).not.toContain("data:image");
    expect(stored).toContain("brand/1/front.jpg");
  });

  // 이 파일의 요점. 새로고침 한 번에 붙여 둔 레퍼런스가 날아가면 유저는 그것을 다시
  // 고르고 다시 태그해야 한다.
  it("survives a reload whole — previews and references included", async () => {
    const id = await saveNewProductDraft(draftInput());
    const reloaded = await reload();

    const draft = await reloaded.readNewProductDraft(id);
    expect(draft?.name).toBe("무선 미니 가습기");
    expect(draft?.designTone).toBe("minimal");
    expect(draft?.productImages[0].previewUrl).toBe("data:image/jpeg;base64,AAAA");
    expect(draft?.references).toEqual([
      {
        uri: "data:image/png;base64,CCCC",
        aspects: ["palette", "layout"],
        inputTokens: 1105,
      },
    ]);
  });

  it("falls back to the text and the uploaded keys when IndexedDB is unavailable", async () => {
    const id = await saveNewProductDraft(draftInput());
    // 잠긴 WebView·일부 비공개 모드. 그래도 글자와 S3 키는 남아 생성은 그대로 된다.
    idb.blocked = true;
    const reloaded = await reload();

    const draft = await reloaded.readNewProductDraft(id);
    expect(draft?.description).toBe("조용하고 세척이 쉬운 가습기입니다.");
    expect(draft?.productImages[0].s3Key).toBe("brand/1/front.jpg");
    expect(draft?.productImages[0].previewUrl).toBeUndefined();
    expect(draft?.references).toEqual([]);
  });

  it("reads storage once for repeated asks", async () => {
    const id = await saveNewProductDraft(draftInput());
    const reloaded = await reload();
    const store = await import("../new-product-draft-store");
    const spy = vi.spyOn(store, "readStoredDraft");

    await reloaded.readNewProductDraft(id);
    await reloaded.readNewProductDraft(id);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not stack storage reads when two askers land together", async () => {
    const id = await saveNewProductDraft(draftInput());
    const reloaded = await reload();
    const store = await import("../new-product-draft-store");
    const spy = vi.spyOn(store, "readStoredDraft");

    await Promise.all([
      reloaded.readNewProductDraft(id),
      reloaded.readNewProductDraft(id),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("still hands over in-memory when sessionStorage refuses the write", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const id = await saveNewProductDraft(draftInput());
    expect((await readNewProductDraft(id))?.name).toBe("무선 미니 가습기");
  });

  it("returns null for junk in storage instead of throwing", async () => {
    const id = await saveNewProductDraft(draftInput());
    idb.slot = null;
    sessionStorage.setItem(STORAGE_KEY, "{ not json");
    const reloaded = await reload();

    expect(await reloaded.readNewProductDraft(id)).toBeNull();
  });

  it("drops stored images that lost their key", async () => {
    const id = await saveNewProductDraft(draftInput());
    idb.slot = { id, name: "가습기", productImages: [{ name: "front.jpg" }] };
    const reloaded = await reload();

    expect((await reloaded.readNewProductDraft(id))?.productImages).toEqual([]);
  });

  // IndexedDB 는 탭을 닫아도 남는다. 지난달에 만들다 만 초안이 오늘 불쑥 돌아오면
  // 그것대로 사고다.
  it("forgets a draft that sat too long", async () => {
    const id = await saveNewProductDraft(draftInput());
    const aged = Date.now() - MAX_DRAFT_AGE_MS - 1;
    (idb.slot as { savedAt: number }).savedAt = aged;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}"), savedAt: aged }),
    );
    const reloaded = await reload();

    expect(await reloaded.readNewProductDraft(id)).toBeNull();
  });

  it("clears every copy", async () => {
    const id = await saveNewProductDraft(draftInput());
    await clearNewProductDraft();

    expect(await readNewProductDraft(id)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(idb.slot).toBeNull();
  });
});
