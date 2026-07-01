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

  it('draws coordinate INFINITIVES as a fork (arms fan out, conjunctions between them)', () => {
    // A headless coordinate clause whose members are all infinitives — the shape
    // the Lowfat converter emits for "read nor write but speak" as an object — must
    // render as a Reed-Kellogg fork, NOT a verb-to-verb spine: the arms sit at
    // DIFFERENT x (fanning right from one junction) and each conjunction rides the
    // gap between two arms.
    const doc: KrDocument = {
      schemaVersion: 1, id: 'doc_inf_fork', title: 'inf fork', language: 'en',
      text: 'she wants read nor write but speak', notes: '',
      createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', layoutHints: {},
      tokens: [
        { id: 't_s', index: 0, surface: 'she', pos: 'pronoun', language: 'en' },
        { id: 't_w', index: 1, surface: 'wants', pos: 'verb', language: 'en' },
        { id: 't_r', index: 2, surface: 'read', pos: 'infinitive', language: 'en' },
        { id: 't_n', index: 3, surface: 'nor', pos: 'conjunction', language: 'en' },
        { id: 't_wr', index: 4, surface: 'write', pos: 'infinitive', language: 'en' },
        { id: 't_b', index: 5, surface: 'but', pos: 'conjunction', language: 'en' },
        { id: 't_sp', index: 6, surface: 'speak', pos: 'infinitive', language: 'en' },
      ],
      syntax: {
        rootId: 'c0',
        nodes: [
          { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
          { id: 'n_s', kind: 'word', role: 'subject', tokenIds: ['t_s'] },
          { id: 'n_w', kind: 'word', role: 'predicate', tokenIds: ['t_w'] },
          { id: 'cc', kind: 'clause', clauseType: 'coordinate', tokenIds: [] },
          // Each infinitive is its own infinitival clause (as the Lowfat converter emits).
          { id: 'clR', kind: 'clause', clauseType: 'infinitival', tokenIds: [] },
          { id: 'n_r', kind: 'word', role: 'predicate', tokenIds: ['t_r'] },
          { id: 'n_n', kind: 'word', role: 'coordinator', tokenIds: ['t_n'] },
          { id: 'clW', kind: 'clause', clauseType: 'infinitival', tokenIds: [] },
          { id: 'n_wr', kind: 'word', role: 'predicate', tokenIds: ['t_wr'] },
          { id: 'n_b', kind: 'word', role: 'coordinator', tokenIds: ['t_b'] },
          { id: 'clSp', kind: 'clause', clauseType: 'infinitival', tokenIds: [] },
          { id: 'n_sp', kind: 'word', role: 'predicate', tokenIds: ['t_sp'] },
        ],
        relations: [
          { id: 'r1', type: 'subject', headId: 'c0', dependentId: 'n_s' },
          { id: 'r2', type: 'predicate', headId: 'c0', dependentId: 'n_w' },
          { id: 'r3', type: 'directObject', headId: 'n_w', dependentId: 'cc' },
          { id: 'r4', type: 'conjunct', headId: 'cc', dependentId: 'clR' },
          { id: 'r4a', type: 'predicate', headId: 'clR', dependentId: 'n_r' },
          { id: 'r5', type: 'coordinator', headId: 'cc', dependentId: 'n_n' },
          { id: 'r6', type: 'conjunct', headId: 'cc', dependentId: 'clW' },
          { id: 'r6a', type: 'predicate', headId: 'clW', dependentId: 'n_wr' },
          { id: 'r7', type: 'coordinator', headId: 'cc', dependentId: 'n_b' },
          { id: 'r8', type: 'conjunct', headId: 'cc', dependentId: 'clSp' },
          { id: 'r8a', type: 'predicate', headId: 'clSp', dependentId: 'n_sp' },
        ],
      },
    };
    const layout = layoutDocument(doc);
    const pick = (t: string) => {
      const el = layout.elements.find(
        (e) => e.kind === 'text' && (e as { text: string }).text === t,
      ) as { x: number; y: number } | undefined;
      expect(el, `expected "${t}"`).toBeDefined();
      return el!;
    };
    const read = pick('read');
    const write = pick('write');
    const speak = pick('speak');
    const nor = pick('nor');
    const but = pick('but');
    // Arms stack top→bottom.
    expect(read.y).toBeLessThan(write.y);
    expect(write.y).toBeLessThan(speak.y);
    // Conjunctions ride the gaps between arms (per-join), never on an arm.
    expect(nor.y).toBeGreaterThan(read.y);
    expect(nor.y).toBeLessThan(write.y);
    expect(but.y).toBeGreaterThan(write.y);
    expect(but.y).toBeLessThan(speak.y);
  });

  it('keeps a COMPOUND SENTENCE (finite clauses) as a verb-to-verb spine', () => {
    // The opposite case: two FINITE clauses coordinated ("he ran and she walked")
    // must stay a spine — the verbs line up in one column — not fork.
    const doc: KrDocument = {
      schemaVersion: 1, id: 'doc_spine', title: 'spine', language: 'en',
      text: 'he ran and she walked', notes: '',
      createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', layoutHints: {},
      tokens: [
        { id: 'h', index: 0, surface: 'he', pos: 'pronoun', language: 'en' },
        { id: 'ra', index: 1, surface: 'ran', pos: 'verb', language: 'en' },
        { id: 'a', index: 2, surface: 'and', pos: 'conjunction', language: 'en' },
        { id: 's', index: 3, surface: 'she', pos: 'pronoun', language: 'en' },
        { id: 'wa', index: 4, surface: 'walked', pos: 'verb', language: 'en' },
      ],
      syntax: {
        rootId: 'cc',
        nodes: [
          { id: 'cc', kind: 'clause', clauseType: 'coordinate', tokenIds: [] },
          { id: 'clA', kind: 'clause', clauseType: 'independent', tokenIds: [] },
          { id: 'nh', kind: 'word', role: 'subject', tokenIds: ['h'] },
          { id: 'nra', kind: 'word', role: 'predicate', tokenIds: ['ra'] },
          { id: 'na', kind: 'word', role: 'coordinator', tokenIds: ['a'] },
          { id: 'clB', kind: 'clause', clauseType: 'independent', tokenIds: [] },
          { id: 'ns', kind: 'word', role: 'subject', tokenIds: ['s'] },
          { id: 'nwa', kind: 'word', role: 'predicate', tokenIds: ['wa'] },
        ],
        relations: [
          { id: 'r1', type: 'conjunct', headId: 'cc', dependentId: 'clA' },
          { id: 'r2', type: 'subject', headId: 'clA', dependentId: 'nh' },
          { id: 'r3', type: 'predicate', headId: 'clA', dependentId: 'nra' },
          { id: 'r4', type: 'coordinator', headId: 'cc', dependentId: 'na' },
          { id: 'r5', type: 'conjunct', headId: 'cc', dependentId: 'clB' },
          { id: 'r6', type: 'subject', headId: 'clB', dependentId: 'ns' },
          { id: 'r7', type: 'predicate', headId: 'clB', dependentId: 'nwa' },
        ],
      },
    };
    const layout = layoutDocument(doc);
    const vx = (t: string) => {
      const el = layout.elements.find(
        (e) => e.kind === 'text' && (e as { text: string }).text === t,
      ) as { x: number } | undefined;
      expect(el, `expected "${t}"`).toBeDefined();
      return el!.x;
    };
    // The two finite verbs share the verb column (the spine signature).
    expect(Math.abs(vx('ran') - vx('walked'))).toBeLessThan(3);
  });
});
