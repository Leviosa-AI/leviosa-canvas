/**
 * 상품 사진을 브랜드 버킷에 올리는 길 — **줄이기 + presigned 업로드**.
 *
 * 생성 화면 안에만 있던 것을 꺼냈다. 새 상품 시작 화면(`/branding/detail-page-generator/new`)
 * 도 같은 사진을 같은 자리에 올려야 하는데, 화면 두 곳이 각자 줄이면 압축 품질과 상한이
 * 갈라진다 — 한쪽에서 올린 사진만 유독 뭉개지는 식이다.
 *
 * ## 왜 브라우저에서 먼저 줄이는가
 *
 * 원본 그대로 올리면 요즘 폰 사진 한 장이 8MB 를 넘는다. 열 장이면 업로드만 몇 분이고,
 * 그 사이 유저는 아무것도 못 한다. 그리고 상세페이지에 실릴 크기는 어차피 긴 변
 * 1600px 이라 그 위는 버리는 픽셀이다.
 *
 * 품질은 위에서부터 내려가며 상한(1.5MB)에 처음 걸리는 값을 쓴다. 고정 품질로 잡으면
 * 단색 그림은 필요 이상으로 뭉개지고, 복잡한 그림은 상한을 못 지킨다.
 */

import type { DetailPageHostApi } from "../../components/detail-page/detail-page-host-context";

/** 고를 수 있는 원본 크기. 이보다 크면 캔버스에 그리기 전에 메모리가 먼저 눕는다. */
export const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
/** 줄인 뒤 목표 크기. */
export const MAX_COMPRESSED_REFERENCE_BYTES = 1.5 * 1024 * 1024;
/** 줄인 뒤 긴 변. 상세페이지가 쓰는 폭보다 넉넉하다. */
export const MAX_REFERENCE_IMAGE_DIMENSION = 1600;

export interface UploadedReferenceImage {
  id: string;
  name: string;
  previewUrl: string;
  size: number;
  contentType: string;
  s3Key: string;
  role: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return "";
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

export async function compressReferenceImage(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    const scale = Math.min(
      1,
      MAX_REFERENCE_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");
    // 투명 PNG 를 JPEG 로 바꾸면 투명한 자리가 검게 남는다. 흰색을 먼저 깐다.
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.88, 0.82, 0.76, 0.7]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!blob) continue;
      if (blob.size <= MAX_COMPRESSED_REFERENCE_BYTES || quality === 0.7) {
        return blob;
      }
    }
    throw new Error("Image compression failed");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadReferenceImage(input: {
  blob: Blob;
  fileName: string;
  userId: string;
  productId?: string;
  generatedId?: string | null;
  slotRole?: string;
  /**
   * presigned URL 을 발급하는 소싱 서버 호출. 훅을 못 쓰는 자리라 호출부가 넘긴다
   * (`DetailPageHost.api.createDetailPageReferenceImageUploadUrl`).
   */
  createUploadUrl: DetailPageHostApi["createDetailPageReferenceImageUploadUrl"];
}): Promise<{ s3Key: string; contentType: string }> {
  const shouldAttachSlotMeta = Boolean(input.generatedId && input.slotRole);
  const payload = await input.createUploadUrl({
    user_id: input.userId,
    product_id: input.productId || undefined,
    generated_id: shouldAttachSlotMeta ? input.generatedId : undefined,
    slot_role: shouldAttachSlotMeta ? input.slotRole : undefined,
    file_name: input.fileName.replace(/\.[^.]+$/, ".jpg"),
    content_type: "image/jpeg",
    file_size_bytes: input.blob.size,
  });

  const uploadUrl = firstString(payload.upload_url, payload.uploadUrl);
  const uploadMethod = firstString(payload.upload_method, payload.uploadMethod, "POST");
  const s3Key = firstString(payload.s3_key, payload.s3Key, payload.key);
  const contentType = firstString(payload.content_type, payload.contentType, "image/jpeg");
  if (!uploadUrl) throw new Error("Upload URL is missing");
  if (!s3Key) throw new Error("S3 key is missing");

  const fields = asRecord(payload.form_fields ?? payload.formFields ?? payload.fields);
  const uploadedFileName = input.fileName.replace(/\.[^.]+$/, ".jpg");
  if (uploadMethod.toUpperCase() === "POST" && fields) {
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    const uploadFile =
      input.blob instanceof File
        ? input.blob
        : new File([input.blob], uploadedFileName, { type: contentType });
    formData.append("file", uploadFile);
    const uploadResponse = await fetch(uploadUrl, { method: "POST", body: formData });
    if (
      uploadResponse.status !== 204 &&
      uploadResponse.status !== 201 &&
      uploadResponse.status !== 200
    ) {
      const errorText = await uploadResponse.text().catch(() => "");
      throw new Error(errorText || "Reference image upload failed");
    }
  } else {
    const presignedHeaders = asRecord(payload.headers);
    const uploadResponse = await fetch(uploadUrl, {
      method: uploadMethod || "PUT",
      headers: {
        ...Object.fromEntries(
          Object.entries(presignedHeaders ?? {}).map(([key, value]) => [
            key,
            String(value),
          ]),
        ),
        "Content-Type": contentType,
      },
      body: input.blob,
    });
    if (
      uploadResponse.status !== 204 &&
      uploadResponse.status !== 201 &&
      uploadResponse.status !== 200
    ) {
      const errorText = await uploadResponse.text().catch(() => "");
      throw new Error(errorText || "Reference image upload failed");
    }
  }

  return { s3Key, contentType };
}
