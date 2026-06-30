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

  it('setNodeRole re-homes a verbal complement under the verb, not the clause', () => {
    // A spare word hanging off the clause as an adjunct.
    const base = makeBase();
    const rootId = base.syntax.rootId;
    base.tokens.push({ id: 't3', index: 2, surface: 'ἀνθρώπους' });
    base.syntax.nodes.push({ id: 'n3', kind: 'word', role: 'adjunct', tokenIds: ['t3'] });
    base.syntax.relations.push({ id: 'r3', type: 'adjunct', headId: rootId, dependentId: 'n3' });
    store.getState().loadDocument(base, { corpus: 'gnt' });

    store.getState().setNodeRole('n3', 'directObject');
    const { doc } = store.getState();
    const rel = doc.syntax.relations.find((r) => r.dependentId === 'n3')!;
    // The object must now hang off the VERB (n2), where the layout draws baseline
    // complements — not the clause root, where it would be silently dropped.
    expect(rel.type).toBe('directObject');
    expect(rel.headId).toBe('n2');
  });

  it('setNodeRole keeps a clause role (subject) attached to the clause', () => {
    const base = makeBase();
    const rootId = base.syntax.rootId;
    base.tokens.push({ id: 't3', index: 2, surface: 'θεός' });
    base.syntax.nodes.push({ id: 'n3', kind: 'word', role: 'adjunct', tokenIds: ['t3'] });
    base.syntax.relations.push({ id: 'r3', type: 'adjunct', headId: 'n2', dependentId: 'n3' });
    store.getState().loadDocument(base, { corpus: 'gnt' });

    store.getState().setNodeRole('n3', 'subject');
    const rel = store.getState().doc.syntax.relations.find((r) => r.dependentId === 'n3')!;
    expect(rel.type).toBe('subject');
    expect(rel.headId).toBe(rootId);
  });

  it('addClause wraps a single clause in a coordinate root with a new empty member', () => {
    const rootBefore = store.getState().doc.syntax.rootId;
    store.getState().addClause();
    const { doc } = store.getState();
    const root = doc.syntax.nodes.find((n) => n.id === doc.syntax.rootId)!;
    expect(root.clauseType).toBe('coordinate');
    expect(root.id).not.toBe(rootBefore); // a NEW coordinate root wraps the old clause
    // Two coordinate members: the original clause and the fresh one.
    const conjuncts = doc.syntax.relations.filter((r) => r.headId === root.id && r.type === 'conjunct');
    expect(conjuncts).toHaveLength(2);
    expect(conjuncts.map((r) => r.dependentId)).toContain(rootBefore);
    // The new clause has implied subject + predicate slots to fill.
    const newClauseId = conjuncts.map((r) => r.dependentId).find((id) => id !== rootBefore)!;
    const slots = doc.syntax.relations.filter((r) => r.headId === newClauseId);
    expect(slots.map((r) => r.type).sort()).toEqual(['predicate', 'subject']);
    expect(slots.every((r) => doc.syntax.nodes.find((n) => n.id === r.dependentId)?.implied)).toBe(true);
  });

  it('setNodeRole(subject) replaces the existing subject (swap), not doubles it', () => {
    // n1=subject(λόγος), n2=predicate(ἦν). Add a loose word, then make IT the
    // subject: the slot must hold one subject — the old λόγος is swapped out.
    const base = makeBase();
    base.tokens.push({ id: 't3', index: 2, surface: 'θεός' });
    base.syntax.nodes.push({ id: 'n3', kind: 'word', role: 'adjunct', tokenIds: ['t3'] });
    base.syntax.relations.push({ id: 'r3', type: 'adjunct', headId: 'n2', dependentId: 'n3' });
    store.getState().loadDocument(base, { corpus: 'gnt' });

    store.getState().setNodeRole('n3', 'subject');
    const { doc } = store.getState();
    const rootId = doc.syntax.rootId;
    const subjects = doc.syntax.relations.filter((r) => r.headId === rootId && r.type === 'subject');
    expect(subjects).toHaveLength(1); // exactly one subject — not doubled
    expect(subjects[0]!.dependentId).toBe('n3');
    // The displaced λόγος took n3's vacated role/head (adjunct of n2).
    const displaced = doc.syntax.relations.find((r) => r.dependentId === 'n1')!;
    expect(displaced.type).toBe('adjunct');
    expect(displaced.headId).toBe('n2');
  });

  it('setNodeRole(subject) drops an implied subject placeholder instead of swapping', () => {
    const base = makeBase();
    base.syntax.nodes = base.syntax.nodes.map((n) =>
      n.id === 'n1' ? { ...n, tokenIds: [], implied: true, label: '(subject)' } : n,
    );
    base.tokens.push({ id: 't3', index: 2, surface: 'θεός' });
    base.syntax.nodes.push({ id: 'n3', kind: 'word', role: 'adjunct', tokenIds: ['t3'] });
    base.syntax.relations.push({ id: 'r3', type: 'adjunct', headId: 'n2', dependentId: 'n3' });
    store.getState().loadDocument(base, { corpus: 'gnt' });

    store.getState().setNodeRole('n3', 'subject');
    const { doc } = store.getState();
    expect(doc.syntax.relations.some((r) => r.dependentId === 'n1')).toBe(false); // placeholder gone
    const subjects = doc.syntax.relations.filter((r) => r.headId === doc.syntax.rootId && r.type === 'subject');
    expect(subjects).toHaveLength(1);
    expect(subjects[0]!.dependentId).toBe('n3');
  });

  it('attachNodeTo into an occupied subject slot swaps the current subject out', () => {
    // Two clauses; move clause B's would-be subject into clause A's subject slot.
    const base = makeBase();
    const rootId = base.syntax.rootId;
    base.tokens.push({ id: 't3', index: 2, surface: 'φῶς' });
    base.syntax.nodes.push({ id: 'n3', kind: 'word', role: 'adjunct', tokenIds: ['t3'] });
    base.syntax.relations.push({ id: 'r3', type: 'adjunct', headId: 'n2', dependentId: 'n3' });
    store.getState().loadDocument(base, { corpus: 'gnt' });

    store.getState().attachNodeTo('n3', rootId, 'subject');
    const { doc } = store.getState();
    const subjects = doc.syntax.relations.filter((r) => r.headId === rootId && r.type === 'subject');
    expect(subjects).toHaveLength(1);
    expect(subjects[0]!.dependentId).toBe('n3');
    // λόγος displaced to n3's old role/head.
    expect(doc.syntax.relations.find((r) => r.dependentId === 'n1')!.type).toBe('adjunct');
  });

  it('setMainPredicate swaps the picked word with the existing main verb', () => {
    // n1=subject(λόγος), n2=predicate(ἦν). Make the SUBJECT the main verb: the old
    // verb ἦν should take the subject's vacated role.
    store.getState().setMainPredicate('n1');
    const { doc } = store.getState();
    const rootId = doc.syntax.rootId;
    const mainVerbRel = doc.syntax.relations.find((r) => r.headId === rootId && r.type === 'predicate')!;
    expect(mainVerbRel.dependentId).toBe('n1'); // λόγος is now the predicate
    // The displaced ἦν took λόγος's old role (subject).
    const displaced = doc.syntax.relations.find((r) => r.dependentId === 'n2')!;
    expect(displaced.type).toBe('subject');
    expect(doc.syntax.nodes.find((n) => n.id === 'n2')!.role).toBe('subject');
  });

  it('setMainPredicate drops an implied (verb) placeholder rather than swapping', () => {
    // Replace the real verb with an implied placeholder, then add a loose word.
    const base = makeBase();
    base.syntax.nodes = base.syntax.nodes.map((n) =>
      n.id === 'n2' ? { ...n, tokenIds: [], implied: true, label: '(verb)' } : n,
    );
    base.tokens.push({ id: 't3', index: 2, surface: 'ἐποίησεν' });
    base.syntax.nodes.push({ id: 'n3', kind: 'word', role: 'adjunct', tokenIds: ['t3'] });
    base.syntax.relations.push({ id: 'r3', type: 'adjunct', headId: base.syntax.rootId, dependentId: 'n3' });
    store.getState().loadDocument(base, { corpus: 'gnt' });

    store.getState().setMainPredicate('n3');
    const { doc } = store.getState();
    const pred = doc.syntax.relations.find((r) => r.headId === doc.syntax.rootId && r.type === 'predicate')!;
    expect(pred.dependentId).toBe('n3');
    // The implied placeholder's relation is gone (dropped, not swapped).
    expect(doc.syntax.relations.some((r) => r.dependentId === 'n2')).toBe(false);
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
