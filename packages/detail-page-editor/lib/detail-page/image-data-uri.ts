/**
 * 편집기 이미지 src 를 **캔버스에 그릴 수 있는** data URI 로 바꾼다.
 *
 * 주석 합성은 밑그림을 캔버스에 그린 다음 ``toDataURL`` 로 뽑는다. 교차 출처 이미지를
 * 그리면 그 캔버스가 오염돼 ``toDataURL`` 이 SecurityError 로 터진다 — 그것도 유저가
 * 다 그리고 제출을 누른 **다음에야**. 그래서 그리기 전에 바이트를 먼저 확보한다.
 *
 * 실패하면 ``null``. 호출부는 그때 "그림으로 지시"를 열지 않거나 글로만 받는다.
 */
export async function toDrawableDataUri(src: string): Promise<string | null> {
  const cleaned = String(src || "").trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("data:")) return cleaned;
  try {
    const res = await fetch(cleaned);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    // 교차 출처·CORS 미허용. 원본 URL 을 그대로 돌려주면 캔버스가 오염되므로 안 준다.
    return null;
  }
}
