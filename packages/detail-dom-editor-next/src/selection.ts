// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
export function nextSelection(
  current: readonly string[],
  nodeId: string,
  multi: boolean,
): string[] {
  if (!multi) return [nodeId];
  return current.includes(nodeId)
    ? current.filter((selected) => selected !== nodeId)
    : [...current, nodeId];
}

export function snap(value: number, guides: readonly number[], threshold = 6): number {
  const target = guides.find((guide) => Math.abs(guide - value) <= threshold);
  return target ?? value;
}
