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
};
