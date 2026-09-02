/**
 * 상세페이지를 올릴 플랫폼별 규격표.
 *
 * 플랫폼을 먼저 고르면 나머지가 여기서 정해진다 — 출력 폭, 움직이는 섹션을 어떤
 * 형식으로 구울지, 파일 하나가 넘으면 안 되는 용량. 다운로드 창은 이 표만 읽고,
 * 인코더는 여기서 나온 숫자만 받는다.
 *
 * 수치의 근거(2026-09 조사):
 * - 네이버 스마트스토어: 권장 폭 860px, 장당 20MB, GIF 허용(860px 초과 시 재압축),
 *   WebP 는 모바일 미리보기에서 미지원이라 명시적으로 배제. mp4 는 동영상
 *   컴포넌트로 따로 올린다. (스마트스토어센터 FAQ 3923·4159·13986·15871)
 * - 쿠팡: 공식 문서가 없다. 780px·GIF 업로드 거부·WebP 허용은 전부 셀러 커뮤니티
 *   보고이고, 장당 용량은 블로그마다 5~10MB 로 갈려 보수적으로 5MB 를 잡는다.
 * - 카페24: 권장 700~800px(에디봇은 800px 이상), 에디터 직접 등록 5MB, GIF 허용,
 *   WebP 는 파일업로더 경유만, mp4 는 FTP 업로드 불가. (헬프센터 17460428614041)
 * - 지마켓·옥션(ESM Plus): 860px(옥션 구 FAQ 980px), 장당 10MB, 이미지호스팅이
 *   GIF 를 받는다. (판매자 가이드 2.0 goodsDescription)
 * - 11번가: 모바일 상세 780px, GIF 허용(초당 3회 미만). 공식 매뉴얼이 2016년판이라
 *   용량은 커뮤니티 통용값 10MB.
 * - 카카오톡 스토어: 750px 초과 시 750px 로 축소. 형식·용량은 미명시라 대표이미지
 *   기준 10MB 를 따른다. (판매자센터 매뉴얼 2024.01)
 * - 오늘의집: 권장 1,440px, 6MB 초과 시 자동 축소·20MB 초과 시 거부, 상세 내
 *   GIF·동영상 허용. 저쪽이 다시 줄이지 않도록 6MB 에 맞춘다. (파트너 가이드 25474485014681)
 */

/** 움직이는 섹션의 저장 형식. */
export type AnimationFormat = "webp" | "gif" | "mp4";

export type ExportPlatform = {
  value: string;
  label: string;
  /** 상세설명 권장 폭(px). null 이면 문서 폭에 해상도 배율을 곱한 그대로 나간다. */
  width: number | null;
  /** 이 플랫폼이 받는 움직이는 이미지 형식. 첫 항목이 기본값이다. */
  animation: readonly AnimationFormat[];
  /** 파일 하나의 용량 상한(bytes). null 이면 제한 없음. */
  maxBytes: number | null;
};

const MB = 1024 * 1024;

export const EXPORT_PLATFORMS: readonly ExportPlatform[] = [
  {
    value: "naver",
    label: "네이버 스마트 스토어",
    width: 860,
    animation: ["gif", "mp4"],
    maxBytes: 20 * MB,
  },
  {
    value: "coupang",
    label: "쿠팡",
    width: 780,
    animation: ["webp"],
    maxBytes: 5 * MB,
  },
  {
    value: "cafe24",
    label: "카페24",
    width: 800,
    animation: ["gif", "webp"],
    maxBytes: 5 * MB,
  },
  {
    value: "gmarket",
    label: "지마켓 · 옥션",
    width: 860,
    animation: ["gif"],
    maxBytes: 10 * MB,
  },
  {
    value: "11st",
    label: "11번가",
    width: 780,
    animation: ["gif"],
    maxBytes: 10 * MB,
  },
  {
    value: "kakao",
    label: "카카오톡 스토어",
    width: 750,
    animation: ["gif"],
    maxBytes: 10 * MB,
  },
  {
    value: "ohouse",
    label: "오늘의집",
    width: 1440,
    animation: ["gif", "mp4"],
    maxBytes: 6 * MB,
  },
  {
    value: "general",
    label: "일반(범용)",
    width: null,
    animation: ["webp", "gif", "mp4"],
    maxBytes: null,
  },
];

/** 값으로 플랫폼을 찾는다. 모르는 값이면 null. */
export function exportPlatform(value: string | null | undefined): ExportPlatform | null {
  if (!value) return null;
  return EXPORT_PLATFORMS.find((p) => p.value === value) ?? null;
}

/**
 * 문서 폭을 플랫폼 폭으로 옮기는 배율.
 *
 * 플랫폼에 폭이 없으면 사용자가 고른 해상도 배율을 그대로 쓴다. 있으면 그 폭에
 * 정확히 맞춘다 — 750 짜리 문서를 네이버에 내면 860/750 배로 나간다.
 */
export function platformPixelRatio(
  platform: ExportPlatform | null,
  docWidth: number,
  resolution: number,
): number {
  if (!platform?.width) return resolution;
  return platform.width / Math.max(1, docWidth);
}
