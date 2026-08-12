/**
 * 새 상품 초안의 **무거운 몫**을 담아 두는 IndexedDB 한 칸.
 *
 * `sessionStorage` 는 보통 5MB 에서 막힌다. 레퍼런스 한 장이 4MB 까지 허용되므로
 * (`MAX_REFERENCE_UPLOAD_BYTES`) 여섯 장이면 그 한도를 우습게 넘고, 넘기면 쓰기가
 * **통째로** 실패해서 글자까지 같이 잃는다. IndexedDB 에는 그 한도가 없다.
 *
 * 열고 읽고 쓰고 지우는 것만 여기 둔다. 무엇을 담을지는 `new-product-draft` 가
 * 정한다 — 이 칸은 그냥 통이다. 전부 best-effort 라 실패는 `null` / no-op 으로
 * 떨어진다. 초안은 편의지 정합성의 근거가 아니다.
 */

const DB_NAME = "leviosa-detail-page";
const DB_VERSION = 1;
const STORE = "new-product-draft";
/**
 * 칸은 하나다. 초안은 "지금 만들던 것" 하나뿐이고, 여러 개를 쌓으면 어느 것이 살아
 * 있는지 화면이 알 수 없다. 새로 저장하면 앞의 것을 덮는다.
 *
 * 탭 단위가 아니라 오리진 단위라, 두 탭에서 동시에 만들면 나중 탭이 이 칸을 덮는다.
 * 그때 앞 탭은 자기 `sessionStorage`(탭 단위) 몫으로 떨어진다 — 글자와 S3 키는 남고
 * 그림만 잃는 예전 동작이다.
 */
const KEY = "current";

function available(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    // 잠긴 WebView 처럼 접근 자체가 던지는 자리가 있다.
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("indexedDB open blocked"));
  });
}

/** 담긴 것을 그대로 돌려준다. 없거나 못 읽으면 `null`. */
export async function readStoredDraft(): Promise<unknown> {
  if (!available()) return null;
  try {
    const db = await openDb();
    return await new Promise<unknown>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

/** 통을 덮어쓴다. 한도를 넘겼거나 저장소가 막혔으면 조용히 지나간다. */
export async function writeStoredDraft(value: unknown): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, KEY);
      const finish = () => {
        db.close();
        resolve();
      };
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
    });
  } catch {
    // best-effort — 메모리 사본으로 계속 간다.
  }
}

/** 통을 비운다. */
export async function deleteStoredDraft(): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      const finish = () => {
        db.close();
        resolve();
      };
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
    });
  } catch {
    // 지우지 못해도 다음 저장이 덮는다.
  }
}
