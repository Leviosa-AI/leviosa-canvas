/**
 * Pure timeline math for encoding a section as one animated GIF. A section may
 * hold several source GIFs of different lengths; we sample a single shared
 * timeline so the exported loop is seamless, then clamp fps and frame count so
 * a full-width section never explodes into a multi-MB file.
 */

export const GIF_MAX_FPS = 12;
export const GIF_MAX_FRAMES = 40;
/** Cap the shared loop so LCM of mismatched sources can't run away. */
export const GIF_MAX_LOOP_MS = 8000;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

export type GifTimeline = {
  /** Sample times (ms) from loop start; one exported frame each. */
  times: number[];
  /** Per-frame delay written into the output GIF (ms). */
  frameDelayMs: number;
  /** Total loop length the samples cover (ms). */
  loopMs: number;
  /** Effective frames-per-second after clamping. */
  fps: number;
};

/**
 * Build the shared sampling timeline for a section from its source GIF
 * durations (ms). One source → its own duration; several → the LCM (so every
 * source lands on a whole loop), capped by ``GIF_MAX_LOOP_MS``. Sample at up to
 * ``maxFps``, then reduce fps if that would exceed ``maxFrames``.
 */
export function buildGifTimeline(
  durationsMs: number[],
  opts: { maxFps?: number; maxFrames?: number; maxLoopMs?: number } = {},
): GifTimeline {
  const maxFps = opts.maxFps ?? GIF_MAX_FPS;
  const maxFrames = opts.maxFrames ?? GIF_MAX_FRAMES;
  const maxLoopMs = opts.maxLoopMs ?? GIF_MAX_LOOP_MS;

  const valid = durationsMs.filter((d) => Number.isFinite(d) && d > 0);
  if (valid.length === 0) {
    return { times: [0], frameDelayMs: 1000 / maxFps, loopMs: 0, fps: maxFps };
  }

  // Seed the fold with the first duration (not 0) — lcm(0, x) is 0 and would
  // collapse the whole loop.
  let loopMs = valid.map((d) => Math.round(d)).reduce((acc, d) => lcm(acc, d));
  if (!Number.isFinite(loopMs) || loopMs <= 0) loopMs = Math.max(...valid);
  if (loopMs > maxLoopMs) loopMs = Math.max(...valid.map((d) => Math.min(d, maxLoopMs)));
  loopMs = Math.min(loopMs, maxLoopMs);

  let count = Math.max(1, Math.round((loopMs / 1000) * maxFps));
  if (count > maxFrames) count = maxFrames;

  const frameDelayMs = loopMs / count;
  const times = Array.from({ length: count }, (_, i) => i * frameDelayMs);
  return { times, frameDelayMs, loopMs, fps: 1000 / frameDelayMs };
}
