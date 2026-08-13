import { SelectionOverlay, type OverlayRect } from "./SelectionOverlay";

interface TransformOverlayProps {
  rect: OverlayRect;
  zoom?: number;
  onMove: (deltaX: number, deltaY: number) => void;
  onResize: (width: number, height: number) => void;
  onRotate: (degrees: number) => void;
}

export function TransformOverlay({ rect, zoom, onMove, onResize, onRotate }: TransformOverlayProps) {
  return (
    <div data-dpnext-transform-overlay>
      <SelectionOverlay rect={rect} zoom={zoom} />
      <button type="button" aria-label="오른쪽으로 이동" onClick={() => onMove(1, 0)}>→</button>
      <button type="button" aria-label="크기 늘리기" onClick={() => onResize(rect.width + 1, rect.height + 1)}>↘</button>
      <button type="button" aria-label="15도 회전" onClick={() => onRotate(15)}>↻</button>
    </div>
  );
}
