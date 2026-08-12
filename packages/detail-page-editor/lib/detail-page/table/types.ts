/**
 * 표 스펙.
 *
 * 표는 element 타입이 아니라 ``custom.table``에 이 스펙을 얹은 ``group``이다(차트와 같다).
 * 자식은 전부 ``figure``(칸 배경·구분선) + ``text``(칸 글자)라, 내보내기 네 경로가
 * 어댑터 없이 그대로 그린다.
 *
 * **브랜드가 기준이다.** 브랜드 상세페이지 두 곳이 같은 골격에 드레싱만 다르게 쓴다:
 * 첫 칸은 고정폭, 나머지는 남는 폭을 나눠 갖고, 행마다 구분선이 있다. 그 차이는
 * ``style``의 값 네 개(``firstFill``·``columnRule``·``topRule``·``outerBorder``)로만
 * 표현된다 — 그래서 렌더러에 브랜드별 분기가 없다.
 */

/** 첫 칸을 이름으로 쓰는 2열 스펙표 / 머리글을 둘 수 있는 N열 그리드. */
export type TableKind = "keyvalue" | "grid";

export type CellAlign = "left" | "center" | "right";

/** 선 하나. ``null``이면 그 선을 안 그린다. */
export type TableRule = { color: string; width: number } | null;

export type TableBorder = { color: string; width: number; radius: number } | null;

export type TableData = {
  /** 열 이름. ``grid``에서 ``headerRow``가 켜지면 머리글로 그려진다. 열 수의 기준이다. */
  columns: string[];
  /** ``rows[r][c]``. 열 수보다 짧거나 길면 정규화가 맞춘다(원본은 안 자른다). */
  rows: string[][];
};

export type TableOptions = {
  /** ``grid``에서 ``columns``를 머리글 행으로 그린다. ``keyvalue``에서는 무시된다. */
  headerRow: boolean;
  /** 열별 정렬. 모자라면 기본값으로 채운다. */
  align: CellAlign[];
  /** 짝수 행에 옅은 바탕을 깐다. */
  zebra: boolean;
};

export type TableStyle = {
  fontFamily: string;
  fontSize: number;
  color: string;
  /** 칸 좌우·상하 여백. 브랜드는 20~26px을 쓴다. */
  padX: number;
  padY: number;

  // ── 첫 칸(이름 칸) ────────────────────────────────────────────────────────
  /** 첫 칸 고정폭. ``null``이면 모든 열이 같은 폭을 나눠 갖는다. */
  firstWidth: number | null;

  /**
   * 열별 폭(px). ``null``이면 자동 — ``firstWidth``만 고정하고 나머지는 균등 분배한다.
   *
   * 사용자가 캔버스에서 열 경계를 끌면 그때 현재 자동 배치값으로 채워진다(그래서 처음
   * 끄는 순간 표가 안 튄다). 값이 있으면 ``frame.width``에 **비례 정규화**되므로 표를
   * 리사이즈해도 비율이 유지되고, 글자를 고쳐도 폭을 다시 만질 일이 없다 — 폭을 스펙에
   * 담기를 미뤘던 이유가 이 정규화로 사라진다.
   *
   * 길이가 그리는 열 수와 다르면 무시하고 자동으로 돌아간다(종류를 바꿨을 때).
   */
  columnWidths: number[] | null;
  /** 첫 칸 바탕. ``null``이면 안 채운다. */
  firstFill: string | null;
  firstAlign: CellAlign;
  firstColor: string;
  firstWeight: number;
  /** 첫 칸만 다른 서체를 쓰는 브랜드가 있다. ``null``이면 ``fontFamily``. */
  firstFontFamily: string | null;
  /** 첫 칸만 다른 크기를 쓸 때. ``null``이면 ``fontSize``. */
  firstSize: number | null;

  // ── 선 ───────────────────────────────────────────────────────────────────
  /** 첫 칸과 값 칸을 가르는 세로선. */
  columnRule: TableRule;
  /** 행과 행 사이 가로선. */
  rowRule: TableRule;
  /** 표 맨 위 굵은 선. */
  topRule: TableRule;
  /** 바깥 테두리 + 라운드. */
  outerBorder: TableBorder;

  // ── 바탕 ─────────────────────────────────────────────────────────────────
  /** 값 칸 바탕. ``null``이면 투명. */
  bodyFill: string | null;
  zebraFill: string;
  headerFill: string | null;
  headerColor: string;
  headerWeight: number;
};

export type TableSpec = {
  v: 1;
  kind: TableKind;
  frame: { width: number; height: number };
  data: TableData;
  options: TableOptions;
  style: TableStyle;
};

/** 자식 ``custom``에서 부품 키가 사는 자리. 재생성 사이에 요소 id를 잇는 끈이다. */
export const TABLE_PART = "tablePart";
