import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/state';
import {
  createDocument,
  unassignedTokens,
  detachNode,
  headForRoleInClause,
  parentRelations,
  getNode,
} from '@/domain/model';
import { isEditableMode } from '@/domain/layout';
import { suggestRolesForHead } from '@/ui/editor/roles';
import type { KrDocument } from '@/domain/schema';

const store = useEditorStore;

/** root clause with subject λόγος (n1, t1) + verb ἦν (n2, t2). */
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

describe('editable modes', () => {
  it('only the Phrase/Block (block) diagram is editable; every other view is read-only', () => {
    expect(isEditableMode('phrase-block')).toBe(true);
    // Kellogg-Reed and the rest are presentation-only — edits happen in the block
    // diagram and are visualized everywhere else.
    expect(isEditableMode('kellogg-reed')).toBe(false);
    expect(isEditableMode('dependency')).toBe(false);
    expect(isEditableMode('dependency-tree')).toBe(false);
    expect(isEditableMode('constituency')).toBe(false);
    expect(isEditableMode('morphology')).toBe(false);
  });
});

describe('suggestRolesForHead — Verb reachable on a clause', () => {
  it('a clause head suggests predicate (Verb) as a one-tap chip', () => {
    const doc = makeBase();
    const roles = suggestRolesForHead(doc, doc.syntax.rootId);
    expect(roles).toContain('predicate');
    expect(roles).toContain('subject');
  });
});

describe('detachNode (pure) — keeps the subtree, drops the node', () => {
  it('re-homes children onto the detached node\'s parent', () => {
    const base = makeBase();
    const rootId = base.syntax.rootId;
    // An article hanging under λόγος (n1).
    base.tokens.push({ id: 't3', index: 2, surface: 'ὁ' });
    base.syntax.nodes.push({ id: 'art', kind: 'word', role: 'determiner', tokenIds: ['t3'] });
    base.syntax.relations.push({ id: 'r3', type: 'determiner', headId: 'n1', dependentId: 'art' });

    const next = detachNode(base.syntax, 'n1');
    expect(next.nodes.some((n) => n.id === 'n1')).toBe(false); // node gone
    expect(next.nodes.some((n) => n.id === 'art')).toBe(true); // child survives
    // The article is re-pointed onto n1's former parent (the root).
    const artParent = next.relations.find((r) => r.dependentId === 'art')!;
    expect(artParent.headId).toBe(rootId);
    // The root can never be detached.
    expect(detachNode(base.syntax, rootId)).toBe(base.syntax);
  });
});

describe('store — two-step deletion', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    store.getState().loadDocument(makeBase(), { corpus: 'gnt' });
  });

  it('detachWord takes the word off the diagram but keeps the token (unassigned)', () => {
    store.getState().detachWord('n1');
    const { doc } = store.getState();
    expect(doc.syntax.nodes.some((n) => n.id === 'n1')).toBe(false);
    // λόγος is still a token, now unassigned (back in the bank).
    expect(doc.tokens.some((t) => t.id === 't1')).toBe(true);
    expect(unassignedTokens(doc).map((t) => t.id)).toContain('t1');
  });

  it('removeToken deletes an unassigned token for good', () => {
    store.getState().detachWord('n1');
    expect(unassignedTokens(store.getState().doc).map((t) => t.id)).toContain('t1');
    store.getState().removeToken('t1');
    const { doc } = store.getState();
    expect(doc.tokens.some((t) => t.id === 't1')).toBe(false);
    expect(unassignedTokens(doc).map((t) => t.id)).not.toContain('t1');
  });

  it('detachWord never removes the root', () => {
    const rootId = store.getState().doc.syntax.rootId;
    store.getState().detachWord(rootId);
    expect(store.getState().doc.syntax.nodes.some((n) => n.id === rootId)).toBe(true);
  });
});

describe('store — placeToken is clause-aware', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    store.getState().loadDocument(makeBase(), { corpus: 'gnt' });
  });

  it('places an unassigned token into the selected clause', () => {
    // An unassigned third token.
    const base = makeBase();
    base.tokens.push({ id: 't3', index: 2, surface: 'θεός' });
    store.getState().loadDocument(base, { corpus: 'gnt' });
    const rootId = store.getState().doc.syntax.rootId;

    store.getState().select({ nodeId: rootId }); // the clause is selected
    store.getState().placeToken('t3');
    const { doc, selection } = store.getState();
    const placed = selection.nodeId!;
    const rel = parentRelations(doc.syntax, placed)[0]!;
    expect(rel.headId).toBe(rootId); // landed in the selected clause
  });
});

describe('store — verb assignment + assignToClause', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('setNodeRole(predicate) makes a clause word the verb, evicting the placeholder', () => {
    // A clause with an implied (verb) placeholder + a loose word to promote.
    const base = makeBase();
    base.syntax.nodes = base.syntax.nodes.map((n) =>
      n.id === 'n2' ? { ...n, tokenIds: [], implied: true, label: '(verb)' } : n,
    );
    base.tokens.push({ id: 't3', index: 2, surface: 'ἐποίησεν' });
    base.syntax.nodes.push({ id: 'n3', kind: 'word', role: 'adjunct', tokenIds: ['t3'] });
    base.syntax.relations.push({ id: 'r3', type: 'adjunct', headId: base.syntax.rootId, dependentId: 'n3' });
    store.getState().loadDocument(base, { corpus: 'gnt' });

    store.getState().setNodeRole('n3', 'predicate');
    const { doc } = store.getState();
    const rootId = doc.syntax.rootId;
    const preds = doc.syntax.relations.filter((r) => r.headId === rootId && r.type === 'predicate');
    expect(preds).toHaveLength(1);
    expect(preds[0]!.dependentId).toBe('n3'); // n3 is now the verb
    expect(doc.syntax.relations.some((r) => r.dependentId === 'n2')).toBe(false); // placeholder gone
  });

  it('assignToClause homes a verbal complement under the chosen clause\'s verb', () => {
    // Two member clauses under a coordinate root; cA has a verb vA.
    const doc = createDocument({ language: 'grc', title: 'two clauses' });
    const W = doc.syntax.rootId;
    const base: KrDocument = {
      ...doc,
      tokens: [
        { id: 'tv', index: 0, surface: 'εἶδεν' },
        { id: 'tw', index: 1, surface: 'φῶς' },
      ],
      syntax: {
        rootId: W,
        nodes: [
          { id: W, kind: 'clause', clauseType: 'coordinate', tokenIds: [] },
          { id: 'cA', kind: 'clause', clauseType: 'independent', tokenIds: [] },
          { id: 'cB', kind: 'clause', clauseType: 'independent', tokenIds: [] },
          { id: 'vA', kind: 'word', role: 'predicate', tokenIds: ['tv'] },
          { id: 'w', kind: 'word', role: 'directObject', tokenIds: ['tw'] },
        ],
        relations: [
          { id: 'rA', type: 'conjunct', headId: W, dependentId: 'cA' },
          { id: 'rB', type: 'conjunct', headId: W, dependentId: 'cB' },
          { id: 'rV', type: 'predicate', headId: 'cA', dependentId: 'vA' },
          { id: 'rW', type: 'directObject', headId: 'cB', dependentId: 'w' },
        ],
      },
    };
    store.getState().loadDocument(base, { corpus: 'gnt' });

    // Sanity on the pure helper: a verbal complement resolves to the clause's verb.
    expect(headForRoleInClause(base.syntax, 'cA', 'directObject')).toBe('vA');

    store.getState().assignToClause('w', 'cA');
    const after = store.getState().doc;
    const rel = parentRelations(after.syntax, 'w')[0]!;
    expect(rel.headId).toBe('vA'); // re-homed under cA's verb
    expect(rel.type).toBe('directObject'); // role preserved
    expect(getNode(after.syntax, 'w')!.role).toBe('directObject');
  });
});
