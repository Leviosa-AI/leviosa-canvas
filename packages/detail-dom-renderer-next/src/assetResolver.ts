import type { DpnextAsset } from "../../detail-document-next/src";

export type AssetResolver = (assetId: string, asset: DpnextAsset) => string;

export const placeholderAssetResolver: AssetResolver = (assetId, asset) => {
  if (!asset.uri.startsWith("asset://placeholder/")) {
    throw new Error(`external asset requires an explicit resolver: ${assetId}`);
  }
  const label = encodeURIComponent(assetId);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='750' height='500'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%23666'%3E${label}%3C/text%3E%3C/svg%3E`;
};
