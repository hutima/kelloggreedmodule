import { describe, it, expect } from 'vitest';
import { layoutDocument, measureText } from '@/domain/layout';
import { cloneSample } from '@/fixtures';
import type { KrDocument } from '@/domain/schema';

const fox = () => cloneSample('doc_sample_fox')!;
const john = () => cloneSample('doc_sample_john_1_1a')!;

describe('layout engine', () => {
  it('measures combining Greek diacritics as zero-width', () => {
    const plain = measureText('ηωραμεν');
    const accented = measureText('ἑωράκαμεν'.normalize('NFD'));
    // similar glyph counts → similar widths despite many combining marks
    expect(Math.abs(plain - accented)).toBeLessThan(plain);
  });

  it('produces a divider and a baseline for a clause', () => {
    const layout = layoutDocument(fox());
    const roles = layout.elements
      .filter((e) => e.kind === 'line')
      .map((e) => (e as { role: string }).role);
    expect(roles).toContain('divider');
    expect(roles).toContain('baseline');
  });

  it('renders every non-implied node label somewhere', () => {
    const doc = fox();
    const layout = layoutDocument(doc);
    const texts = layout.elements.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);
    expect(texts.join(' ')).toContain('fox');
    expect(texts.join(' ')).toContain('jumps');
    expect(texts.join(' ')).toContain('dog.');
  });

  it('does NOT use surface order: a fronted Greek PP lays out below the baseline', () => {
    const doc = john();
    const layout = layoutDocument(doc, doc.layoutHints);
    const subject = layout.elements.find(
      (e) => e.kind === 'text' && (e as { text: string }).text.includes('λόγος'),
    ) as { y: number } | undefined;
    const prep = layout.elements.find(
      (e) => e.kind === 'text' && (e as { text: string }).text === 'Ἐν',
    ) as { y: number } | undefined;
    expect(subject).toBeDefined();
    expect(prep).toBeDefined();
    // Even though "Ἐν" is first in the sentence, it is drawn lower than the
    // subject on the baseline — structure, not word order, drives layout.
    expect(prep!.y).toBeGreaterThan(subject!.y);
  });

  it('honours a collapse layout hint by dropping descendants', () => {
    const doc = fox();
    const full = layoutDocument(doc);
    const collapsed: KrDocument = {
      ...doc,
      layoutHints: { n_fox: { collapsed: true } },
    };
    const after = layoutDocument(collapsed, collapsed.layoutHints);
    expect(after.elements.length).toBeLessThan(full.elements.length);
  });

  it('lays out deeply nested relative clauses (1 John 1:1)', () => {
    const doc = cloneSample('doc_sample_1john_1_1')!;
    const layout = layoutDocument(doc, doc.layoutHints);
    expect(layout.elements.length).toBeGreaterThan(20);
    expect(layout.height).toBeGreaterThan(120);
  });
});
