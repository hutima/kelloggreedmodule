import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/state';

// Operate on the vanilla store API directly (no React needed).
const store = useEditorStore;

describe('editor store', () => {
  beforeEach(() => {
    store.getState().newDocument('en', 'Test');
  });

  it('tokenizes the current text', () => {
    store.getState().setText('The Word became flesh.');
    store.getState().tokenizeText();
    expect(store.getState().doc.tokens.map((t) => t.surface)).toEqual([
      'The',
      'Word',
      'became',
      'flesh.',
    ]);
  });

  it('supports undo and redo of edits', () => {
    store.getState().setTitle('First');
    store.getState().setTitle('Second');
    expect(store.getState().doc.title).toBe('Second');
    store.getState().undo();
    expect(store.getState().doc.title).toBe('First');
    store.getState().redo();
    expect(store.getState().doc.title).toBe('Second');
  });

  it('generates and accepts inferences in assisted mode', () => {
    store.getState().setText('The Word became flesh.');
    store.getState().tokenizeText();
    store.getState().setMode('assisted');
    expect(store.getState().inferences.length).toBeGreaterThan(0);
    const first = store.getState().inferences[0]!;
    const before = store.getState().doc.syntax.nodes.length;
    store.getState().acceptInference(first.id);
    expect(store.getState().doc.syntax.nodes.length).toBeGreaterThanOrEqual(before);
    expect(store.getState().inferences.find((i) => i.id === first.id)).toBeUndefined();
  });

  it('removes a node subtree but never the root', () => {
    const rootId = store.getState().doc.syntax.rootId;
    store.getState().removeNode(rootId);
    expect(store.getState().doc.syntax.nodes.some((n) => n.id === rootId)).toBe(true);
  });

  it('relinks a relation endpoint by clicking a word', () => {
    const s = store.getState();
    // Two word nodes and a relation between them.
    s.upsertNode({ id: 'a', kind: 'word', tokenIds: [] });
    s.upsertNode({ id: 'b', kind: 'word', tokenIds: [] });
    s.upsertNode({ id: 'c', kind: 'word', tokenIds: [] });
    s.upsertRelation({ id: 'rx', type: 'adjectival', headId: 'a', dependentId: 'b' });

    store.getState().startRelink('rx', 'head');
    expect(store.getState().linking).toEqual({ relationId: 'rx', end: 'head' });

    // Clicking node "c" re-points the head and marks the edit manual.
    store.getState().relinkTo('c');
    const rel = store.getState().doc.syntax.relations.find((r) => r.id === 'rx')!;
    expect(rel.headId).toBe('c');
    expect(rel.provenance?.source).toBe('manual');
    expect(store.getState().linking).toBeNull();
  });

  it('ignores a relink that would form a self-loop', () => {
    const s = store.getState();
    s.upsertNode({ id: 'a', kind: 'word', tokenIds: [] });
    s.upsertNode({ id: 'b', kind: 'word', tokenIds: [] });
    s.upsertRelation({ id: 'ry', type: 'adjectival', headId: 'a', dependentId: 'b' });
    store.getState().startRelink('ry', 'head');
    store.getState().relinkTo('b'); // same as dependent → rejected
    const rel = store.getState().doc.syntax.relations.find((r) => r.id === 'ry')!;
    expect(rel.headId).toBe('a');
    expect(store.getState().linking).toBeNull();
  });
});
