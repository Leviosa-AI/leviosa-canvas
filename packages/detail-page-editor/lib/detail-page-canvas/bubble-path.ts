/**
 * 말풍선 = 몸통 + 꼬리가 이어진 **하나의 닫힌 path**.
 *
 * 왜 하나의 path인가
 * ------------------
 * 꼬리를 별도 도형으로 얹고 몸통의 테두리를 fill로 "덮는" 방식은 반드시 깨진다.
 * 라운드·스트로크·안티에일리어싱이 조금만 어긋나도 이음매가 드러난다. 몸통과 꼬리를
 * 한 path로 뽑으면 fill/stroke가 그냥 이어지므로 덮을 테두리도 죽일 라운드도 없다.
 *
 * 꼬리는 각도가 아니라 **끝점(tip)** 으로 잡는다
 * ---------------------------------------------
 * tip을 자유 좌표로 두고, 둘레에서 tip에 가장 가까운 지점을 찾아 그 자리에 꼬리를
 * 끼워 넣는다. tip을 360도 어디로 끌어도 꼬리는 항상 몸통에 붙어 있고, 모서리에
 * 걸치면 두 변에 걸친 부리가 된다 — Canva/미리캔버스의 꼬리 드래그가 이 방식이다.
 *
 * 이 파일은 디컴포저 쪽 ``bubble_path.py``의 쌍둥이다. 두 구현이 같은 파라미터
 * (``custom.bubble``)로 같은 path를 내야 편집기 렌더가 원본 문서와 어긋나지 않는다.
 */

export type Pt = [number, number];

export type BubbleParams = {
  /** 몸통 크기 (꼬리·스트로크 여백 pad는 제외한 순수 몸통). */
  w: number;
  h: number;
  /** 몸통 모서리 라운드. */
  r: number;
  /** 꼬리·스트로크가 삐져나갈 여백. SVG 좌표계는 (-pad,-pad)에서 시작한다. */
  pad: number;
  fill: string;
  stroke?: string | null;
  strokeWidth?: number;
  /** 꼬리 끝점(몸통 로컬 좌표). null이거나 몸통 안이면 꼬리 없음. */
  tip?: Pt | null;
  /** 꼬리 밑변의 둘레 위 길이 [선행, 후행]. 비대칭이어야 부리처럼 보인다. */
  base?: [number, number];
  /** 꼬리 후행 변을 몸통 쪽으로 판 깊이. 0이면 모서리를 비스듬히 깎은 모양이 된다. */
  notch?: number;
};

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 둥근 사각형 둘레를 촘촘한 폴리라인으로 샘플링(시계방향). */
function perimeter(w: number, h: number, r0: number, step = 1.5): Pt[] {
  const r = Math.max(0, Math.min(r0, w / 2, h / 2));
  const pts: Pt[] = [];
  const line = (a: Pt, b: Pt) => {
    const n = Math.max(1, Math.round(dist(a, b) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n; // 끝점은 다음 구간이 이어받는다(중복 방지)
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  };
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const n = Math.max(2, Math.round((Math.abs(a1 - a0) * r) / step));
    for (let i = 0; i < n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
  };
  const P = Math.PI;
  line([r, 0], [w - r, 0]);
  arc(w - r, r, -P / 2, 0);
  line([w, r], [w, h - r]);
  arc(w - r, h - r, 0, P / 2);
  line([w - r, h], [r, h]);
  arc(r, h - r, P / 2, P);
  line([0, h - r], [0, r]);
  arc(r, r, P, (3 * P) / 2);
  return pts;
}

/** tip이 몸통 안이면 꼬리를 그리지 않는다(끝점을 안으로 끌면 꼬리가 사라지는 UX). */
export function insideBody(w: number, h: number, r: number, p: Pt): boolean {
  const [x, y] = p;
  if (x < 0 || x > w || y < 0 || y > h) return false;
  const cornerX = x < r || x > w - r;
  const cornerY = y < r || y > h - r;
  if (!cornerX || !cornerY) return true;
  const cx = x < r ? r : w - r;
  const cy = y < r ? r : h - r;
  return dist([x, y], [cx, cy]) <= r;
}

export function bubblePathD(p: BubbleParams): string {
  const { w, h, r } = p;
  const pts = perimeter(w, h, r);
  const tip = p.tip ?? null;
  const d = (list: Pt[]) =>
    list
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ") + " Z";

  if (!tip || insideBody(w, h, r, tip)) return d(pts);

  const n = pts.length;
  const s: number[] = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + dist(pts[i - 1], pts[i]));
  const total = s[n - 1] + dist(pts[n - 1], pts[0]);

  let anchor = 0;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const dd = dist(pts[i], tip);
    if (dd < best) {
      best = dd;
      anchor = i;
    }
  }

  /** 앵커에서 둘레를 따라 dist만큼 떨어진 점의 인덱스(래핑). s는 단조증가 → 이분탐색. */
  const at = (delta: number): number => {
    const target = ((((s[anchor] + delta) % total) + total) % total) as number;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo % n;
  };

  const [before, after] = p.base ?? [34, 34];
  const a = at(-Math.min(before, total / 4));
  const b = at(Math.min(after, total / 4));

  // b에서 시계방향으로 돌아 a까지가 몸통. a..b 구간을 꼬리가 대체한다.
  const body: Pt[] = [];
  for (let k = b; ; k = (k + 1) % n) {
    body.push(pts[k]);
    if (k === a) break;
  }

  const tail: Pt[] = [tip];
  const notch = p.notch ?? 0;
  if (notch > 0) {
    // tip → b 변의 중간을 몸통 중심 쪽으로 당겨 오목하게 만든다.
    const mx = (tip[0] + pts[b][0]) / 2;
    const my = (tip[1] + pts[b][1]) / 2;
    const vx = w / 2 - mx;
    const vy = h / 2 - my;
    const len = Math.hypot(vx, vy) || 1;
    tail.push([mx + (vx / len) * notch, my + (vy / len) * notch]);
  }
  return d([...body, ...tail]);
}

export function bubbleSvgMarkup(p: BubbleParams): string {
  const { w, h, pad } = p;
  const st = p.stroke
    ? ` stroke="${p.stroke}" stroke-width="${p.strokeWidth ?? 2}" stroke-linejoin="round"`
    : "";
  return (
    `<svg viewBox="${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}" ` +
    `width="${w + 2 * pad}" height="${h + 2 * pad}" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="${bubblePathD(p)}" fill="${p.fill}"${st}/></svg>`
  );
}

/** 스톡 편집기의 svg 요소는 ``src``로 그린다 — 마크업을 data URL로 굽는다. */
export function bubbleSvgDataUrl(p: BubbleParams): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(bubbleSvgMarkup(p))))}`;
}

/** ``custom.bubble``을 안전하게 읽는다(형식이 어긋나면 null → 일반 svg로 취급). */
export function readBubbleParams(custom: unknown): BubbleParams | null {
  if (!custom || typeof custom !== "object") return null;
  const b = (custom as Record<string, unknown>).bubble;
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const w = num(o.w);
  const h = num(o.h);
  if (w === null || h === null || w <= 0 || h <= 0) return null;
  const tip = Array.isArray(o.tip) && o.tip.length === 2 ? (o.tip.map(Number) as Pt) : null;
  const base = Array.isArray(o.base) && o.base.length === 2 ? (o.base.map(Number) as [number, number]) : undefined;
  return {
    w,
    h,
    r: num(o.r) ?? 0,
    pad: num(o.pad) ?? 0,
    fill: typeof o.fill === "string" ? o.fill : "#fff",
    stroke: typeof o.stroke === "string" ? o.stroke : null,
    strokeWidth: num(o.strokeWidth) ?? 2,
    tip: tip && tip.every(Number.isFinite) ? tip : null,
    base,
    notch: num(o.notch) ?? 0,
  };
}
