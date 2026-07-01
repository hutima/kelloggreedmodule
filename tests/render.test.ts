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

  it('paints a word-highlight swash behind the text, under all lines', () => {
    const doc = cloneSample('doc_sample_fox')!;
    const layout = layoutDocument(doc);
    const word = layout.elements.find((e) => e.kind === 'text' && e.nodeId && !e.box);
    expect(word).toBeDefined();
    const svg = layoutToSvg(layout, {
      highlights: { nodeFills: new Map([[word!.nodeId!, '#fde047']]) },
    });
    // The swash rect exists and is emitted BEFORE every line/path/text so it
    // sits behind the whole diagram, exactly like the canvas.
    const rect = svg.indexOf('fill="#fde047"');
    expect(rect).toBeGreaterThan(-1);
    expect(rect).toBeLessThan(svg.indexOf('<line'));
    expect(rect).toBeLessThan(svg.indexOf('<text'));
  });

  it('paints a soft swash along a highlighted relation connector', () => {
    const doc = cloneSample('doc_sample_fox')!;
    const layout = layoutDocument(doc);
    const stroke = layout.elements.find((e) => e.kind !== 'text' && e.relationId);
    expect(stroke).toBeDefined();
    const svg = layoutToSvg(layout, {
      highlights: { relationFills: new Map([[stroke!.relationId!, '#a7f3d0']]) },
    });
    expect(svg).toContain('stroke="#a7f3d0" stroke-width="7" stroke-linecap="round" opacity="0.55"');
  });

  it('emits no swashes when no highlights are passed', () => {
    const doc = cloneSample('doc_sample_fox')!;
    const svg = layoutToSvg(layoutDocument(doc), { highlights: {} });
    expect(svg).not.toContain('opacity="0.55"');
    expect(svg).toBe(layoutToSvg(layoutDocument(doc)));
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
