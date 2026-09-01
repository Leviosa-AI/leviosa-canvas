/**
 * 사용 키.
 *
 * **보호 수단이 아니다.** 우리가 바로 그 Polotno 키를 우회했던 당사자다(동일출처
 * 프록시 + `validate-key` 훅). 클라이언트에 실리는 키로 소스를 지킬 수 없다는 것은
 * 우리 손으로 증명했다. 남는 쓸모는 하나 — **누가 얼마나 쓰는지 셀 자리**이고,
 * 그건 나중에 서버가 센다. 여기는 그때까지 키를 들고 있는 자리다.
 *
 * 한때 오리진이 우리 목록에 없으면 캔버스 구석에 «leviosa-canvas» 를 찍었다. 그 표는
 * 우리 화면에도 떴다 — 도메인이 하나 늘 때마다 목록을 고쳐야 했고, 고치기 전까지
 * 우리 제품 위에 우리 이름이 덧칠됐다. 그래서 뺐다. 밖에 팔 때 다시 붙일 자리는
 * 여기지, 화면을 그리는 코드가 아니다.
 *
 * 규칙 둘은 그대로다.
 *
 * 1. **네트워크를 안 탄다.** 검증을 서버로 보내면 엔진의 "서버 호출 0건"이 깨지고,
 *    소싱 서버가 흔들릴 때 편집기가 같이 죽는다.
 * 2. **아무것도 안 던진다.** 키가 틀렸다고 편집기가 멎으면 안 된다.
 */

let configuredKey: string | null = null;

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
}

/** 지금 설정된 키. 쓰임새를 세는 쪽이 읽어 간다. */
export function canvasKey(): string | null {
  return configuredKey;
}

/** 테스트가 판을 비운다. */
export function resetCanvasConfig(): void {
  configuredKey = null;
}
