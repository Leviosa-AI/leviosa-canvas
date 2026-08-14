export interface DpnextRectMeasurement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DpnextTextMeasurement {
  nodeId: string;
  sectionId: string;
  rect: DpnextRectMeasurement;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number | null;
  color: string;
}

export interface DpnextSectionMeasurement {
  sectionId: string;
  rect: DpnextRectMeasurement;
  textNodeIds: string[];
}

export interface DpnextDomMeasurementV1 {
  schemaVersion: "dpnext-dom-measurement-v1";
  documentId: string;
  revision: number;
  deviceScaleFactor: number;
  documentRect: DpnextRectMeasurement;
  sections: DpnextSectionMeasurement[];
  textNodes: DpnextTextMeasurement[];
  fontsReady: boolean;
  imagesReady: boolean;
}

function finite(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

function relativeRect(rect: DOMRect, root: DOMRect): DpnextRectMeasurement {
  return {
    x: finite(rect.left - root.left),
    y: finite(rect.top - root.top),
    width: finite(rect.width),
    height: finite(rect.height),
  };
}

function cssPixels(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? finite(parsed) : null;
}

/** Measure the exact DOM used by preview and export without translating it to another scene graph. */
export function measureDocumentDom(
  root: HTMLElement,
  deviceScaleFactor = window.devicePixelRatio || 1,
): DpnextDomMeasurementV1 {
  const documentId = root.dataset.dpnextDocumentId;
  const revision = Number(root.dataset.dpnextRevision);
  if (!documentId || !Number.isInteger(revision) || revision < 0) {
    throw new Error("measurement root is not a DetailDocument renderer");
  }
  const rootRect = root.getBoundingClientRect();
  const textNodes = [...root.querySelectorAll<HTMLElement>('[data-dpnext-node-type="text"]')]
    .map((element): DpnextTextMeasurement | null => {
      const section = element.closest<HTMLElement>('[data-dpnext-node-type="section"]');
      const nodeId = element.dataset.dpnextNodeId;
      const sectionId = section?.dataset.dpnextNodeId;
      if (!nodeId || !sectionId) return null;
      const computed = getComputedStyle(element);
      return {
        nodeId,
        sectionId,
        rect: relativeRect(element.getBoundingClientRect(), rootRect),
        fontFamily: computed.fontFamily,
        fontSize: cssPixels(computed.fontSize) ?? 0,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight === "normal" ? null : cssPixels(computed.lineHeight),
        color: computed.color,
      };
    })
    .filter((value): value is DpnextTextMeasurement => value !== null);
  const textIdsBySection = new Map<string, string[]>();
  for (const text of textNodes) {
    const ids = textIdsBySection.get(text.sectionId) ?? [];
    ids.push(text.nodeId);
    textIdsBySection.set(text.sectionId, ids);
  }
  const sections = [...root.querySelectorAll<HTMLElement>('[data-dpnext-node-type="section"]')]
    .map((element): DpnextSectionMeasurement | null => {
      const sectionId = element.dataset.dpnextNodeId;
      if (!sectionId) return null;
      return {
        sectionId,
        rect: relativeRect(element.getBoundingClientRect(), rootRect),
        textNodeIds: textIdsBySection.get(sectionId) ?? [],
      };
    })
    .filter((value): value is DpnextSectionMeasurement => value !== null);
  const fonts = document.fonts;
  const images = [...root.querySelectorAll<HTMLImageElement>("img")];
  return {
    schemaVersion: "dpnext-dom-measurement-v1",
    documentId,
    revision,
    deviceScaleFactor: finite(deviceScaleFactor),
    documentRect: relativeRect(rootRect, rootRect),
    sections,
    textNodes,
    fontsReady: !fonts || fonts.status === "loaded",
    imagesReady: images.every((image) => image.complete && image.naturalWidth > 0),
  };
}

/** Wait until browser layout inputs have settled before measurement or screenshot. */
export async function waitForDocumentDom(root: HTMLElement): Promise<void> {
  if (document.fonts) await document.fonts.ready;
  const images = [...root.querySelectorAll<HTMLImageElement>("img")];
  await Promise.all(images.map(async (image) => {
    if (image.complete) return;
    await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
