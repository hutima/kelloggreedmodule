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

  it('places per-join coordinators BETWEEN member arms, not on their baselines', () => {
    // A three-member coordinated object "A nor B but C" (two coordinators on the
    // head, one per join) must NOT be treated as a correlative pair: each
    // conjunction rides the gap between two arms, clear of every arm's word.
    const w = (id: string, surface: string, role?: string) => ({
      id: `n_${id}`,
      kind: 'word' as const,
      tokenIds: [`t_${id}`],
      ...(role ? { role: role as never } : {}),
    });
    const tok = (id: string, index: number, surface: string, pos: string) => ({
      id: `t_${id}`,
      index,
      surface,
      pos: pos as never,
      language: 'en' as const,
    });
    const doc: KrDocument = {
      schemaVersion: 1,
      id: 'doc_test_perjoin',
      title: 'per-join',
      language: 'en',
      text: 'I want this nor that but other',
      notes: '',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      layoutHints: {},
      tokens: [
        tok('i', 0, 'I', 'pronoun'),
        tok('want', 1, 'want', 'verb'),
        tok('a', 2, 'this', 'noun'),
        tok('nor', 3, 'nor', 'conjunction'),
        tok('b', 4, 'that', 'noun'),
        tok('but', 5, 'but', 'conjunction'),
        tok('c', 6, 'other', 'noun'),
      ],
      syntax: {
        rootId: 'c0',
        nodes: [
          { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
          w('i', 'I', 'subject'),
          w('want', 'want', 'predicate'),
          w('a', 'this', 'directObject'),
          w('nor', 'nor', 'coordinator'),
          w('b', 'that', 'conjunct'),
          w('but', 'but', 'coordinator'),
          w('c', 'other', 'conjunct'),
        ],
        relations: [
          { id: 'r1', type: 'subject', headId: 'c0', dependentId: 'n_i' },
          { id: 'r2', type: 'predicate', headId: 'c0', dependentId: 'n_want' },
          { id: 'r3', type: 'directObject', headId: 'n_want', dependentId: 'n_a' },
          { id: 'r4', type: 'coordinator', headId: 'n_a', dependentId: 'n_nor' },
          { id: 'r5', type: 'conjunct', headId: 'n_a', dependentId: 'n_b' },
          { id: 'r6', type: 'coordinator', headId: 'n_a', dependentId: 'n_but' },
          { id: 'r7', type: 'conjunct', headId: 'n_a', dependentId: 'n_c' },
        ],
      },
    };
    const layout = layoutDocument(doc);
    const textY = (t: string) => {
      const el = layout.elements.find(
        (e) => e.kind === 'text' && (e as { text: string }).text === t,
      ) as { y: number; rotate?: number } | undefined;
      expect(el, `expected to find "${t}"`).toBeDefined();
      return el!.y;
    };
    const aY = textY('this');
    const bY = textY('that');
    const cY = textY('other');
    const norY = textY('nor');
    const butY = textY('but');
    // arms stack top→bottom
    expect(aY).toBeLessThan(bY);
    expect(bY).toBeLessThan(cY);
    // each coordinator sits strictly BETWEEN the two arms it joins (per-join),
    // never on an arm baseline (the old correlative mis-placement).
    expect(norY).toBeGreaterThan(aY);
    expect(norY).toBeLessThan(bY);
    expect(butY).toBeGreaterThan(bY);
    expect(butY).toBeLessThan(cY);
  });
});
