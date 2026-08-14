/**
 * 움직이는 섹션의 프레임이 서버로 나가는 **전송 포맷**.
 *
 * 눈으로는 안 보이지만 파일 크기에서만 드러나는 계약이라 여기서 잡는다. 프레임을
 * 무손실 PNG 로 내보내던 동안 한 섹션(최대 40장)은 수십 MB 였고, 앞단 nginx 가 본문
 * 상한에 걸어 413 을 돌려줘 WebP 내보내기가 통째로 죽었다. 같은 프레임이 quality 92
 * WebP 로는 몇 분의 1이며, 서버 산출물 자체가 quality 80 이라 눈에 남는 손실도 없다.
 */

import { describe, expect, it, vi } from "vitest";

import { canvasToFrameBlob } from "../gif-export";

type ToBlobCall = { type?: string; quality?: number };

/** jsdom 에는 캔버스 인코더가 없다 — 무엇을 요구했는지만 본다. */
function fakeCanvas(
  calls: ToBlobCall[],
  produce: (type?: string) => Blob | null,
): HTMLCanvasElement {
  return {
    toBlob(
      callback: BlobCallback,
      type?: string,
      quality?: number,
    ) {
      calls.push({ type, quality });
      callback(produce(type));
    },
  } as unknown as HTMLCanvasElement;
}

describe("canvasToFrameBlob", () => {
  it("프레임을 quality 92 WebP 로 요구한다", async () => {
    const calls: ToBlobCall[] = [];
    const canvas = fakeCanvas(calls, (type) => new Blob(["x"], { type }));

    const blob = await canvasToFrameBlob(canvas);

    expect(calls).toEqual([{ type: "image/webp", quality: 0.92 }]);
    expect(blob.type).toBe("image/webp");
  });

  it("WebP 를 못 굽는 브라우저가 PNG 를 돌려줘도 그대로 보낸다", async () => {
    // toBlob 은 모르는 타입이면 스스로 image/png 로 떨어진다. 서버는 이름이 아니라
    // 바이트를 보고 포맷을 가리므로 그 프레임도 인코딩된다 — 예전 용량을 낼 뿐이다.
    const calls: ToBlobCall[] = [];
    const canvas = fakeCanvas(calls, () => new Blob(["x"], { type: "image/png" }));

    const blob = await canvasToFrameBlob(canvas);

    expect(blob.type).toBe("image/png");
  });

  it("인코딩이 실패하면 조용히 빈 프레임을 만들지 않는다", async () => {
    const canvas = fakeCanvas([], () => null);
    const onReject = vi.fn();

    await canvasToFrameBlob(canvas).catch(onReject);

    expect(onReject).toHaveBeenCalledOnce();
  });
});
