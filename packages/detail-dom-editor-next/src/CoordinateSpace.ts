export interface DpnextViewport {
  zoom: number;
  panX: number;
  panY: number;
  surfaceLeft: number;
  surfaceTop: number;
}

export class CoordinateSpace {
  constructor(readonly viewport: DpnextViewport) {
    if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0) {
      throw new Error("zoom must be positive");
    }
  }

  clientToDocument(clientX: number, clientY: number) {
    return {
      x: (clientX - this.viewport.surfaceLeft - this.viewport.panX) / this.viewport.zoom,
      y: (clientY - this.viewport.surfaceTop - this.viewport.panY) / this.viewport.zoom,
    };
  }

  documentToClient(x: number, y: number) {
    return {
      x: x * this.viewport.zoom + this.viewport.panX + this.viewport.surfaceLeft,
      y: y * this.viewport.zoom + this.viewport.panY + this.viewport.surfaceTop,
    };
  }
}
