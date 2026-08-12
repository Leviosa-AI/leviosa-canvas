/** RGBA color parsed from the CSS strings our documents carry. */
export type ParsedColor = { r: number; g: number; b: number; a: number };

/** Parse 'rgb(…)', 'rgba(…)', '#rrggbb(aa)', '#rgb' into {r,g,b,a}. */
export function parseColor(value: unknown): ParsedColor | null {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  let m = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (m) {
    return {
      r: Math.round(+m[1]),
      g: Math.round(+m[2]),
      b: Math.round(+m[3]),
      a: m[4] === undefined ? 1 : +m[4],
    };
  }
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: m[2] ? parseInt(m[2], 16) / 255 : 1,
    };
  }
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  return null;
}
