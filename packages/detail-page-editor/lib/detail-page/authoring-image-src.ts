/**
 * 저작이 만든 사진인지 **주소만 보고** 알아낸다.
 *
 * 브랜드 저작이 만든 사진은 문서에 잡 주소로 박힌다:
 *
 * ```
 * https://<host>/api/v2/detail-pages/brand-authoring/{job_id}/images/{name}?sig=<hmac>
 * ```
 *
 * 이 사진을 브랜드 자산으로 승격하려면 서버에 그 셋(`job_id`·`name`·`sig`)을 그대로
 * 넘겨야 한다. 서버는 서명을 먼저 검증하고 나서야 바이트를 읽는다 — 그렇게 하지 않으면
 * 로그인만 하면 임의의 주소를 대신 받아 오는 통로가 된다.
 *
 * 편집기가 들고 있는 것은 `el.src` 뿐이므로, 승격 버튼을 띄울지 말지도 이 파싱 하나로
 * 정해진다. **파싱되지 않으면 저작 사진이 아니다** — 셀러가 직접 올린 것, 브랜드
 * 라이브러리에서 가져온 것, AI 가 만들어 이미 브랜드에 들어간 것은 모두 승격할 이유가
 * 없고, 실제로 이 모양이 아니다.
 *
 * 상대 주소·절대 주소·프록시 경유를 모두 받는다. 어느 쪽이든 경로와 질의만 보면 된다.
 */

export interface AuthoringImageRef {
  /** 이 사진을 만든 저작 잡. */
  jobId: string;
  /** 명세가 정한 사진 이름. */
  name: string;
  /** 주소에 이미 붙어 있는 HMAC 서명. 서버가 권한 증거로 쓴다. */
  sig: string;
}

/** 라우터 mount prefix + 라우트 경로. 소싱 서버의 `BRAND_LANE_IMAGE_PATH` 와 같아야 한다. */
const LANE_IMAGE_PATH = "/api/v2/detail-pages/brand-authoring/";

/**
 * 저작 사진 주소를 (잡, 이름, 서명)으로 쪼갠다. 저작 사진이 아니면 `null`.
 *
 * 셋 중 하나라도 비면 `null` 이다. 반쪽짜리를 넘기면 서버는 어차피 404 로 돌려보내는데,
 * 버튼은 이미 눌린 뒤라 셀러에게는 "저장이 실패했다"로 보인다.
 */
export function parseAuthoringImageSrc(src: string): AuthoringImageRef | null {
  const raw = String(src ?? "").trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return null;

  // 절대 주소로 와도 경로만 보면 된다. base 는 상대 주소를 파싱하기 위한 것일 뿐이라
  // 값 자체는 쓰이지 않는다.
  let url: URL;
  try {
    url = new URL(raw, "https://placeholder.invalid");
  } catch {
    return null;
  }

  const path = url.pathname;
  if (!path.startsWith(LANE_IMAGE_PATH)) return null;

  const rest = path.slice(LANE_IMAGE_PATH.length).replace(/\/+$/, "");
  const parts = rest.split("/");
  // {job_id}/images/{name} — 정확히 셋이어야 한다. 폴링(`{job_id}`)이나
  // 고르기(`{job_id}/select`)가 같이 걸리면 안 된다.
  if (parts.length !== 3 || parts[1] !== "images") return null;

  const jobId = safeDecode(parts[0]);
  const name = safeDecode(parts[2]);
  const sig = url.searchParams.get("sig") ?? "";
  if (!jobId || !name || !sig) return null;

  return { jobId, name, sig };
}

/** 저작 사진인지만 묻는다. 버튼을 띄울지 정하는 자리에서 쓴다. */
export function isAuthoringImageSrc(src: string): boolean {
  return parseAuthoringImageSrc(src) !== null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // 인코딩이 깨진 이름은 디코드하면 던진다. 그때는 원문 그대로 넘긴다 — 서명이
    // 원문에 대해 만들어졌으므로 서버가 판단하게 두는 편이 맞다.
    return value;
  }
}
