import { describe, it, expect } from 'vitest';
import { layoutDocument } from '@/domain/layout';
import { layoutToSvg } from '@/domain/render';
import { cloneSample } from '@/fixtures';

describe('SVG renderer', () => {
  it('emits a well-formed standalone SVG', () => {
    const doc = cloneSample('doc_sample_fox')!;
    const svg = layoutToSvg(layoutDocument(doc), { standalone: true, background: true });
    expect(svg).toMatch(/^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<line');
    expect(svg).toContain('<text');
    expect(svg).toContain('font-family');
  });

  it('escapes XML-significant characters in labels', () => {
    const doc = cloneSample('doc_sample_fox')!;
    doc.tokens[3]!.surface = 'fox & <hound>';
    const svg = layoutToSvg(layoutDocument(doc));
    expect(svg).toContain('fox &amp; &lt;hound&gt;');
    expect(svg).not.toContain('<hound>');
  });

  it('preserves polytonic Greek text in output', () => {
    const doc = cloneSample('doc_sample_john_1_1a')!;
    const svg = layoutToSvg(layoutDocument(doc));
    expect(svg).toContain('λόγος');
  });
});
