/**
 * Zoom math for the interactive diagram canvas.
 *
 * The one rule that matters here is the **zoom-out lock**: the diagram must never
 * be shrunk past the point where it just fits the viewport. On iOS Safari an SVG
 * given a very small intrinsic width/height stops repainting and flashes white
 * when a pinch gesture ends — so we cap how far out the user can zoom at the
 * fit-to-screen scale instead of a tiny fixed floor.
 */

/** Absolute smallest scale, a safety floor for pathologically large diagrams. */
export const MIN_SCALE = 0.1;
/** Largest zoom-in scale. */
export const MAX_SCALE = 4;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The lower bound for the view scale — the *zoom-out lock*. Returns the scale at
 * which the whole diagram just fits inside the padded viewport, never above 1 (a
 * diagram smaller than the viewport still rests at 100% rather than being forced
 * larger) and never below {@link MIN_SCALE}. Returns the floor when sizes are
 * unknown/degenerate so callers never divide by zero.
 */
export function minZoomScale(
  viewportW: number,
  viewportH: number,
  layoutW: number,
  layoutH: number,
  pad = 24,
): number {
  if (!(viewportW > 0) || !(viewportH > 0) || !(layoutW > 0) || !(layoutH > 0)) return MIN_SCALE;
  const fitW = (viewportW - pad * 2) / layoutW;
  const fitH = (viewportH - pad * 2) / layoutH;
  return clamp(Math.min(fitW, fitH, 1), MIN_SCALE, 1);
}
