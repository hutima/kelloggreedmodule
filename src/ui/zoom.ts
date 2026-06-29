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
 * Safe rasterisation budget for a single composited layer, in **device** pixels.
 * iOS Safari blanks the *whole page* (it evicts every compositing tile under
 * memory pressure, leaving only the body background) when an SVG is rasterised
 * past roughly this much — which is the pinch-zoom-IN white-screen. The on-screen
 * raster is `layout × scale × devicePixelRatio`, so on a Retina phone (dpr 3) a
 * tall passage crosses the budget after only a little zoom-in. These are
 * deliberately conservative so an older device survives; bump them if zoom-in
 * feels too short on tested hardware.
 */
export const MAX_RENDER_AREA = 24_000_000; // device px², total backing-store area
export const MAX_RENDER_DIM = 8192; // device px, hard limit on either single side

/**
 * Upper bound for the view scale on *this* diagram: never zoom in so far that the
 * rendered SVG (`layout size × scale × dpr`) exceeds the {@link MAX_RENDER_AREA}
 * backing-store budget or the {@link MAX_RENDER_DIM} per-side limit — the sizes
 * at which iOS Safari flashes the whole page white. Small diagrams are reined in
 * only by the fixed {@link MAX_SCALE}; large/tall ones get a lower cap. Never
 * returns below `floor`, so the zoom range can't invert against the zoom-out lock.
 */
export function maxZoomScale(
  layoutW: number,
  layoutH: number,
  dpr = 1,
  floor = MIN_SCALE,
  area = MAX_RENDER_AREA,
  dim = MAX_RENDER_DIM,
): number {
  if (!(layoutW > 0) || !(layoutH > 0) || !(dpr > 0)) return MAX_SCALE;
  const byArea = Math.sqrt(area / (layoutW * layoutH * dpr * dpr));
  const byW = dim / (layoutW * dpr);
  const byH = dim / (layoutH * dpr);
  const cap = Math.min(byArea, byW, byH, MAX_SCALE);
  return Math.max(cap, floor);
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
