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

  it('draws every word AFTER all lines so its halo masks any crossing line', () => {
    // Words carry a paper-coloured halo (paint-order: stroke) that only masks
    // lines drawn BEFORE them. The serializer reorders so all <text> follow all
    // <line>/<path>, keeping a word legible even where a line crosses it.
    const doc = cloneSample('doc_sample_phil_1_1_2_grc')!;
    const svg = layoutToSvg(layoutDocument(doc, doc.layoutHints));
    const firstText = svg.indexOf('<text');
    const lastLine = svg.lastIndexOf('<line');
    const lastPath = svg.lastIndexOf('<path');
    expect(firstText).toBeGreaterThan(-1);
    expect(firstText).toBeGreaterThan(Math.max(lastLine, lastPath));
  });

  it('marks low-confidence relations as tentative for ambiguity colouring', () => {
    const doc = cloneSample('doc_sample_fox')!;
    const rel = doc.syntax.relations[0]!;
    rel.provenance = { source: 'inferred', confidence: 'low' };
    const layout = layoutDocument(doc, doc.layoutHints);
    const tentative = layout.elements.filter(
      (e) => (e as { tentative?: boolean }).tentative,
    );
    expect(tentative.length).toBeGreaterThan(0);
    expect(tentative.every((e) => e.relationId === rel.id)).toBe(true);
  });
});
