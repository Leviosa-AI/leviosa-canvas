import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyPatch,
  documentSha256,
  type DetailDocumentPatchV1,
  type DetailDocumentV2,
  type DpnextNode,
  validateDocument,
} from "../../../packages/detail-document-next/src";
import {
  EditorSurface,
  replaceSvg,
  replaceText,
  setLayout,
} from "../../../packages/detail-dom-editor-next/src";
import {
  DocumentRenderer,
  measureDocumentDom,
  placeholderAssetResolver,
  waitForDocumentDom,
  type AssetResolver,
  type DpnextDomMeasurementV1,
} from "../../../packages/detail-dom-renderer-next/src";
import { fixture } from "./fixture";
import {
  DPNEXT_LAB_PROTOCOL,
  isDpnextLabParentMessage,
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

function postToParent(message: DpnextLabMessage): void {
  if (window.parent === window) return;
  window.parent.postMessage(message, window.location.origin);
}

export function LabApp() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const embedded = query.get("mode") === "embed";
  const capture = query.get("mode") === "capture";
  const featureLabel = query.get("fx") || "local";
  const [document, setDocument] = useState<DetailDocumentV2>(fixture);
  const [sha256, setSha256] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void documentSha256(document).then((value) => {
      if (!cancelled) setSha256(value);
    });
    return () => {
      cancelled = true;
    };
  }, [document]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isDpnextLabParentMessage(event.data)) {
        return;
      }
      try {
        validateDocument(event.data.document);
        setDocument(structuredClone(event.data.document));
        setAssetUrls({ ...(event.data.assetUrls ?? {}) });
        setSelection([]);
        setError(null);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "문서를 읽지 못했습니다.";
        setError(message);
        postToParent({ protocol: DPNEXT_LAB_PROTOCOL, type: "error", message });
      }
    };
    window.addEventListener("message", receive);
    postToParent({ protocol: DPNEXT_LAB_PROTOCOL, type: "ready" });
    return () => window.removeEventListener("message", receive);
  }, []);

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
      if (embedded) {
        postToParent({
          protocol: DPNEXT_LAB_PROTOCOL,
          type: "patch",
          patch,
          nodeIds: selection,
        });
        return;
      }
      try {
        setDocument(applyPatch(document, patch, sha256, { allowUserOwned: true }));
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "수정 사항을 적용하지 못했습니다.");
      }
    },
    [document, embedded, selection, sha256],
  );

  const select = (nodeIds: string[]) => {
    setSelection(nodeIds);
    postToParent({ protocol: DPNEXT_LAB_PROTOCOL, type: "selection", nodeIds });
  };

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
              resolveAsset={resolveAsset}
              onSelectionChange={select}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function documentRef(): HTMLElement {
  const root = window.document.querySelector<HTMLElement>("[data-dpnext-document-id]");
  if (!root) throw new Error("DetailDocument renderer is not mounted");
  return root;
}

declare global {
  interface Window {
    __LEVIOSA_DPNEXT_MEASURE__?: () => Promise<DpnextDomMeasurementV1>;
  }
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
  const [layout, setLayoutDraft] = useState(() => ({
    x: Number(node.layout?.x ?? 0),
    y: Number(node.layout?.y ?? 0),
    width: Number(node.layout?.width ?? 0),
    height: Number(node.layout?.height ?? 0),
  }));
  const ready = sha256.length === 64;

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
      <fieldset>
        <legend>위치와 크기</legend>
        <div className="lab-grid">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label key={key}>
              <span>{key}</span>
              <input
                type="number"
                value={layout[key]}
                onChange={(event) => setLayoutDraft((current) => ({ ...current, [key]: Number(event.target.value) }))}
              />
            </label>
          ))}
        </div>
        <button disabled={!ready} onClick={() => onPatch(setLayout(document, sha256, node.id, layout))}>
          위치·크기 적용
        </button>
      </fieldset>
    </div>
  );
}
