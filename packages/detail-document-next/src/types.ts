export type DpnextNodeType =
  | "section"
  | "frame"
  | "group"
  | "text"
  | "image"
  | "video"
  | "svg"
  | "shape"
  | "particles"
  | "divider";

export type DpnextScalar = null | boolean | number | string | DpnextScalar[] | {
  [key: string]: DpnextScalar;
};

export interface DpnextAsset {
  kind: "image" | "svg" | "video" | "gif";
  uri: string;
  mimeType: string;
  sha256: string;
  width?: number;
  height?: number;
}

export interface DpnextNode {
  id: string;
  type: DpnextNodeType;
  name?: string;
  role?: string;
  content?: string;
  marks?: DpnextScalar[];
  assetId?: string;
  alt?: string;
  svg?: string;
  shape?: Record<string, DpnextScalar>;
  particles?: Record<string, DpnextScalar>;
  layout?: Record<string, DpnextScalar>;
  style?: Record<string, DpnextScalar>;
  children?: DpnextNode[];
  metadata?: {
    lastModifiedBy?: "user" | "agent" | string;
    lastModifiedAt?: string;
    lockPolicy?: string;
    source?: string;
    sourceData?: Record<string, DpnextScalar>;
  };
}

export interface DetailDocumentV2 {
  schema_version: "detail-document-v2";
  document_kind?: "brand_detail" | "seller_archetype" | "cardnews";
  document_id: string;
  revision: number;
  revision_sha256?: string | null;
  canvas: { width: number; height?: number; background?: string };
  theme?: Record<string, DpnextScalar>;
  sections: DpnextNode[];
  assets: Record<string, DpnextAsset>;
  metadata?: Record<string, DpnextScalar>;
}

export type DpnextPatchOperation =
  | { op: "replace_text"; node_id: string; value: string }
  | { op: "set_style" | "set_layout"; node_id: string; value: Record<string, DpnextScalar> }
  | { op: "replace_asset" | "replace_svg"; node_id: string; value: string }
  | { op: "insert_node"; parent_id: string; index: number; value: DpnextNode }
  | { op: "remove_node"; node_id: string }
  | { op: "move_node"; node_id: string; parent_id: string; index: number }
  | { op: "duplicate_node"; node_id: string; value: Record<string, string> }
  | { op: "replace_section"; node_id: string; value: DpnextNode };

export interface DetailDocumentPatchV1 {
  schema_version: "detail-document-patch-v1";
  document_id: string;
  base_revision: number;
  base_sha256: string;
  intent?: string;
  operations: DpnextPatchOperation[];
}
