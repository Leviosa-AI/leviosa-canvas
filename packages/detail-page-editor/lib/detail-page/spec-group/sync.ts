/**
 * 스펙을 든 그룹(차트·표) ↔ Canvas 스토어를 잇는 **유일한** 지점.
 *
 * 차트도 표도 element 타입이 아니라 ``group`` 하나이고, 스펙은 그 그룹의 ``custom``에
 * 얹힌다(차트는 ``custom.chart``, 표는 ``custom.table``). 데이터나 종류가 바뀌면 여기서
 * 자식을 다시 만든다. 무엇을 그리느냐만 ``SpecBinding``으로 갈리고, **스토어를 만지는
 * 방법은 하나뿐**이다 — 아래 규칙 넷은 값을 치르고 얻은 것이라 두 벌로 갈라지면 안 된다.
 *
 * 1. **키 기반 diff.** 전부 지우고 다시 만들지 않는다. 자식 ``custom[partKey]``에 박은
 *    키로 기존 자식을 찾아 ``set``하므로 요소 id가 유지되고, 선택·레이어 트리·undo가
 *    안 흔들린다.
 * 2. **한 번의 undo.** 전체를 ``history.startTransaction``/``endTransaction``으로 감싼다.
 *    안 감싸면 값 하나 고친 게 자식 수만큼의 undo 단계로 쪼개진다.
 * 3. **그룹 base 좌표는 0.** 자식이 페이지 좌표를 들고 있어서 그룹에 x/y가 남으면 자식이
 *    이중으로 밀린다. 상자는 그룹 모델이 아니라 자식 합집합으로 잰다.
 * 4. **자식을 ``selectable: false``로 잠그지 않는다.** 스톡 편집기는 그룹 자체에 히트 영역을
 *    두지 않고 자식을 맞혀 ``el.top``(바깥 그룹)으로 올려 선택한다
 *    (``canvas/canvas/element.js``의 group 렌더러가 ``listening``을 자식에게 맡긴다).
 *    자식을 잠그면 클릭이 아무것도 못 맞혀 **차트·표를 아예 고를 수 없게 된다.**
 *    그래서 잠그는 대신 기본 동작에 기댄다 — 한 번 클릭하면 그룹이 잡히고, 안의 칸은
 *    드릴인(한 번 더 클릭)이라는 의도적인 동작으로만 닿는다.
 *
 * canvas를 import하지 않고 구조적 타입으로만 접근한다 — 그래야 이 모듈이 캔버스 없이
 * 테스트된다.
 */

export type ElementLike = {
  id?: string;
  type?: string;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  custom?: unknown;
  children?: unknown;
  selectable?: boolean;
  set?: (props: Record<string, unknown>) => void;
  /**
   * 그룹 모델도 페이지와 같은 ``addElement``를 노출한다
   * (``canvas/model/group-model.js``). 이게 있어서 재생성 때 새 자식을 그룹 **안에**
   * 바로 넣을 수 있다.
   *
   * 대안은 ``layer-move``의 해체·재구성이다(그쪽은 attrs에 그룹 id를 실어 보내
   * 같은 그룹으로 되살리므로 id는 지켜진다). 다만 그 경로는 ``ungroupElements``가
   * 자식을 ``e.page``로 올려버려 **페이지 직속 그룹만** 다룰 수 있고, z-order 복원과
   * 선택 되돌리기가 딸려온다. 차트·표는 값 하나 고칠 때마다 도는 길이라 여기서는
   * 자식만 밀어 넣는 쪽이 맞다.
   */
  addElement?: (
    props: Record<string, unknown>,
    options?: { skipSelect?: boolean },
  ) => unknown;
};

export type PageLike = {
  computedWidth?: number;
  computedHeight?: number;
  children?: unknown;
  addElement: (
    props: Record<string, unknown>,
    options?: { skipSelect?: boolean },
  ) => unknown;
};

type HistoryLike = {
  startTransaction?: () => void;
  endTransaction?: (skipSave?: boolean) => void;
};

export type StoreLike = {
  activePage?: PageLike;
  pages: PageLike[];
  history?: HistoryLike;
  groupElements?: (ids: string[], attrs?: Record<string, unknown>) => unknown;
  deleteElements?: (ids: string[]) => void;
  selectElements?: (ids: string[]) => void;
};

export type Box = { x: number; y: number; width: number; height: number };

/** 렌더러가 내놓는 자식 하나. ``key``는 재생성 사이에 요소 id를 잇는 끈이다. */
export type SpecNode = { key: string; props: Record<string, unknown> };
export type SpecRender = { nodes: SpecNode[]; size: { width: number; height: number } };

/** 스펙이 공통으로 갖는 골격. ``frame``은 리사이즈 판정에 쓰인다. */
export type SpecBase = { v: 1; frame: { width: number; height: number } };

/**
 * 한 종류(차트·표)를 이 코어에 물리는 어댑터.
 *
 * ``parse``는 저장된 문서에서 온 값을 검사한다 — 형태를 믿지 않고 최소 골격만 본다.
 * ``absorbResize``는 사용자가 트랜스포머로 늘린 결과를 스펙에 되먹인다(없으면 무시).
 */
export type SpecBinding<S extends SpecBase> = {
  /** ``group.custom``에서 스펙이 사는 키. */
  customKey: string;
  /** 자식 ``custom``에서 부품 키가 사는 키. */
  partKey: string;
  /** 레이어 트리에 뜰 기본 이름. */
  defaultName: string;
  render: (spec: S) => SpecRender;
  parse: (raw: unknown) => S | null;
  absorbResize?: (spec: S, box: Box) => S;
  /**
   * 캔버스에서 자식을 직접 고친 걸 스펙으로 되받는다(``base``는 저장돼 있던 스펙,
   * ``incoming``은 이번에 적용하려는 스펙).
   *
   * 다시 그리기 **직전**이 유일하게 안전한 시점이다 — 여기서 안 걷으면 바로 다음 줄에서
   * 자식이 스펙 값으로 덮인다. 없으면 되받기 없이 그대로 그린다(차트가 그렇다).
   */
  harvest?: (base: S, incoming: S, children: ElementLike[]) => S;
};

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function customOf(el: ElementLike): Record<string, unknown> {
  return el.custom && typeof el.custom === "object"
    ? ({ ...el.custom } as Record<string, unknown>)
    : {};
}

function childrenOf(node: ElementLike | PageLike): ElementLike[] {
  return Array.isArray(node.children) ? (node.children as ElementLike[]) : [];
}

/** 하나의 undo 단계로 묶는다. history가 없으면(테스트 페이크) 그냥 실행한다. */
function inTransaction<T>(store: StoreLike, run: () => T): T {
  const history = store.history;
  history?.startTransaction?.();
  try {
    return run();
  } finally {
    history?.endTransaction?.();
  }
}

// ── 스펙 읽기/쓰기 ───────────────────────────────────────────────────────────

/** 그룹에서 스펙을 꺼낸다. 그 종류가 아니면 ``null``. */
export function readSpec<S extends SpecBase>(
  binding: SpecBinding<S>,
  el: ElementLike | null | undefined,
): S | null {
  if (!el || el.type !== "group") return null;
  const custom = el.custom as Record<string, unknown> | undefined;
  const raw = custom?.[binding.customKey];
  if (!raw || typeof raw !== "object") return null;
  return binding.parse(raw);
}

/** 스펙을 그룹에 되쓴다(다른 custom 키는 보존). */
export function writeSpec<S extends SpecBase>(
  binding: SpecBinding<S>,
  el: ElementLike,
  spec: S,
): void {
  el.set?.({ custom: { ...customOf(el), [binding.customKey]: spec } });
}

// ── 배치 ────────────────────────────────────────────────────────────────────

/** 그룹이 실제로 차지하는 상자. 그룹 모델의 x/y/width/height가 아니라 자식에서 잰다. */
export function groupBox(group: ElementLike): Box | null {
  const kids = childrenOf(group);
  if (kids.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const kid of kids) {
    const x = num(kid.x);
    const y = num(kid.y);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + num(kid.width));
    bottom = Math.max(bottom, y + num(kid.height));
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export type InsertSpecOptions = {
  /** 프레임 좌상단(페이지 좌표). 없으면 페이지 가운데. */
  origin?: { x: number; y: number };
  /** 레이어 트리에 뜰 이름. */
  name?: string;
};

/**
 * 새 스펙 그룹을 페이지에 놓고 그 그룹을 돌려준다.
 *
 * ``spec.frame.height``는 렌더 결과로 채워져 그룹에 저장된다 — 이 값이 있어야 다음
 * 재생성 때 "사용자가 세로로 늘렸는지"를 판정할 수 있다.
 */
export function insertSpecGroup<S extends SpecBase>(
  binding: SpecBinding<S>,
  store: StoreLike,
  spec: S,
  { origin, name = binding.defaultName }: InsertSpecOptions = {},
): ElementLike | null {
  const page = store.activePage ?? store.pages[0];
  if (!page || !store.groupElements) return null;

  const render = binding.render(spec);
  const placed: S = {
    ...spec,
    frame: { width: render.size.width, height: render.size.height },
  };
  const pageWidth = num(page.computedWidth, render.size.width);
  const pageHeight = num(page.computedHeight, render.size.height);
  const at = origin ?? {
    x: Math.round((pageWidth - render.size.width) / 2),
    y: Math.round((pageHeight - render.size.height) / 2),
  };

  const childProps = (key: string, props: Record<string, unknown>) => ({
    ...props,
    custom: { [binding.partKey]: key },
  });

  return inTransaction(store, () => {
    const ids: string[] = [];
    for (const node of render.nodes) {
      // skipSelect: 부품을 하나 넣을 때마다 선택이 옮겨 다니면 그 사이 우측 인스펙터가
      // 깜빡인다. 최종 선택은 groupElements가 그룹으로 잡아 준다.
      const added = page.addElement(
        childProps(node.key, {
          ...node.props,
          x: at.x + num(node.props.x),
          y: at.y + num(node.props.y),
        }),
        { skipSelect: true },
      ) as ElementLike | undefined;
      const id = added?.id;
      if (typeof id === "string") ids.push(id);
    }
    if (ids.length === 0) return null;
    const group = store.groupElements?.(ids, {
      name,
      custom: { [binding.customKey]: placed },
    }) as ElementLike | undefined;
    return group ?? null;
  });
}

/**
 * 스펙이 바뀐 그룹을 다시 그린다.
 *
 * 그리기 전에 현재 상자를 재서 사용자의 리사이즈를 스펙에 흡수하고, 그린 뒤의 실제
 * 높이를 ``frame.height``에 되먹인다. 위치는 **현재 상자의 좌상단**을 유지한다 —
 * 데이터를 고쳤다고 차트·표가 페이지 가운데로 튀면 안 된다.
 */
export function syncSpecGroup<S extends SpecBase>(
  binding: SpecBinding<S>,
  store: StoreLike,
  group: ElementLike,
  next: S,
): S {
  // 되받기가 먼저다. 아래 루프가 자식을 스펙 값으로 ``set``하므로, 여기서 안 걷은
  // 캔버스 편집은 이 함수 안에서 사라진다.
  const stored = readSpec(binding, group);
  const harvested =
    stored && binding.harvest ? binding.harvest(stored, next, childrenOf(group)) : next;

  const box = groupBox(group);
  const spec =
    box && binding.absorbResize ? binding.absorbResize(harvested, box) : harvested;
  const render = binding.render(spec);
  const at = box ? { x: box.x, y: box.y } : { x: 0, y: 0 };

  const existing = new Map<string, ElementLike>();
  for (const kid of childrenOf(group)) {
    const key = (kid.custom as Record<string, unknown> | undefined)?.[binding.partKey];
    if (typeof key === "string") existing.set(key, kid);
  }

  const saved: S = {
    ...spec,
    frame: { width: render.size.width, height: render.size.height },
  };

  const childProps = (key: string, props: Record<string, unknown>) => ({
    ...props,
    custom: { [binding.partKey]: key },
  });

  inTransaction(store, () => {
    const kept = new Set<string>();
    for (const node of render.nodes) {
      kept.add(node.key);
      const props: Record<string, unknown> = {
        ...node.props,
        x: at.x + num(node.props.x),
        y: at.y + num(node.props.y),
      };
      const found = existing.get(node.key);
      if (found) {
        // 타입이 달라졌으면(막대 → 도넛처럼) 갈아 끼울 수 없다. 지우고 다시 만든다.
        if (found.type === props.type) {
          found.set?.(childProps(node.key, props));
          continue;
        }
        store.deleteElements?.([String(found.id ?? "")]);
        existing.delete(node.key);
      }
      // 페이지가 아니라 **그룹 안**에 넣는다. 페이지에 넣으면 그룹 밖으로 떨어져 나온다.
      group.addElement?.(childProps(node.key, props), { skipSelect: true });
    }
    const stale = [...existing.entries()]
      .filter(([key]) => !kept.has(key))
      .map(([, el]) => String(el.id ?? ""))
      .filter(Boolean);
    if (stale.length > 0) store.deleteElements?.(stale);
    writeSpec(binding, group, saved);
  });

  return saved;
}

/**
 * 스펙 그룹을 일반 그룹으로 푼다.
 *
 * 스펙과 부품 표시를 떼면 인스펙터가 평범한 그룹으로 보고, 데이터를 고쳐도 다시 그리는
 * 일이 없어진다. 되돌리기(다시 차트·표로 만들기)는 제공하지 않는다 — 사용자가 자유롭게
 * 만진 뒤라 스펙과 화면이 이미 다르기 때문이다.
 */
export function detachSpecGroup<S extends SpecBase>(
  binding: SpecBinding<S>,
  group: ElementLike,
): void {
  const custom = customOf(group);
  delete custom[binding.customKey];
  group.set?.({ custom });
  for (const kid of childrenOf(group)) {
    const kidCustom = customOf(kid);
    delete kidCustom[binding.partKey];
    kid.set?.({ custom: kidCustom });
  }
}

/**
 * 문서에서 가장 많이 쓰인 본문 폰트. 새로 넣는 차트·표가 페이지 톤을 따라가게 한다.
 *
 * 못 찾으면 ``undefined``를 돌려 호출자가 기본 폰트로 떨어지게 둔다.
 */
export function documentFontFamily(store: StoreLike): string | undefined {
  const tally = new Map<string, number>();
  const walk = (nodes: ElementLike[]) => {
    for (const node of nodes) {
      if (node.type === "group") walk(childrenOf(node));
      else if (node.type === "text") {
        const family = (node as { fontFamily?: unknown }).fontFamily;
        if (typeof family === "string" && family) {
          tally.set(family, (tally.get(family) ?? 0) + 1);
        }
      }
    }
  };
  for (const page of store.pages ?? []) walk(childrenOf(page));
  let best: string | undefined;
  let most = 0;
  for (const [family, count] of tally) {
    if (count > most) {
      most = count;
      best = family;
    }
  }
  return best;
}
