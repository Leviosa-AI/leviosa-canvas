/**
 * leviosa-canvas — 문서 스토어.
 *
 * ## 요소는 JSON 그 자체다
 *
 * 요소의 JSON 필드는 **인스턴스의 열거 가능한 자기 속성**으로 얹힌다(`el.text`,
 * `el.fontSize`, `el.custom` …). 엔진이 모르는 필드도 이름 그대로 남아 있다가 그대로
 * 나간다 — 직렬화가 `{...this}` 한 줄인 이유이고, 무손실 라운드트립이 공짜인 이유다.
 *
 * 엔진 내부 상태(`store`/`parent`/`version`/`_children`)는 **열거 불가**로 박아 두어
 * 직렬화에 섞이지 않는다. 그래서 속성 쓰기는 반드시 `setAttr`(=`defineProperty`)로
 * 한다 — 프로토타입 게터를 덮어쓰려는 평범한 대입은 strict 모드에서 던진다.
 *
 * 이 배치 덕분에 `src/lib/detail-page/*`(z-order, 정렬·분배, 서식 복사, 찾기·바꾸기,
 * 그룹 액션)가 **한 줄도 안 고치고** 이 엔진 위에서 돈다. 그 모듈들은 구조적 타입으로만
 * 스토어를 받도록 짜여 있다.
 *
 * ## 반응성
 *
 * mobx도 MST도 쓰지 않는다(새 런타임 의존성 0이 하드룰이다). 스토어에 리스너 집합
 * 하나를 두고 **요소마다 `version` 숫자**를 올린다. React는
 * `useSyncExternalStore(store.subscribe, () => el.version)` 으로 붙는다 — 알림은 전부에게
 * 가지만 스냅샷이 같은 요소는 React가 리렌더를 건너뛴다.
 */

import {
  asArray,
  asRecord,
  CHILDREN_KEY,
  createId,
  isContainerType,
  type Attrs,
  type DocumentJson,
  type ElementJson,
  type PageJson,
} from "./types";

type Listener = () => void;

/** 페이지와 그룹이 공통으로 하는 일. z-order 모듈이 요구하는 형태이기도 하다. */
export interface CanvasContainer {
  readonly id: string;
  readonly children: CanvasElement[];
  /** 자식 목록이 바뀌면 올라간다 — 컨테이너를 그리는 뷰가 이 숫자만 본다. */
  version: number;
  setElementZIndex(id: string, index: number): void;
}

/** 직렬화에 섞이면 안 되는 엔진 내부 상태를 열거 불가로 박는다. */
function defineInternal(target: object, values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(target, key, {
      value,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }
}

/**
 * JSON 속성 쓰기. 평범한 대입(`el.x = 1`)을 쓰면 안 된다 — 프로토타입에 같은 이름의
 * 게터(예: 페이지의 `width`)가 있을 때 setter가 없어 strict 모드에서 던진다.
 */
function setAttr(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function assignAttrs(target: object, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (key === CHILDREN_KEY) continue;
    setAttr(target, key, value);
  }
}

function applyPatch(target: object, patch: Attrs, frozen: string[]): boolean {
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (key === CHILDREN_KEY || frozen.includes(key)) continue;
    if ((target as Attrs)[key] === value) continue;
    setAttr(target, key, value);
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// 요소
// ---------------------------------------------------------------------------

export class CanvasElement implements CanvasContainer {
  // 아래 `declare`들은 전부 타입 선언일 뿐이다(컴파일 결과에 필드를 만들지 않는다).
  // 실제 값은 JSON에서 온 자기 속성이거나, 생성자가 열거 불가로 박은 내부 상태다.
  declare readonly store: CanvasStore;
  declare parent: CanvasContainer | null;
  /** 이 요소가 바뀔 때마다 증가 — React가 이 숫자만 보고 리렌더를 결정한다. */
  declare version: number;
  /** 컨테이너 타입일 때만 배열. 아니면 null. */
  declare _children: CanvasElement[] | null;

  declare id: string;
  declare type: string;
  declare x: number;
  declare y: number;
  declare width: number;
  declare height: number;
  declare rotation?: number;
  declare opacity?: number;
  declare locked?: boolean;
  declare visible?: boolean;
  declare text?: string;
  declare src?: string;
  declare custom?: Record<string, unknown>;

  /** 엔진이 모르는 필드도 그대로 얹힌다. */
  [key: string]: unknown;

  constructor(store: CanvasStore, json: ElementJson) {
    const attrs = { ...json };
    // type은 채워 넣지 않는다 — 없던 필드를 만들면 무손실 라운드트립이 깨진다.
    if (typeof attrs.id !== "string" || !attrs.id) attrs.id = createId();
    const kids = asArray(json[CHILDREN_KEY]).map((child) => asRecord(child));

    defineInternal(this, {
      store,
      parent: null,
      version: 0,
      _children: isContainerType(
        typeof attrs.type === "string" ? attrs.type : "",
      )
        ? []
        : null,
    });
    assignAttrs(this, attrs);

    if (this._children) {
      for (const child of kids) {
        const el = new CanvasElement(store, child as ElementJson);
        el.parent = this;
        this._children.push(el);
      }
    }
  }

  get children(): CanvasElement[] {
    return this._children ?? [];
  }

  get isContainer(): boolean {
    return this._children !== null;
  }

  /** 형제 중 몇 번째인가. 부모가 없으면 -1. */
  get zIndex(): number {
    return this.parent ? this.parent.children.indexOf(this) : -1;
  }

  /** 페이지 좌표계 기준 위치 — 그룹 안 요소는 조상들의 x/y가 더해진다. */
  get absolutePosition(): { x: number; y: number } {
    let x = this.x ?? 0;
    let y = this.y ?? 0;
    let node = this.parent;
    while (node instanceof CanvasElement) {
      x += node.x ?? 0;
      y += node.y ?? 0;
      node = node.parent;
    }
    return { x, y };
  }

  set(patch: Attrs): void {
    this.store.mutate(() => {
      const changed = applyPatch(this, patch, ["id"]);
      if (changed) this.version += 1;
      return changed;
    });
  }

  setElementZIndex(id: string, index: number): void {
    reorderChild(this.store, this, this._children, id, index);
  }

  /**
   * 바로 뒤에 복제본을 끼우고 선택까지 옮긴다(`skipSelect`로 끌 수 있다).
   * 자손 id는 전부 새로 딴다 — 같은 id가 둘이면 나중에 조용히 한쪽을 잃는다.
   */
  clone(patch?: Attrs, opts?: { skipSelect?: boolean }): CanvasElement | null {
    const parent = this.parent;
    if (!parent) return null;
    const json = withFreshIds(this.toJSON());
    const copy = new CanvasElement(this.store, { ...json, ...(patch ?? {}) });
    this.store.mutate(() => {
      copy.parent = parent;
      const list = parent.children;
      list.splice(list.indexOf(this) + 1, 0, copy);
      parent.version += 1;
      return true;
    });
    if (!opts?.skipSelect) this.store.selectElements([copy.id]);
    return copy;
  }

  toJSON(): ElementJson {
    const json = { ...this } as ElementJson;
    if (this._children) {
      json[CHILDREN_KEY] = this._children.map((child) => child.toJSON());
    }
    return json;
  }
}

/** 트리 전체의 id를 새로 딴 복제본. 복제·붙여넣기가 같이 쓴다. */
export function withFreshIds(json: ElementJson): ElementJson {
  const out: ElementJson = { ...json, id: createId() };
  const children = asArray(json[CHILDREN_KEY]);
  if (children.length) {
    out[CHILDREN_KEY] = children.map((child) =>
      withFreshIds(asRecord(child) as ElementJson),
    );
  }
  return out;
}

function reorderChild(
  store: CanvasStore,
  container: CanvasContainer,
  list: CanvasElement[] | null,
  id: string,
  index: number,
): void {
  if (!list) return;
  const from = list.findIndex((child) => child.id === id);
  if (from < 0) return;
  const to = Math.max(0, Math.min(list.length - 1, index));
  if (from === to) return;
  store.mutate(() => {
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    container.version += 1;
    return true;
  });
}

// ---------------------------------------------------------------------------
// 페이지
// ---------------------------------------------------------------------------

export class CanvasPage implements CanvasContainer {
  declare readonly store: CanvasStore;
  declare version: number;
  declare readonly children: CanvasElement[];

  declare id: string;
  declare background?: string;
  declare custom?: Record<string, unknown>;

  [key: string]: unknown;

  constructor(store: CanvasStore, json: PageJson) {
    const attrs = { ...json };
    if (typeof attrs.id !== "string" || !attrs.id) attrs.id = createId("pg");
    const kids = asArray(json[CHILDREN_KEY]).map((child) => asRecord(child));

    defineInternal(this, { store, version: 0, children: [] });
    assignAttrs(this, attrs);

    for (const child of kids) {
      const el = new CanvasElement(store, child as ElementJson);
      el.parent = this;
      this.children.push(el);
    }
  }

  /**
   * 페이지 폭/높이는 개별 지정이 없을 때만 문서 값을 따른다. JSON에 있으면 그 값이
   * 자기 속성으로 얹혀 이 게터를 가린다 — 그래서 있으면 그대로, 없으면 문서 값이다.
   */
  get width(): number {
    return this.store.width;
  }
  get height(): number {
    return this.store.height;
  }

  set(patch: Attrs): void {
    this.store.mutate(() => {
      const changed = applyPatch(this, patch, ["id"]);
      if (changed) this.version += 1;
      return changed;
    });
  }

  addElement(json: ElementJson, index?: number): CanvasElement {
    const el = new CanvasElement(this.store, json);
    this.store.mutate(() => {
      el.parent = this;
      const at = index === undefined ? this.children.length : index;
      this.children.splice(
        Math.max(0, Math.min(this.children.length, at)),
        0,
        el,
      );
      this.version += 1;
      return true;
    });
    return el;
  }

  setElementZIndex(id: string, index: number): void {
    reorderChild(this.store, this, this.children, id, index);
  }

  toJSON(): PageJson {
    const json = { ...this } as PageJson;
    json[CHILDREN_KEY] = this.children.map((child) => child.toJSON());
    return json;
  }
}

// ---------------------------------------------------------------------------
// 히스토리
// ---------------------------------------------------------------------------

type Snapshot = {
  json: string;
  selection: string[];
  activePageId: string | null;
};

const HISTORY_DEPTH = 100;

export class CanvasHistory {
  private readonly store: CanvasStore;
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  /** 트랜잭션 중첩 깊이. 0보다 크면 개별 변경은 스냅샷을 남기지 않는다. */
  private depth = 0;
  private pending: Snapshot | null = null;
  /** undo/redo가 상태를 되돌리는 동안의 변경은 기록하지 않는다. */
  private applying = false;

  constructor(store: CanvasStore) {
    this.store = store;
  }

  private snapshot(): Snapshot {
    return {
      json: JSON.stringify(this.store.toJSON()),
      selection: this.store.selectedElementsIds.slice(),
      activePageId: this.store.activePageId,
    };
  }

  private push(snapshot: Snapshot): void {
    this.past.push(snapshot);
    if (this.past.length > HISTORY_DEPTH) this.past.shift();
    this.future = [];
  }

  /** 변경 **직전**에 불린다. 트랜잭션 안이면 시작 시점 것만 남긴다. */
  record(): void {
    if (this.applying || this.depth > 0) return;
    this.push(this.snapshot());
  }

  startTransaction(): void {
    if (this.applying) return;
    if (this.depth === 0) this.pending = this.snapshot();
    this.depth += 1;
  }

  endTransaction(): void {
    if (this.applying || this.depth === 0) return;
    this.depth -= 1;
    if (this.depth > 0) return;
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    // 트랜잭션이 실제로 아무것도 안 바꿨으면 undo 단계를 만들지 않는다.
    if (pending.json === JSON.stringify(this.store.toJSON())) return;
    this.push(pending);
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  private apply(snapshot: Snapshot): void {
    this.applying = true;
    try {
      this.store.loadJSON(JSON.parse(snapshot.json) as DocumentJson);
      if (snapshot.activePageId) this.store.selectPage(snapshot.activePageId);
      this.store.selectElements(snapshot.selection);
    } finally {
      this.applying = false;
    }
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.snapshot());
    this.apply(prev);
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.snapshot());
    this.apply(next);
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.pending = null;
    this.depth = 0;
  }
}

// ---------------------------------------------------------------------------
// 스토어
// ---------------------------------------------------------------------------

export class CanvasStore {
  /** `pages`를 뺀 문서 상단 필드 전부 — 그대로 다시 내보내야 한다. */
  private docAttrs: Attrs = {};
  pages: CanvasPage[] = [];
  selectedElementsIds: string[] = [];
  activePageId: string | null = null;
  /** 트리·선택·페이지 구성이 바뀔 때 증가. 요소 하나의 속성 변경은 여기 안 온다. */
  version = 0;
  readonly history = new CanvasHistory(this);
  private listeners = new Set<Listener>();
  /** mutate 중첩 — 가장 바깥에서만 알린다. */
  private notifyDepth = 0;
  private dirty = false;

  constructor(json?: DocumentJson) {
    if (json) this.loadJSON(json);
  }

  get width(): number {
    const value = this.docAttrs.width;
    return typeof value === "number" && Number.isFinite(value) ? value : 1000;
  }
  get height(): number {
    const value = this.docAttrs.height;
    return typeof value === "number" && Number.isFinite(value) ? value : 1000;
  }

  get activePage(): CanvasPage | null {
    return (
      this.pages.find((page) => page.id === this.activePageId) ??
      this.pages[0] ??
      null
    );
  }

  get selectedElements(): CanvasElement[] {
    return this.selectedElementsIds
      .map((id) => this.getElementById(id))
      .filter((el): el is CanvasElement => el !== null);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /**
   * 모든 문서 변경의 단일 통로. `run`이 true를 돌려주면 실제로 바뀐 것으로 보고
   * 히스토리에 직전 상태를 남기고 구독자에게 알린다.
   */
  mutate(run: () => boolean): void {
    if (this.notifyDepth === 0) this.history.record();
    this.notifyDepth += 1;
    try {
      if (run()) {
        this.version += 1;
        this.dirty = true;
      }
    } finally {
      this.notifyDepth -= 1;
      if (this.notifyDepth === 0 && this.dirty) {
        this.dirty = false;
        this.notify();
      }
    }
  }

  /** 히스토리를 남기지 않는 변경(선택·페이지 전환처럼 문서가 아닌 것). */
  private uiChange(run: () => boolean): void {
    if (run()) {
      this.version += 1;
      this.notify();
    }
  }

  // -- 조회 ----------------------------------------------------------------

  getElementById(id: string): CanvasElement | null {
    for (const page of this.pages) {
      const found = findInList(page.children, id);
      if (found) return found;
    }
    return null;
  }

  getPageById(id: string): CanvasPage | null {
    return this.pages.find((page) => page.id === id) ?? null;
  }

  /** 요소가 놓인 페이지. 그룹 몇 겹 안이어도 찾는다. */
  getPageOfElement(id: string): CanvasPage | null {
    for (const page of this.pages) {
      if (findInList(page.children, id)) return page;
    }
    return null;
  }

  // -- 선택 ----------------------------------------------------------------

  selectElements(ids: string[]): void {
    const next = ids.filter((id) => this.getElementById(id) !== null);
    this.uiChange(() => {
      const current = this.selectedElementsIds;
      if (
        next.length === current.length &&
        next.every((id, i) => current[i] === id)
      ) {
        return false;
      }
      this.selectedElementsIds = next;
      return true;
    });
  }

  selectPage(id: string): void {
    this.uiChange(() => {
      if (this.activePageId === id) return false;
      if (!this.getPageById(id)) return false;
      this.activePageId = id;
      return true;
    });
  }

  // -- 문서 변경 -----------------------------------------------------------

  deleteElements(ids: string[]): void {
    const targets = ids
      .map((id) => this.getElementById(id))
      .filter(
        (el): el is CanvasElement => el !== null && el.parent !== null,
      );
    if (!targets.length) return;
    this.mutate(() => {
      for (const el of targets) {
        const parent = el.parent;
        if (!parent) continue;
        const at = parent.children.indexOf(el);
        if (at >= 0) parent.children.splice(at, 1);
        parent.version += 1;
        el.parent = null;
      }
      return true;
    });
    this.selectElements(
      this.selectedElementsIds.filter((id) => !ids.includes(id)),
    );
  }

  /**
   * 형제들을 그룹으로 묶는다.
   *
   * **그룹의 x/y는 0이고 자식은 원래 좌표를 그대로 든다.** 그룹 좌표는 "상자가
   * 어디 있는가"가 아니라 **나중에 통째로 얼마나 옮겼는가**를 담는 자리다. 처음엔
   * 안 옮겼으니 0이고, 자식은 페이지 기준 좌표를 계속 든다. 실제 문서가 그렇게
   * 생겼다 — 디컴포저 브릿지·Polotno·export 문서 모델이 전부 이 규약이다.
   *
   * ```
   * group hero-title-group-3  x=0 y=0 w=412 h=51
   *    child figure  x=169 y=178      ← 페이지 좌표
   * ```
   *
   * 합집합 상자를 잡아 `x=left, y=top`을 주고 자식을 그만큼 빼는 방식은 **우리
   * 엔진 안에서만 맞다** — `absolutePosition`이 조상 x/y를 더해 주니까. 그렇게
   * 만든 문서를 내보내는 순간 자식이 그룹 오프셋만큼 왼쪽 위로 몰린다. 조용히.
   *
   * `width/height`는 자식들의 잉크 span이다(위 예의 412×51). 위치를 뜻하지 않는다.
   */
  groupElements(ids: string[]): CanvasElement | null {
    const els = ids
      .map((id) => this.getElementById(id))
      .filter((el): el is CanvasElement => el !== null);
    if (els.length < 2) return null;
    const parent = els[0].parent;
    if (!parent || els.some((el) => el.parent !== parent)) return null;

    const left = Math.min(...els.map((el) => el.x ?? 0));
    const top = Math.min(...els.map((el) => el.y ?? 0));
    const right = Math.max(...els.map((el) => (el.x ?? 0) + (el.width ?? 0)));
    const bottom = Math.max(...els.map((el) => (el.y ?? 0) + (el.height ?? 0)));

    const siblings = parent.children;
    const ordered = [...els].sort(
      (a, b) => siblings.indexOf(a) - siblings.indexOf(b),
    );
    const at = siblings.indexOf(ordered[0]);

    const group = new CanvasElement(this, {
      type: "group",
      x: 0,
      y: 0,
      width: right - left,
      height: bottom - top,
      children: [],
    });

    this.mutate(() => {
      for (const el of ordered) {
        const from = siblings.indexOf(el);
        if (from >= 0) siblings.splice(from, 1);
      }
      for (const el of ordered) {
        // 자식 좌표는 손대지 않는다 — 그룹 원점이 0이라 그대로가 맞다.
        el.parent = group;
        el.version += 1;
        group.children.push(el);
      }
      group.parent = parent;
      siblings.splice(Math.max(0, Math.min(siblings.length, at)), 0, group);
      group.version += 1;
      parent.version += 1;
      return true;
    });
    this.selectElements([group.id]);
    return group;
  }

  /** 그룹을 풀어 자식을 그룹이 있던 자리에 되돌린다(좌표를 부모 기준으로 환산). */
  ungroupElements(ids: string[]): void {
    const groups = ids
      .map((id) => this.getElementById(id))
      .filter(
        (el): el is CanvasElement =>
          el !== null && el.isContainer && el.parent !== null,
      );
    if (!groups.length) return;
    const freed: string[] = [];
    this.mutate(() => {
      for (const group of groups) {
        const parent = group.parent;
        if (!parent) continue;
        const siblings = parent.children;
        const at = siblings.indexOf(group);
        if (at < 0) continue;
        const kids = [...group.children];
        for (const kid of kids) {
          setAttr(kid, "x", (kid.x ?? 0) + (group.x ?? 0));
          setAttr(kid, "y", (kid.y ?? 0) + (group.y ?? 0));
          kid.parent = parent;
          kid.version += 1;
          freed.push(kid.id);
        }
        group.children.length = 0;
        // 그룹이 있던 자리에 그대로 끼운다 — 그룹의 z 위치를 잃지 않는다.
        siblings.splice(at, 1, ...kids);
        group.version += 1;
        parent.version += 1;
        group.parent = null;
      }
      return true;
    });
    this.selectElements(freed);
  }

  addPage(json?: PageJson, index?: number): CanvasPage {
    const page = new CanvasPage(this, json ?? { children: [] });
    this.mutate(() => {
      const at = index === undefined ? this.pages.length : index;
      this.pages.splice(Math.max(0, Math.min(this.pages.length, at)), 0, page);
      return true;
    });
    if (!this.activePageId) this.selectPage(page.id);
    return page;
  }

  deletePages(ids: string[]): void {
    const remove = new Set(ids);
    if (!this.pages.some((page) => remove.has(page.id))) return;
    this.mutate(() => {
      this.pages = this.pages.filter((page) => !remove.has(page.id));
      return true;
    });
    if (this.activePageId && remove.has(this.activePageId)) {
      this.activePageId = this.pages[0]?.id ?? null;
    }
  }

  setSize(width: number, height: number): void {
    this.mutate(() => {
      if (this.docAttrs.width === width && this.docAttrs.height === height) {
        return false;
      }
      this.docAttrs.width = width;
      this.docAttrs.height = height;
      return true;
    });
  }

  // -- 직렬화 --------------------------------------------------------------

  /**
   * 문서를 통째로 갈아 끼운다. 히스토리는 남기지 않는다 — 불러오기는 편집이 아니다.
   * (undo/redo가 이걸 쓰지만 자기 스택은 스스로 관리한다.)
   */
  loadJSON(json: DocumentJson): void {
    const docAttrs: Attrs = {};
    for (const [key, value] of Object.entries(json)) {
      if (key === "pages") continue;
      docAttrs[key] = value;
    }
    this.docAttrs = docAttrs;
    this.pages = asArray(json.pages).map(
      (page) => new CanvasPage(this, asRecord(page) as PageJson),
    );
    if (!this.pages.some((page) => page.id === this.activePageId)) {
      this.activePageId = this.pages[0]?.id ?? null;
    }
    this.selectedElementsIds = this.selectedElementsIds.filter(
      (id) => this.getElementById(id) !== null,
    );
    this.version += 1;
    this.notify();
  }

  toJSON(): DocumentJson {
    return {
      ...this.docAttrs,
      pages: this.pages.map((page) => page.toJSON()),
    };
  }

  // -------------------------------------------------------------------------
  // 페이지를 픽셀로 — 내려받기·미리보기·GIF가 쓴다
  //
  // 스토어는 캔버스를 안 들고 있다. 그리는 쪽(작업 영역)이 페이지마다 자기 그리기
  // 면을 여기 걸어 두고, 스토어는 그걸 찾아 픽셀을 뽑는다. 화면 밖 페이지는 아예
  // 안 그려 두므로(스크롤 최적화) 필요할 때 "이 페이지 좀 띄워 달라"고 부탁하고
  // 걸릴 때까지 기다린다.

  private surfaces = new Map<string, PageSurface>();
  private forced = new Set<string>();
  private waiters = new Map<string, Array<(surface: PageSurface) => void>>();

  /** 작업 영역이 페이지를 그렸다(또는 지웠다)고 알린다. */
  registerPageSurface(pageId: string, surface: PageSurface | null): void {
    if (!surface) {
      this.surfaces.delete(pageId);
      return;
    }
    this.surfaces.set(pageId, surface);
    const waiting = this.waiters.get(pageId);
    if (waiting) {
      this.waiters.delete(pageId);
      for (const resolve of waiting) resolve(surface);
    }
  }

  /** 화면 밖이어도 그려 둬야 하는 페이지인가. */
  isPageForced(pageId: string): boolean {
    return this.forced.has(pageId);
  }

  private surfaceFor(pageId: string, timeoutMs: number): Promise<PageSurface> {
    const ready = this.surfaces.get(pageId);
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve, reject) => {
      const list = this.waiters.get(pageId) ?? [];
      list.push(resolve);
      this.waiters.set(pageId, list);
      // 화면 밖 페이지를 띄워 달라고 부탁한다 — 구독자(작업 영역)가 다시 그린다.
      this.uiChange(() => {
        this.forced.add(pageId);
        return true;
      });
      setTimeout(() => {
        if (!this.waiters.get(pageId)?.includes(resolve)) return;
        this.waiters.set(
          pageId,
          (this.waiters.get(pageId) ?? []).filter((one) => one !== resolve),
        );
        reject(new Error(`페이지를 그릴 수 없다: ${pageId}`));
      }, timeoutMs);
    });
  }

  /**
   * 페이지 한 장을 이미지 data URI로.
   *
   * `pixelRatio`는 **문서 좌표 기준**이다 — 화면이 40%로 축소돼 있어도 1이면
   * 문서 크기 그대로 나온다. 그리기 면이 화면 배율로 그려져 있으므로 그 배율을
   * 나눠서 상쇄한다. 안 그러면 축소해 놓고 내려받았을 때만 그림이 작게 나온다.
   */
  async toDataURL(opts?: {
    pageId?: string;
    pixelRatio?: number;
    mimeType?: string;
    timeoutMs?: number;
  }): Promise<string> {
    const page = opts?.pageId
      ? this.getPageById(opts.pageId)
      : (this.activePage ?? this.pages[0] ?? null);
    if (!page) throw new Error("내보낼 페이지가 없다");

    const surface = await this.surfaceFor(page.id, opts?.timeoutMs ?? 5000);
    const scale = surface.scale || 1;
    try {
      return surface.toDataURL({
        x: 0,
        y: 0,
        width: page.width * scale,
        height: page.height * scale,
        pixelRatio: (opts?.pixelRatio ?? 1) / scale,
        mimeType: opts?.mimeType,
      });
    } finally {
      this.uiChange(() => this.forced.delete(page.id));
    }
  }
}

/**
 * 페이지 하나를 그려 둔 면. 작업 영역이 Konva 레이어를 이 모양으로 걸어 준다.
 *
 * 선택 표시(트랜스포머)는 다른 레이어에 있어서 여기 안 딸려 온다 — 내려받은 그림에
 * 파란 손잡이가 찍히지 않는다.
 */
export type PageSurface = {
  /** 화면에 그려진 배율. 문서 좌표로 되돌리는 데 쓴다. */
  scale: number;
  toDataURL(config: {
    x: number;
    y: number;
    width: number;
    height: number;
    pixelRatio: number;
    mimeType?: string;
  }): string;
};

function findInList(list: CanvasElement[], id: string): CanvasElement | null {
  for (const el of list) {
    if (el.id === id) return el;
    if (el.isContainer) {
      const found = findInList(el.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 트리 전체를 뒤 → 앞 순서로 훑는다. */
export function walkElements(
  store: CanvasStore,
  visit: (el: CanvasElement, page: CanvasPage) => void,
): void {
  const walk = (list: CanvasElement[], page: CanvasPage) => {
    for (const el of list) {
      visit(el, page);
      if (el.isContainer) walk(el.children, page);
    }
  };
  for (const page of store.pages) walk(page.children, page);
}

export function createCanvasStore(json?: DocumentJson): CanvasStore {
  return new CanvasStore(json);
}
