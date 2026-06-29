/**
 * Zoom math for the interactive diagram canvas.
 *
 * The one rule that matters here is the **zoom-out lock**: the diagram must never
 * be shrunk past the point where it just fits the viewport (the Reset control
 * returns to exactly that fit scale). Zoom-IN is bounded only by a generous fixed
 * {@link MAX_SCALE} ceiling.
 *
 * There used to be a per-diagram rasterisation-budget cap here that throttled
 * zoom-in on large/tall diagrams. It was added to chase an iOS Safari white-screen
 * that was later traced to a different cause — the SVG being resized at its
 * intrinsic width/height on every pinch frame, since fixed by zooming with a GPU
 * CSS transform instead. With that root cause gone the budget cap was removed, so
 * zoom-in is no longer limited by device or diagram size (a wide diagram of one
 * long sentence — e.g. Ephesians 1:3–14 in Dependency mode — can be read up close).
 */

/** Absolute smallest scale, a safety floor for pathologically large diagrams. */
export const MIN_SCALE = 0.1;
/** Generous fixed zoom-in ceiling (a sane bound, not a rasterisation budget). */
export const MAX_SCALE = 24;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Upper bound for the view scale: the fixed {@link MAX_SCALE} ceiling, never below
 * `floor` so the zoom range can't invert against the zoom-out lock.
 */
export function maxZoomScale(floor = MIN_SCALE): number {
  return Math.max(MAX_SCALE, floor);
}

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

/**
 * Constrain a pan offset so the diagram can never be moved (or pinch-flung)
 * entirely out of view: at least `margin` px of it always stays inside the
 * viewport on each axis. A fast pinch — especially at minimum zoom, where the
 * scale is already pinned — otherwise throws the fitting diagram into the void,
 * which looks identical to the white-screen bug. Returns the input unchanged
 * when sizes are degenerate.
 */
export function clampPan(
  x: number,
  y: number,
  scale: number,
  viewportW: number,
  viewportH: number,
  layoutW: number,
  layoutH: number,
  margin = 80,
): { x: number; y: number } {
  if (!(layoutW > 0) || !(layoutH > 0) || !(scale > 0)) return { x, y };
  const W = layoutW * scale;
  const H = layoutH * scale;
  const mx = Math.min(margin, W);
  const my = Math.min(margin, H);
  const xLo = mx - W;
  const xHi = viewportW - mx;
  const yLo = my - H;
  const yHi = viewportH - my;
  return {
    x: clamp(x, Math.min(xLo, xHi), Math.max(xLo, xHi)),
    y: clamp(y, Math.min(yLo, yHi), Math.max(yLo, yHi)),
  };
}
