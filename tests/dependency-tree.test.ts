import { describe, it, expect } from 'vitest';
import { layoutForMode, DIAGRAM_MODES } from '@/domain/layout';
import { cloneSample } from '@/fixtures';

/**
 * Dependency Tree mode — a top-down head→dependent tree over the same syntax
 * graph as the arc Dependency view. These pin the shape: a [ROOT] marker, the
 * main verb beneath it, and labelled edges down to dependents.
 */
const texts = (l: ReturnType<typeof layoutForMode>) =>
  l.elements.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);

describe('dependency tree mode', () => {
  it('is listed as a selectable visualization', () => {
    expect(DIAGRAM_MODES.some((m) => m.id === 'dependency-tree')).toBe(true);
  });

  it('draws a [ROOT] marker and a top-down tree for a clause', () => {
    const doc = cloneSample('doc_sample_fox')!;
    const layout = layoutForMode('dependency-tree', doc, doc.layoutHints);
    const t = texts(layout);
    expect(t).toContain('[ROOT]');
    expect(t).toContain('jumps'); // the main verb
    expect(t).toContain('fox'); // a dependent word
    // The relation label rides the edge (subject → subj).
    expect(t).toContain('subj');
    // Connector edges + word labels ⇒ a non-trivial drawing.
    expect(layout.elements.filter((e) => e.kind === 'line').length).toBeGreaterThan(3);
  });

  it('collapses a clause into its verb (relative clauses hang off the main verb)', () => {
    const doc = cloneSample('doc_sample_1john_1_1')!;
    const layout = layoutForMode('dependency-tree', doc, doc.layoutHints);
    const t = texts(layout);
    expect(t).toContain('[ROOT]');
    // The copula ἦν is the sentence root; the relative-clause verbs attach to it
    // rather than appearing as bare clause nodes.
    expect(t.join(' ')).toContain('ἦν');
    expect(layout.width).toBeGreaterThan(100);
    expect(layout.height).toBeGreaterThan(100);
  });

  it('every visualization (incl. dependency-tree) lays a sample out without throwing', () => {
    const doc = cloneSample('doc_sample_fox')!;
    for (const m of DIAGRAM_MODES) {
      expect(() => layoutForMode(m.id, doc, doc.layoutHints), m.id).not.toThrow();
    }
  });
});
