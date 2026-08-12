/**
 * 무료 스톡 사진(Pexels) 검색 — 편집기 "사진" 패널이 쓰는 얇은 층.
 *
 * 검색은 우리 서버(`/api/stock-photos`)를 거친다(키를 브라우저에 안 내린다).
 * 고른 사진은 **우리 S3로 옮겨 담은 뒤** 캔버스에 얹는다. 남의 주소를 문서에 그대로
 * 박으면 상세페이지가 그 서버의 수명에 묶이고, 나중에 서버가 다시 그릴 때도 그 주소를
 * 다시 받아야 한다. 브랜드 이미지·AI 이미지가 이미 같은 규칙으로 산다.
 */

export type StockPhoto = {
  id: string;
  /** 격자에 뿌리는 작은 그림. */
  thumb: string;
  /** 캔버스에 얹을 원본급 그림. */
  full: string;
  width: number;
  height: number;
  alt: string;
  photographer: string;
  photographerUrl: string;
  /** 제공처의 사진 페이지 — 출처 표기 링크가 여기로 간다. */
  pageUrl: string;
};

export type StockPhotoResponse = {
  photos: StockPhoto[];
  hasMore: boolean;
  /** 서버에 키가 없으면 false — 패널은 오류 대신 안내를 띄운다. */
  configured: boolean;
};

export type StockPhotoQuery = {
  query: string;
  page: number;
  perPage?: number;
  signal?: AbortSignal;
};

export async function searchStockPhotos({
  query,
  page,
  perPage,
  signal,
}: StockPhotoQuery): Promise<StockPhotoResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (query.trim()) params.set("q", query.trim());
  if (perPage) params.set("per_page", String(perPage));

  const response = await fetch(`/api/stock-photos?${params.toString()}`, {
    signal,
  });
  if (!response.ok) throw new Error(`stock-photos ${response.status}`);
  return (await response.json()) as StockPhotoResponse;
}

function extensionOf(url: string): string {
  const match = /\.(jpe?g|png|webp)(?:$|\?)/i.exec(url);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

/**
 * 사진을 받아 파일로 만든다. 업로더가 File을 받으므로 여기서 Blob을 감싼다.
 *
 * Pexels CDN은 `Access-Control-Allow-Origin: *`을 준다 — 브라우저에서 바로 받을 수
 * 있다는 뜻이고, 이건 나중에 캔버스를 내보낼 때도 같은 이유로 필요하다.
 */
export async function fetchStockPhotoFile(photo: StockPhoto): Promise<File> {
  const response = await fetch(photo.full, { mode: "cors" });
  if (!response.ok) throw new Error(`stock-photo-download ${response.status}`);
  const blob = await response.blob();
  const type = blob.type || "image/jpeg";
  return new File([blob], `pexels-${photo.id}.${extensionOf(photo.full)}`, {
    type,
  });
}

/**
 * 사진을 우리 쪽 주소로 옮겨 담는다. 업로더가 없으면(예: 개발용 하니스) 원본 주소를
 * 그대로 돌려준다 — 넣는 일 자체는 막지 않는다.
 */
export async function mirrorStockPhoto(
  photo: StockPhoto,
  uploadFile?: (file: File) => Promise<string>,
): Promise<string> {
  if (!uploadFile) return photo.full;
  const file = await fetchStockPhotoFile(photo);
  return uploadFile(file);
}
