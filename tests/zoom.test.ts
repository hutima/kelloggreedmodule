import { describe, it, expect } from 'vitest';
import { minZoomScale, clamp, MIN_SCALE, MAX_SCALE } from '@/ui/zoom';

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
