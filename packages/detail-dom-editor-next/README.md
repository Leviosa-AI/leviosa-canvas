# Detail DOM Editor Next

This package is an isolated DOM interaction engine for DetailDocument v2. It neither imports nor
adapts the existing Konva store. All mutations are emitted as detail-document-patch-v1 CAS commands.

The initial spike intentionally does not add Moveable or Selecto. Coordinate transforms, selection,
move/resize/rotate, Korean IME, 800-node rendering, and 100-step history are tested first with a small
owned overlay. A future interaction-library spike can replace only the overlays without changing the
document, renderer, or patch contracts.
