// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
export type CanvasSlotBinding = {
  page_id?: string | null;
  element_id: string;
  kind: "text" | "image" | "number" | "html" | "rich";
};

export type LeviosaCanvasDocument = {
  schema_version: "leviosa-canvas-detail-page-v1";
  renderer: "leviosa_canvas_detail_page";
  kind?: "detail-page" | "carousel";
  template_id?: string | null;
  template_version?: number | null;
  canvas: {
    width: number;
    background: string;
  };
  slot_bindings?: Record<string, CanvasSlotBinding>;
  canvas_json: Record<string, unknown>;
  fonts: Array<Record<string, unknown>>;
  source: "leviosa_canvas_editor";
  /**
   * 서버가 준 문서 리비전(etag·버전 번호). 있으면 `onSave` 의 `meta.revision` 으로
   * 되돌아가 충돌 감지에 쓰인다. 없으면 감지를 안 한다.
   */
  revision?: string | number;
};
