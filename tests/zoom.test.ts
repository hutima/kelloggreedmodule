import { describe, it, expect } from 'vitest';
import {
  minZoomScale,
  maxZoomScale,
  clampPan,
  clamp,
  scheduleRepaint,
  MIN_SCALE,
  MAX_SCALE,
  MAX_RENDER_AREA,
  MAX_RENDER_DIM,
} from '@/ui/zoom';

describe('zoom-out lock (minZoomScale)', () => {
  it('locks zoom-out at the fit-to-screen scale for a diagram wider than the viewport', () => {
    // Viewport 800×600 (pad 24 → 752×552 usable), diagram 1504 wide / 276 tall.
    // Width is the binding dimension: 752/1504 = 0.5.
    expect(minZoomScale(800, 600, 1504, 276)).toBeCloseTo(0.5, 5);
  });

  it('locks at the taller dimension when height binds', () => {
    // 752 usable height / 1104 tall = ~0.681; width fits easily.
    expect(minZoomScale(800, 600, 200, 1104)).toBeCloseTo(552 / 1104, 5);
  });

  it('never forces a small diagram above 100%', () => {
    // Diagram far smaller than the viewport would "fit" at >1; lock caps at 1 so
    // it simply rests at 100% rather than being blown up.
    expect(minZoomScale(800, 600, 100, 80)).toBe(1);
  });

  it('floors at MIN_SCALE for a pathologically large diagram', () => {
    // 752 / 100000 ≈ 0.0075, below the absolute floor.
    expect(minZoomScale(800, 600, 100000, 100000)).toBe(MIN_SCALE);
  });

  it('returns the floor (no divide-by-zero) for degenerate sizes', () => {
    expect(minZoomScale(0, 0, 0, 0)).toBe(MIN_SCALE);
    expect(minZoomScale(800, 600, 0, 276)).toBe(MIN_SCALE);
    expect(minZoomScale(NaN, 600, 1504, 276)).toBe(MIN_SCALE);
  });

  it('a zoom-out step can never drop the scale below the lock', () => {
    // Mirror the canvas clamp: scale * factor, bounded by [minScale, MAX_SCALE].
    const lo = minZoomScale(800, 600, 1504, 276); // 0.5
    let scale = lo;
    // Repeatedly pinch out — it must stay pinned at the lock, never go white-small.
    for (let i = 0; i < 20; i++) scale = clamp(scale * (1 / 1.2), lo, MAX_SCALE);
    expect(scale).toBe(lo);
    expect(scale).toBeGreaterThanOrEqual(lo);
  });
});

describe('zoom-in lock (maxZoomScale)', () => {
  it('lets a small diagram zoom all the way to MAX_SCALE', () => {
    // 900×500 at dpr 1: the render budget is nowhere near binding, so the only
    // ceiling is the fixed MAX_SCALE.
    expect(maxZoomScale(900, 500, 1)).toBe(MAX_SCALE);
  });

  it('caps a tall passage so its rasterised height stays within the budget', () => {
    // 1000×6000 at dpr 3. The per-side device limit binds first:
    // MAX_RENDER_DIM / (6000 * 3).
    const cap = maxZoomScale(1000, 6000, 3);
    expect(cap).toBeCloseTo(MAX_RENDER_DIM / (6000 * 3), 5);
    // And at that cap the rendered height is exactly the device-pixel limit.
    expect(6000 * cap * 3).toBeCloseTo(MAX_RENDER_DIM, 3);
    expect(cap).toBeLessThan(MAX_SCALE);
  });

  it('honours the total-area budget when neither side is individually huge', () => {
    // A big square diagram: area binds before either single side does.
    const cap = maxZoomScale(3000, 3000, 2);
    expect(cap).toBeCloseTo(Math.sqrt(MAX_RENDER_AREA / (3000 * 3000 * 4)), 5);
    // Rendered device-pixel area lands on the budget (within rounding).
    expect(3000 * cap * 2 * (3000 * cap * 2)).toBeCloseTo(MAX_RENDER_AREA, -1);
  });

  it('never returns below the zoom-out floor, so the range cannot invert', () => {
    // Pathologically large diagram whose budget cap would fall under the floor.
    const floor = 0.3;
    expect(maxZoomScale(100000, 100000, 3, floor)).toBe(floor);
  });

  it('falls back to MAX_SCALE for degenerate sizes (no divide-by-zero)', () => {
    expect(maxZoomScale(0, 600, 3)).toBe(MAX_SCALE);
    expect(maxZoomScale(800, 0, 3)).toBe(MAX_SCALE);
    expect(maxZoomScale(800, 600, 0)).toBe(MAX_SCALE);
  });

  it('shrinks the cap as device pixel ratio rises (Retina renders larger)', () => {
    const at1 = maxZoomScale(1500, 3000, 1);
    const at3 = maxZoomScale(1500, 3000, 3);
    expect(at3).toBeLessThan(at1);
  });
});

describe('pan lock (clampPan)', () => {
  const VP_W = 800;
  const VP_H = 600;
  const LW = 1504;
  const LH = 276;

  it('keeps a margin of the diagram on screen no matter how far it is flung', () => {
    const scale = 0.5; // rendered 752 × 138
    const margin = 80;
    // Fling far to the right and down — it must stop with a margin still visible.
    const r = clampPan(99999, 99999, scale, VP_W, VP_H, LW, LH, margin);
    expect(r.x).toBe(VP_W - margin); // left edge can't pass viewport-right-minus-margin
    expect(r.y).toBe(VP_H - margin);
    // Fling far up/left — the trailing edge must still poke in by a margin.
    const r2 = clampPan(-99999, -99999, scale, VP_W, VP_H, LW, LH, margin);
    expect(r2.x).toBe(margin - LW * scale); // right edge pinned a margin inside the left
    expect(r2.y).toBe(margin - LH * scale);
  });

  it('leaves an in-bounds pan untouched', () => {
    const r = clampPan(40, 24, 0.5, VP_W, VP_H, LW, LH);
    expect(r).toEqual({ x: 40, y: 24 });
  });

  it('never produces a NaN/∞ offset at the minimum zoom (the white-flash case)', () => {
    const lo = minZoomScale(VP_W, VP_H, LW, LH);
    const r = clampPan(50000, -50000, lo, VP_W, VP_H, LW, LH);
    expect(Number.isFinite(r.x)).toBe(true);
    expect(Number.isFinite(r.y)).toBe(true);
  });

  it('passes through unchanged for degenerate sizes', () => {
    expect(clampPan(10, 20, 1, 800, 600, 0, 0)).toEqual({ x: 10, y: 20 });
    expect(clampPan(10, 20, 0, 800, 600, 100, 100)).toEqual({ x: 10, y: 20 });
  });
});

describe('gesture-end repaint (scheduleRepaint)', () => {
  it('hides the layer now and restores it only on the next frame', () => {
    // The whole point of the fix: a synchronous display none→'' is a no-op on
    // WebKit, so the restore MUST be deferred to a later frame. Capture the
    // scheduled callback instead of running it immediately.
    const el = { style: { display: 'block' } };
    let frame: (() => void) | null = null;
    scheduleRepaint(el, (cb) => {
      frame = cb;
    });
    // Synchronously the layer is hidden — the eviction is in flight, not undone.
    expect(el.style.display).toBe('none');
    // Running the deferred frame restores it.
    frame!();
    expect(el.style.display).toBe('');
  });

  it('is a no-op (no throw) when there is no element yet', () => {
    let scheduled = false;
    expect(() =>
      scheduleRepaint(null, () => {
        scheduled = true;
      }),
    ).not.toThrow();
    // Nothing to repaint, so nothing is scheduled.
    expect(scheduled).toBe(false);
  });
});
