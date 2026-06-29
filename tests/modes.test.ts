import { describe, it, expect } from 'vitest';
import { lowfatToDocuments } from '@/io/lowfat';
import { layoutForMode, DIAGRAM_MODES, DEFAULT_MODE } from '@/domain/layout';

/**
 * Alternate diagram modes share the layout→primitive→canvas pipeline. These pin
 * the registry and the first data-driven mode (Dependency); per-mode visual
 * details are verified by rendering.
 */
const XML = `<book name="Test"><sentence><wg role="cl" class="cl" rule="S-V-O">
  <w class="noun" role="s" n="010010010010010">θεός</w>
  <w class="verb" role="v" n="010010010020010">ἠγάπησεν</w>
  <wg role="o" class="np" rule="DetNp">
    <w class="det" n="010010010030010">τὸν</w>
    <w class="noun" head="true" n="010010010040010">κόσμον</w>
  </wg>
</wg></sentence></book>`;

const doc = () => lowfatToDocuments(XML, { book: 'Test' })[0]!;

describe('diagram mode registry', () => {
  it('lists five modes with Kellogg-Reed default first', () => {
    expect(DEFAULT_MODE).toBe('kellogg-reed');
    expect(DIAGRAM_MODES.map((m) => m.id)).toEqual([
      'kellogg-reed',
      'phrase-block',
      'discourse-flow',
      'dependency',
      'morphology',
    ]);
    expect(DIAGRAM_MODES.every((m) => m.label && m.description)).toBe(true);
  });

  it('every mode produces a non-empty layout (no crash on a real parse)', () => {
    for (const m of DIAGRAM_MODES) {
      const layout = layoutForMode(m.id, doc(), {}, {});
      expect(layout.width).toBeGreaterThan(0);
      expect(layout.elements.length).toBeGreaterThan(0);
    }
  });
});

describe('dependency mode', () => {
  it('keeps Greek tokens in surface order on the baseline', () => {
    const layout = layoutForMode('dependency', doc(), {}, {});
    // The main (non-small) text run is the Greek tokens, left to right.
    const greek = layout.elements
      .filter((e) => e.kind === 'text' && !e.small)
      .map((e) => e as { x: number; text: string })
      .sort((a, b) => a.x - b.x)
      .map((e) => e.text);
    expect(greek).toEqual(['θεός', 'ἠγάπησεν', 'τὸν', 'κόσμον']);
  });

  it('draws head→dependent arcs (curves) with relation labels', () => {
    const layout = layoutForMode('dependency', doc(), {}, {});
    const curves = layout.elements.filter((e) => e.kind === 'curve');
    expect(curves.length).toBeGreaterThanOrEqual(3); // subject, object, determiner…
    expect(curves.every((c) => c.kind === 'curve' && c.arrow)).toBe(true);
    const labels = layout.elements.filter((e) => e.kind === 'text' && e.small && e.italic).map((e) => (e as { text: string }).text);
    expect(labels).toContain('subj');
    expect(labels).toContain('obj');
  });
});
