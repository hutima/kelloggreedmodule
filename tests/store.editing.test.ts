import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/state';
import { loadPatch, loadSermonPrep } from '@/persistence';
import { createDocument } from '@/domain/model';
import type { KrDocument } from '@/domain/schema';

const store = useEditorStore;

function makeBase(): KrDocument {
  const doc = createDocument({ language: 'grc', title: 'John 1:1' });
  const rootId = doc.syntax.rootId;
  return {
    ...doc,
    tokens: [
      { id: 't1', index: 0, surface: 'λόγος' },
      { id: 't2', index: 1, surface: 'ἦν' },
    ],
    syntax: {
      rootId,
      nodes: [
        { id: rootId, kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n1', kind: 'word', role: 'subject', tokenIds: ['t1'] },
        { id: 'n2', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
      ],
      relations: [
        { id: 'r1', type: 'subject', headId: rootId, dependentId: 'n1' },
        { id: 'r2', type: 'predicate', headId: rootId, dependentId: 'n2' },
      ],
    },
  };
}

describe('store — semantic editing + app mode + patch persistence', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    store.getState().loadDocument(makeBase(), { corpus: 'gnt' });
  });

  it('switches app mode', () => {
    store.getState().setAppMode('edit');
    expect(store.getState().appMode).toBe('edit');
  });

  it('setNodeRole updates the node role and its incoming relation, marked manual', () => {
    store.getState().setNodeRole('n1', 'directObject');
    const { doc } = store.getState();
    expect(doc.syntax.nodes.find((n) => n.id === 'n1')!.role).toBe('directObject');
    const rel = doc.syntax.relations.find((r) => r.dependentId === 'n1')!;
    expect(rel.type).toBe('directObject');
    expect(rel.provenance?.source).toBe('manual');
  });

  it('attachNodeTo re-points the dependent to a new head (single parent)', () => {
    store.getState().attachNodeTo('n1', 'n2', 'genitive');
    const { doc } = store.getState();
    const parents = doc.syntax.relations.filter((r) => r.dependentId === 'n1');
    expect(parents).toHaveLength(1);
    expect(parents[0]!.headId).toBe('n2');
    expect(parents[0]!.type).toBe('genitive');
  });

  it('changeRelationType and reverseRelation edit a relation', () => {
    store.getState().changeRelationType('r1', 'adverbial');
    expect(store.getState().doc.syntax.relations.find((r) => r.id === 'r1')!.type).toBe('adverbial');
    store.getState().reverseRelation('r1');
    const rel = store.getState().doc.syntax.relations.find((r) => r.id === 'r1')!;
    expect(rel.dependentId).toBe(store.getState().doc.syntax.rootId);
    expect(rel.headId).toBe('n1');
  });

  it('setImplied toggles the implied flag', () => {
    store.getState().setImplied('n1', true);
    expect(store.getState().doc.syntax.nodes.find((n) => n.id === 'n1')!.implied).toBe(true);
  });

  it('an edit is persisted as a compact patch against the base', () => {
    const id = store.getState().baseDoc!.id;
    store.getState().changeRelationType('r1', 'adverbial');
    const patch = loadPatch(id);
    expect(patch).not.toBeNull();
    expect(patch!.syntaxPatch.relations.upsert.some((r) => r.id === 'r1')).toBe(true);
  });

  it('a reload reconstructs the edit from base + patch', () => {
    store.getState().changeRelationType('r1', 'adverbial');
    store.getState().reloadCurrent();
    expect(store.getState().doc.syntax.relations.find((r) => r.id === 'r1')!.type).toBe('adverbial');
  });

  it('resetPassage(syntax) restores the base and clears the patch', () => {
    const id = store.getState().baseDoc!.id;
    store.getState().changeRelationType('r1', 'adverbial');
    expect(loadPatch(id)).not.toBeNull();
    store.getState().resetPassage({ syntax: true, layout: true });
    expect(store.getState().doc.syntax.relations.find((r) => r.id === 'r1')!.type).toBe('subject');
    expect(loadPatch(id)).toBeNull();
  });

  it('sermon notes update state and persist per passage', () => {
    const id = store.getState().doc.id;
    store.getState().addSermonNote({ anchor: { type: 'node', nodeId: 'n1' }, category: 'theology', body: 'logos' });
    expect(store.getState().sermon.notes).toHaveLength(1);
    expect(loadSermonPrep(id)!.notes).toHaveLength(1);
  });

  it('toggleHighlight persists and resetPassage(sermon) clears it', () => {
    const id = store.getState().doc.id;
    store.getState().toggleHighlight({ anchor: { type: 'node', nodeId: 'n1' }, category: 'mainIdea' });
    expect(store.getState().sermon.highlights).toHaveLength(1);
    store.getState().resetPassage({ sermon: true });
    expect(store.getState().sermon.highlights).toHaveLength(0);
    expect(loadSermonPrep(id)).toBeNull();
  });

  it('cleanLayout clears all layout hints; no-op when there are none', () => {
    store.getState().setLayoutHint('n1', { offsetX: 40, offsetY: 12 });
    store.getState().setLayoutHint('n2', { collapsed: true });
    expect(Object.keys(store.getState().doc.layoutHints)).toHaveLength(2);

    store.getState().cleanLayout();
    expect(store.getState().doc.layoutHints).toEqual({});
    // Undoable — the nudges come back.
    store.getState().undo();
    expect(Object.keys(store.getState().doc.layoutHints)).toHaveLength(2);

    // With no hints it does nothing (no extra history entry).
    store.getState().cleanLayout(); // re-clears (had hints again)
    const before = store.getState().past.length;
    store.getState().cleanLayout(); // now empty → no-op
    expect(store.getState().past.length).toBe(before);
    expect(store.getState().doc.layoutHints).toEqual({});
  });
});
