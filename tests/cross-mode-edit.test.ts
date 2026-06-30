import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/state';
import { layoutDocument } from '@/domain/layout';
import { layoutDependency } from '@/domain/layout/modes/dependency';
import { layoutPhraseBlock } from '@/domain/layout/modes/phrase-block';
import { layoutMorphology } from '@/domain/layout/modes/morphology';
import type { KrDocument } from '@/domain/schema';

/**
 * Every visualization (Kellogg-Reed, Dependency, Phrase/Block, Morphology) is a
 * LENS over the one shared syntax graph — never a separate model. So a semantic
 * edit made in any mode must show up in all of them. These tests make that
 * guarantee explicit: edit through the store, then derive every mode's layout
 * from the SAME edited document and confirm the change is reflected.
 */
const store = useEditorStore;

function makeDoc(): KrDocument {
  return {
    schemaVersion: 1,
    id: 'd',
    title: 't',
    language: 'grc',
    text: 'λόγος ἔγραψεν',
    notes: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {},
    tokens: [
      { id: 't1', index: 0, surface: 'λόγος', pos: 'noun', morphology: { case: 'nominative' } },
      { id: 't2', index: 1, surface: 'ἔγραψεν', pos: 'verb' },
    ],
    syntax: {
      rootId: 'c',
      nodes: [
        { id: 'c', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n1', kind: 'word', role: 'subject', tokenIds: ['t1'] },
        { id: 'n2', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
      ],
      relations: [
        { id: 'r1', type: 'subject', headId: 'c', dependentId: 'n1' },
        { id: 'r2', type: 'predicate', headId: 'c', dependentId: 'n2' },
      ],
    },
  };
}

const allTexts = (layout: { elements: { kind: string }[] }) =>
  layout.elements.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);

describe('an edit propagates to every visualization (one shared graph)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    store.getState().loadDocument(makeDoc(), { corpus: 'custom' });
  });

  it('a relation-type change is visible in the Dependency lens', () => {
    // Before: r1 is the subject relation → label "subj" in Dependency.
    expect(allTexts(layoutDependency(store.getState().doc))).toContain('subj');

    store.getState().changeRelationType('r1', 'directObject');

    const dep = layoutDependency(store.getState().doc);
    // The edit flowed to the shared graph, so the Dependency label is now "obj".
    expect(allTexts(dep)).toContain('obj');
    expect(allTexts(dep)).not.toContain('subj');
  });

  it('all four modes derive from the SAME edited document', () => {
    store.getState().changeRelationType('r1', 'directObject');
    const doc = store.getState().doc;
    // The relation is changed once, in the shared model…
    expect(doc.syntax.relations.find((r) => r.id === 'r1')!.type).toBe('directObject');
    // …and every lens lays out from that same doc, all showing both words.
    for (const layout of [
      layoutDocument(doc),
      layoutDependency(doc),
      layoutPhraseBlock(doc),
      layoutMorphology(doc),
    ]) {
      const texts = allTexts(layout);
      expect(texts).toContain('λόγος');
      expect(texts).toContain('ἔγραψεν');
    }
  });

  it('a word edit (gloss/surface) carries to every lens too', () => {
    store.getState().updateToken('t1', { surface: 'φῶς' });
    const doc = store.getState().doc;
    for (const layout of [
      layoutDocument(doc),
      layoutDependency(doc),
      layoutPhraseBlock(doc),
      layoutMorphology(doc),
    ]) {
      const texts = allTexts(layout);
      expect(texts).toContain('φῶς');
      expect(texts).not.toContain('λόγος');
    }
  });
});
