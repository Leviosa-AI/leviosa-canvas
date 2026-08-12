/**
 * 사용 키.
 *
 * **보호 수단이 아니다.** 우리가 바로 그 Polotno 키를 우회했던 당사자다(동일출처
 * 프록시 + `validate-key` 훅). 클라이언트에 실리는 키로 소스를 지킬 수 없다는 것은
 * 우리 손으로 증명했다. 이게 사는 것은 둘이다 — **누가 얼마나 쓰는지 셀 자리**와,
 * **외부에 팔 때 이미 달려 있는 스위치.**
 *
 * 그래서 규칙이 셋이다.
 *
 * 1. **네트워크를 안 탄다.** 검증을 서버로 보내면 엔진의 "서버 호출 0건"이 깨지고,
 *    소싱 서버가 흔들릴 때 편집기가 같이 죽는다. 원격 검증은 나중에 옵션으로,
 *    그리고 fail-open으로.
 * 2. **못 재면 통과시킨다.** 오리진을 못 읽는 자리(SSR·헤드리스 렌더러는 오리진이
 *    `null`이다)에서 워터마크가 찍히면 우리 산출물이 망가진다. 애매하면 통과다.
 * 3. **아무것도 안 던진다.** 키가 틀렸다고 편집기가 멎으면 안 된다. 콘솔 경고 한 번과
 *    워터마크 플래그가 전부다.
 */

/** 우리 앱들. 여기서 열리면 키가 없어도 된다. */
const OWN_ORIGINS = [
  "https://leviosa.ai.kr",
  "https://www.leviosa.ai.kr",
  "https://dev.leviosa.ai.kr",
  "https://agency.leviosa.ai.kr",
  "https://dev-agency.leviosa.ai.kr",
];

/** 키 모양. 진짜 검증은 나중에 서버가 한다 — 여기서는 오타와 빈 값만 거른다. */
const KEY_SHAPE = /^lvc_[A-Za-z0-9]{16,}$/;

let configuredKey: string | null = null;
let warned = false;

export type CanvasConfig = {
  /** `lvc_`로 시작하는 사용 키. 우리 앱에서는 안 줘도 된다. */
  key?: string;
};

/**
 * 패키지 초기화 한 자리에서 부른다. `createCanvasStore`가 아니라 여기인 이유는,
 * 스토어를 만들 때마다 키를 들고 다니면 호출부 전부가 키를 알아야 하기 때문이다.
 */
export function configureCanvas(config: CanvasConfig): void {
  configuredKey = config.key?.trim() || null;
  warned = false;
}

function currentOrigin(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const origin = window.location?.origin;
    return origin && origin !== "null" ? origin : null;
  } catch {
    return null;
  }
}

/** 개발 중인 로컬. 키를 요구할 자리가 아니다. */
function isLocal(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

/**
 * 워터마크를 찍어야 하는가. 이름이 "허가"가 아니라 "표시"인 것은 일부러다 —
 * 이 함수의 답이 무엇이든 편집기는 똑같이 돈다.
 */
export function shouldWatermark(): boolean {
  const origin = currentOrigin();
  if (origin === null) return false; // 규칙 2 — 못 재면 통과
  if (OWN_ORIGINS.includes(origin) || isLocal(origin)) return false;
  if (configuredKey && KEY_SHAPE.test(configuredKey)) return false;

  if (!warned) {
    warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[leviosa-canvas] 사용 키가 없습니다. configureCanvas({ key }) 로 넣어 주세요. " +
        "키 없이도 편집기는 그대로 돌지만 워터마크가 표시됩니다.",
    );
  }
  return true;
}

/** 테스트용. 프로덕션 코드에서는 부르지 않는다. */
export function resetCanvasConfig(): void {
  configuredKey = null;
  warned = false;
}
