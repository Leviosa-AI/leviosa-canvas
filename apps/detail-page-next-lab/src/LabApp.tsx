import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";

import {
  CanvasView,
  createCanvasStore,
  type DocumentJson,
} from "../../../packages/canvas";

import {
  type DetailDocumentPatchV1,
  type DetailDocumentV2,
  type DpnextNode,
  type DpnextScalar,
} from "../../../packages/detail-document-next/src";
import {
  EditorSurface,
  cropImage,
  editorHistoryIntent,
  replaceAsset,
  replaceSvg,
  replaceText,
  setLayout,
  useEditorController,
} from "../../../packages/detail-dom-editor-next/src";
import {
  DocumentRenderer,
  measureDocumentDom,
  placeholderAssetResolver,
  waitForDocumentDom,
  type AssetResolver,
  type DpnextDomMeasurementV1,
} from "../../../packages/detail-dom-renderer-next/src";
import { fixture, fixtureAssetUrls } from "./fixture";
import {
  createDpnextSessionNonce,
  DPNEXT_LAB_PROTOCOL,
  DPNEXT_LAB_PROTOCOL_VERSION,
  trustedDpnextMessage,
  type DpnextLabMessage,
} from "./protocol";

function findNode(nodes: DpnextNode[], nodeId: string): DpnextNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findNode(node.children ?? [], nodeId);
    if (child) return child;
  }
  return null;
}

function postToParent(message: DpnextLabMessage, targetOrigin: string): void {
  if (window.parent === window) return;
  window.parent.postMessage(message, targetOrigin);
}

export function LabApp() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const embedded = query.get("mode") === "embed";
  const capture = query.get("mode") === "capture";
  const featureLabel = query.get("fx") || "local";
  const documentSource = query.get("doc");
  const sessionNonce = useMemo(() => query.get("nonce") || createDpnextSessionNonce(), [query]);
  const controller = useEditorController(fixture);
  const {
    applyValidatedPatch,
    loadDocument,
    redo,
    setSelection: setControllerSelection,
    undo,
  } = controller;
  const { document, sha256, selection } = controller.state;
  const [error, setError] = useState<string | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>(fixtureAssetUrls);
  const [canvasDocument, setCanvasDocument] = useState<DocumentJson | null>(null);
  const parentOrigin = useRef(window.location.origin);

  useEffect(() => {
    if (!documentSource) return;
    void fetch(documentSource)
      .then(async (response) => {
        if (!response.ok) throw new Error(`문서를 읽지 못했습니다: ${response.status}`);
        return response.json() as Promise<DetailDocumentV2 | DocumentJson>;
      })
      .then(async (next) => {
        if ("schema_version" in next) {
          await loadDocument(next);
          setAssetUrls(Object.fromEntries(Object.entries(next.assets).map(([id, asset]) => [id, asset.uri])));
        } else {
          setCanvasDocument(next);
        }
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "문서를 읽지 못했습니다.");
      });
  }, [documentSource, loadDocument]);

  const canvasStore = useMemo(
    () => canvasDocument ? createCanvasStore(canvasDocument) : null,
    [canvasDocument],
  );

  useEffect(() => {
    if (!canvasStore) return;
    // 검사 전용: 화면에 붙은 실제 Konva Stage와 그 노드를 읽는다.
    window.__LEVIOSA_CANVAS_VERIFY__ = async () => {
      for (const page of canvasStore.pages) await canvasStore.toDataURL({ pageId: page.id });
      return measureCanvasStages(canvasStore);
    };
    return () => {
      delete window.__LEVIOSA_CANVAS_VERIFY__;
    };
  }, [canvasStore]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const expected = { source: window.parent, origin: window.location.origin, sessionNonce };
      const message = trustedDpnextMessage(event, expected);
      if (!message) return;
      try {
        parentOrigin.current = event.origin;
        void loadDocument(message.document).catch((cause: unknown) => {
          const errorMessage = cause instanceof Error ? cause.message : "문서를 읽지 못했습니다.";
          setError(errorMessage);
          postToParent(envelope(sessionNonce, { type: "error", message: errorMessage }), parentOrigin.current);
        });
        setAssetUrls({ ...(message.assetUrls ?? {}) });
        setControllerSelection([]);
        setError(null);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "문서를 읽지 못했습니다.";
        setError(message);
        postToParent(envelope(sessionNonce, { type: "error", message }), parentOrigin.current);
      }
    };
    window.addEventListener("message", receive);
    postToParent(envelope(sessionNonce, { type: "ready" }), parentOrigin.current);
    return () => window.removeEventListener("message", receive);
  }, [loadDocument, sessionNonce, setControllerSelection]);

  const resolveAsset = useCallback<AssetResolver>((assetId, asset) => {
    const resolved = assetUrls[assetId];
    return resolved || placeholderAssetResolver(assetId, asset);
  }, [assetUrls]);

  useEffect(() => {
    if (!capture) return;
    window.__LEVIOSA_DPNEXT_MEASURE__ = async () => {
      const root = documentRef();
      await waitForDocumentDom(root);
      return measureDocumentDom(root);
    };
    return () => {
      delete window.__LEVIOSA_DPNEXT_MEASURE__;
    };
  }, [capture, document, assetUrls]);

  const selectedNode = selection.length
    ? findNode(document.sections, selection.at(-1)!)
    : null;

  const commitPatch = useCallback(
    (patch: DetailDocumentPatchV1) => {
      try {
        void applyValidatedPatch(patch)
          .then(() => {
            if (embedded) {
              postToParent(envelope(sessionNonce, {
                type: "patch",
                patch,
                nodeIds: selection,
              }), parentOrigin.current);
            }
            setError(null);
          })
          .catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : "수정 사항을 적용하지 못했습니다.");
          });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "수정 사항을 적용하지 못했습니다.");
      }
    },
    [applyValidatedPatch, embedded, selection, sessionNonce],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const intent = editorHistoryIntent(event);
      if (!intent) return;
      event.preventDefault();
      const operation = intent === "undo" ? undo : redo;
      void operation()
        .then((commit) => {
          if (!commit || !embedded) return;
          postToParent(envelope(sessionNonce, {
            type: "patch",
            patch: commit.patch,
            nodeIds: selection,
          }), parentOrigin.current);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "실행 취소를 적용하지 못했습니다.");
        });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [embedded, redo, selection, sessionNonce, undo]);

  const select = (nodeIds: string[]) => {
    setControllerSelection(nodeIds);
    postToParent(envelope(sessionNonce, { type: "selection", nodeIds }), parentOrigin.current);
  };

  if (canvasStore) {
    return (
      <main data-verify-canvas-document>
        <CanvasView store={canvasStore} />
      </main>
    );
  }

  if (capture) {
    return (
      <div className="dpnext-capture-surface">
        <DocumentRenderer document={document} resolveAsset={resolveAsset} />
      </div>
    );
  }

  return (
    <div className={embedded ? "lab-app lab-app--embedded" : "lab-app"}>
      <header className="lab-header">
        <div>
          <strong>Detail Page Next</strong>
          <span>DOM renderer/editor lab · Konva 0</span>
        </div>
        <dl>
          <div><dt>feature</dt><dd>{featureLabel}</dd></div>
          <div><dt>revision</dt><dd>{document.revision}</dd></div>
        </dl>
      </header>
      <main className="lab-workspace">
        <aside className="lab-inspector" aria-label="DOM 레이어 편집기">
          <div className="lab-inspector__heading">
            <span>선택 레이어</span>
            <strong>{selectedNode?.name || selectedNode?.id || "없음"}</strong>
          </div>
          {selectedNode ? (
            <NodeInspector
              key={`${document.revision}:${selectedNode.id}`}
              node={selectedNode}
              document={document}
              sha256={sha256}
              onPatch={commitPatch}
            />
          ) : (
            <p className="lab-empty">캔버스에서 텍스트, 이미지, SVG를 클릭해 선택하세요.</p>
          )}
          {error ? <p className="lab-error" role="alert">{error}</p> : null}
        </aside>
        <section className="lab-stage" aria-label="상세페이지 DOM 캔버스">
          <div className="lab-canvas">
            <EditorSurface
              document={document}
              sha256={sha256}
              resolveAsset={resolveAsset}
              onSelectionChange={select}
              onPatch={commitPatch}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

type LayoutKey = "x" | "y" | "width" | "height";

function layoutField(node: DpnextNode, key: LayoutKey): string {
  const value = node.layout?.[key];
  return typeof value === "number" || typeof value === "string" ? String(value) : "";
}

function scalarFromField(value: string): DpnextScalar | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^-?\d+(?:\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed;
}

function layoutPatchValue(layout: Record<LayoutKey, string>): Record<string, DpnextScalar> {
  const next: Record<string, DpnextScalar> = {};
  for (const key of ["x", "y", "width", "height"] as const) {
    const value = scalarFromField(layout[key]);
    if (value !== undefined) next[key] = value;
  }
  if (next.x !== undefined || next.y !== undefined) next.mode = "absolute";
  return next;
}

function envelope<T extends Omit<DpnextLabMessage, "protocol" | "version" | "sessionNonce">>(
  sessionNonce: string,
  message: T,
): DpnextLabMessage {
  return {
    protocol: DPNEXT_LAB_PROTOCOL,
    version: DPNEXT_LAB_PROTOCOL_VERSION,
    sessionNonce,
    ...message,
  } as DpnextLabMessage;
}

function documentRef(): HTMLElement {
  const root = window.document.querySelector<HTMLElement>("[data-dpnext-document-id]");
  if (!root) throw new Error("DetailDocument renderer is not mounted");
  return root;
}

declare global {
  interface Window {
    __LEVIOSA_DPNEXT_MEASURE__?: () => Promise<DpnextDomMeasurementV1>;
    __LEVIOSA_CANVAS_VERIFY__?: () => Promise<CanvasMeasurement>;
  }
}

type RectMeasurement = { x: number; y: number; width: number; height: number };

type CanvasMeasurement = {
  pages: Array<RectMeasurement & { id: string; nodeCount: number }>;
  textNodes: Array<RectMeasurement & {
    id: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    lineCount: number;
  }>;
  imageNodes: Array<RectMeasurement & { id: string; crop: RectMeasurement | null }>;
};

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function nodeId(node: Konva.Node): string {
  let current: Konva.Node | null = node;
  while (current && !current.id()) current = current.getParent();
  return current?.id() ?? "";
}

function rect(node: Konva.Node): RectMeasurement {
  const value = node.getClientRect({ skipShadow: true, skipStroke: true });
  return {
    x: rounded(value.x),
    y: rounded(value.y),
    width: rounded(value.width),
    height: rounded(value.height),
  };
}

function measureCanvasStages(store: ReturnType<typeof createCanvasStore>): CanvasMeasurement {
  const root = window.document.querySelector("[data-verify-canvas-document]");
  const stages = Konva.stages.filter((stage) => root?.contains(stage.container()));
  const textNodes = stages.flatMap((stage) => stage.find("Text")).map((node) => ({
    id: nodeId(node),
    fontFamily: String(node.getAttr("fontFamily") ?? ""),
    fontSize: rounded(Number(node.getAttr("fontSize") ?? 0)),
    fontWeight: String(node.getAttr("fontStyle") ?? "normal"),
    lineCount: ((node as Konva.Text & { textArr?: unknown[] }).textArr ?? []).length,
    ...rect(node),
  }));
  const imageNodes = stages.flatMap((stage) => stage.find("Image")).map((node) => {
    const crop = (node as Konva.Image).crop();
    return {
      id: nodeId(node),
      crop: crop.width || crop.height ? {
        x: rounded(crop.x),
        y: rounded(crop.y),
        width: rounded(crop.width),
        height: rounded(crop.height),
      } : null,
      ...rect(node),
    };
  });
  return {
    pages: stages.map((stage, index) => ({
      id: store.pages[index]?.id ?? String(index),
      width: rounded(stage.width()),
      height: rounded(stage.height()),
      x: 0,
      y: 0,
      nodeCount: new Set(stage.find(".lc-element").map((node) => node.id())).size,
    })),
    textNodes,
    imageNodes,
  };
}

function NodeInspector({
  node,
  document,
  sha256,
  onPatch,
}: {
  node: DpnextNode;
  document: DetailDocumentV2;
  sha256: string;
  onPatch: (patch: DetailDocumentPatchV1) => void;
}) {
  const [text, setText] = useState(node.content ?? "");
  const [svg, setSvg] = useState(node.svg ?? "");
  const [assetId, setAssetId] = useState(node.assetId ?? "");
  const [crop, setCrop] = useState(String(node.style?.objectPosition ?? "center center"));
  const [layout, setLayoutDraft] = useState(() => ({
    x: layoutField(node, "x"),
    y: layoutField(node, "y"),
    width: layoutField(node, "width"),
    height: layoutField(node, "height"),
  }));
  const ready = sha256.length === 64;
  const assetOptions = Object.entries(document.assets).filter(([, asset]) => {
    if (node.type === "video") return asset.kind === "video";
    if (node.type === "image") return asset.kind === "image" || asset.kind === "gif";
    return false;
  });

  return (
    <div className="lab-inspector__body">
      <p className="lab-node-meta">{node.type} · {node.id}</p>
      {node.type === "text" ? (
        <label>
          <span>텍스트</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} />
          <button disabled={!ready || text === node.content} onClick={() => onPatch(replaceText(document, sha256, node.id, text))}>
            텍스트 적용
          </button>
        </label>
      ) : null}
      {node.type === "svg" ? (
        <label>
          <span>SVG</span>
          <textarea value={svg} onChange={(event) => setSvg(event.target.value)} rows={8} spellCheck={false} />
          <button disabled={!ready || svg === node.svg} onClick={() => onPatch(replaceSvg(document, sha256, node.id, svg))}>
            SVG 적용
          </button>
        </label>
      ) : null}
      {node.type === "image" || node.type === "video" ? (
        <fieldset>
          <legend>에셋</legend>
          <label>
            <span>assetId</span>
            <select value={assetId} onChange={(event) => setAssetId(event.target.value)}>
              {assetOptions.map(([id]) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <button disabled={!ready || assetId === node.assetId} onClick={() => onPatch(replaceAsset(document, sha256, node.id, assetId))}>
            에셋 교체
          </button>
          {node.type === "image" ? (
            <label>
              <span>crop</span>
              <input
                type="text"
                value={crop}
                placeholder="center center"
                onChange={(event) => setCrop(event.target.value)}
              />
              <button disabled={!ready} onClick={() => onPatch(cropImage(document, sha256, node.id, crop))}>
                크롭 적용
              </button>
            </label>
          ) : null}
        </fieldset>
      ) : null}
      <fieldset>
        <legend>위치와 크기</legend>
        <div className="lab-grid">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label key={key}>
              <span>{key}</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="auto"
                value={layout[key]}
                onChange={(event) => setLayoutDraft((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
        <button disabled={!ready} onClick={() => onPatch(setLayout(document, sha256, node.id, layoutPatchValue(layout)))}>
          위치·크기 적용
        </button>
      </fieldset>
    </div>
  );
}
