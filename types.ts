/**
 * leviosa-canvas — 문서 타입.
 *
 * 저장 포맷은 **Polotno JSON 그대로**다. 브랜드 템플릿·아키타입·디컴포저·웜풀·
 * sync·S3 스냅샷·export 4경로가 전부 이 포맷 위에 서 있으므로, 새 엔진은 포맷을
 * 바꾸지 않고 읽고 쓴다. 그래서 여기 타입들은 전부 "우리가 아는 필드 + 나머지 전부"
 * 형태다 — 우리가 모르는 필드도 이름 그대로 살아 나가야 한다(무손실 라운드트립).
 */

/** 요소/페이지/문서가 들고 있는 원본 JSON 필드 한 벌. */
export type Attrs = Record<string, unknown>;

/** 컨테이너(페이지·그룹)가 자식을 담는 키. 트리로 승격되므로 attrs에서는 뺀다. */
export const CHILDREN_KEY = "children";

export type ElementJson = Attrs & {
  id?: string;
  type?: string;
  children?: ElementJson[];
};

export type PageJson = Attrs & {
  id?: string;
  children?: ElementJson[];
};

export type DocumentJson = Attrs & {
  width?: number;
  height?: number;
  pages?: PageJson[];
  fonts?: unknown[];
};

export function num(attrs: Attrs, key: string, fallback: number): number {
  const value = attrs[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function str(attrs: Attrs, key: string, fallback = ""): string {
  const value = attrs[key];
  return typeof value === "string" ? value : fallback;
}

export function bool(attrs: Attrs, key: string, fallback = false): boolean {
  const value = attrs[key];
  return typeof value === "boolean" ? value : fallback;
}

export function asRecord(value: unknown): Attrs {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Attrs)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * 요소 id. Polotno가 쓰던 nanoid와 자리만 같으면 되고 형식은 우리 것이다.
 * 문서 안에서 유일하면 충분하다 — 전역 유일성을 약속하지 않는다.
 */
let idSeed = 0;
export function createId(prefix = "lc"): string {
  idSeed += 1;
  return `${prefix}${idSeed.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 자식을 가질 수 있는 요소 타입. 페이지는 늘 컨테이너라 여기 없다. */
export function isContainerType(type: string): boolean {
  return type === "group";
}
