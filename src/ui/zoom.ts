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

/** The minimal shape {@link scheduleRepaint} touches — just a writable
 *  `style.display`. Lets the helper be unit-tested without a real DOM node. */
export interface RepaintTarget {
  style: { display: string };
}

/**
 * Force a composited layer to re-rasterise after a touch gesture has resized it.
 *
 * On iOS Safari, changing an SVG's intrinsic width/height — which a pinch does
 * in *either* direction, zoom-in **or** zoom-out — can leave its backing tile
 * blank, so the diagram flashes white on touch release. The cure is to evict the
 * stale tile by hiding the layer and restoring it, but the toggle MUST cross a
 * frame boundary: a synchronous `display = 'none'` → `display = ''` in one task
 * is coalesced by WebKit into a net no-op (reading a layout property forces a
 * reflow but never a repaint), so the blank tile survives and the nudge does
 * nothing. Hiding now and restoring on the next animation frame makes the
 * compositor actually drop and rebuild the layer.
 *
 * Pure and injectable: pass the element and a `requestAnimationFrame`-like
 * scheduler so the cross-frame behaviour can be verified in tests.
 */
export function scheduleRepaint(
  el: RepaintTarget | null,
  raf: (cb: () => void) => void,
): void {
  if (!el) return;
  el.style.display = 'none';
  raf(() => {
    el.style.display = '';
  });
}
