import { describe, it, expect } from 'vitest';
import { buildSvg, clampPngScale, MAX_CANVAS_PIXELS } from '@/io';
import { cloneSample } from '@/fixtures';

describe('PNG raster scale clamping', () => {
  it('leaves a scale alone when the canvas fits the budget', () => {
    expect(clampPngScale(800, 600, 2)).toBe(2);
  });

  it('clamps the scale so width×height stays within the pixel budget', () => {
    // 4000×4000 at 2× would be 64M px; the clamp brings it to exactly 16M.
    const s = clampPngScale(4000, 4000, 2, 16_000_000);
    expect(s).toBeCloseTo(1);
    expect(4000 * s * (4000 * s)).toBeLessThanOrEqual(16_000_000 + 1);
  });

  it('preserves aspect ratio (one scalar applied to both dimensions)', () => {
    const w = 10000;
    const h = 4000;
    const s = clampPngScale(w, h, 3);
    expect(w * s * (h * s)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
    expect((w * s) / (h * s)).toBeCloseTo(w / h);
  });

  it('never increases the requested scale', () => {
    expect(clampPngScale(100, 100, 0.5)).toBe(0.5);
  });

  it('tolerates degenerate zero-sized input', () => {
    expect(Number.isFinite(clampPngScale(0, 0, 2))).toBe(true);
  });
});

describe('highlights in exports', () => {
  it('threads word highlights through buildSvg', () => {
    const doc = cloneSample('doc_sample_fox')!;
    const nodeId = doc.syntax.nodes.find((n) => n.kind === 'word')!.id;
    const plain = buildSvg(doc);
    const highlighted = buildSvg(doc, {}, 'kellogg-reed', {
      nodeFills: new Map([[nodeId, '#fde047']]),
    });
    expect(highlighted).not.toBe(plain);
    expect(highlighted).toContain('fill="#fde047"');
    expect(plain).not.toContain('fill="#fde047"');
  });
});
