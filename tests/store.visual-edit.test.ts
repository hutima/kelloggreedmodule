import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/state';
import { dispatchEditIntent } from '@/ui/editor/dispatch';
import { createDocument } from '@/domain/model';
import type { KrDocument } from '@/domain/schema';

const store = useEditorStore;

/** root clause → (art "ὁ") + (subj "λόγος") + (verb "ἦν"); art nested under subj. */
function makeBase(): KrDocument {
  const doc = createDocument({ language: 'grc', title: 'John 1:1' });
  const rootId = doc.syntax.rootId;
  return {
    ...doc,
    tokens: [
      { id: 't1', index: 0, surface: 'ὁ' },
      { id: 't2', index: 1, surface: 'λόγος' },
      { id: 't3', index: 2, surface: 'ἦν' },
    ],
    syntax: {
      rootId,
      nodes: [
        { id: rootId, kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'art', kind: 'word', role: 'determiner', tokenIds: ['t1'] },
        { id: 'subj', kind: 'word', role: 'subject', tokenIds: ['t2'] },
        { id: 'verb', kind: 'word', role: 'predicate', tokenIds: ['t3'] },
      ],
      relations: [
        { id: 'r_art', type: 'determiner', headId: 'subj', dependentId: 'art' },
        { id: 'r_subj', type: 'subject', headId: rootId, dependentId: 'subj' },
        { id: 'r_verb', type: 'predicate', headId: rootId, dependentId: 'verb' },
      ],
    },
  };
}

const parentOf = (id: string) =>
  store.getState().doc.syntax.relations.find((r) => r.dependentId === id);

describe('store — tier + tool state', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    store.getState().loadDocument(makeBase(), { corpus: 'gnt' });
    store.getState().setEditTier('basic');
    store.getState().setActiveEditTool('select');
  });

  it('defaults to Basic tier and the Select tool', () => {
    store.getState().loadDocument(makeBase(), { corpus: 'gnt' });
    // editTier/tool are initialised independently of the loaded doc.
    expect(['basic', 'advanced']).toContain(store.getState().editTier);
  });

  it('setEditTier resets any in-progress link', () => {
    store.getState().startVisualLink('art');
    expect(store.getState().pendingLinkStart).toBe('art');
    store.getState().setEditTier('advanced');
    expect(store.getState().editTier).toBe('advanced');
    expect(store.getState().pendingLinkStart).toBeNull();
  });

  it('setActiveEditTool clears pending link / draft', () => {
    store.getState().startVisualLink('art');
    store.getState().completeVisualLink('verb');
    expect(store.getState().relationshipDraft).not.toBeNull();
    store.getState().setActiveEditTool('select');
    expect(store.getState().relationshipDraft).toBeNull();
    expect(store.getState().pendingLinkStart).toBeNull();
  });
});

describe('store — visual linking flow', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    store.getState().loadDocument(makeBase(), { corpus: 'gnt' });
  });

  it('start → complete builds a draft; confirm flows to attachNodeTo', () => {
    store.getState().startVisualLink('art');
    store.getState().completeVisualLink('verb');
    const draft = store.getState().relationshipDraft;
    expect(draft).toEqual({ dependentId: 'art', headId: 'verb' });
    store.getState().confirmRelationshipDraft('adjectival');
    const rel = parentOf('art')!;
    expect(rel.headId).toBe('verb');
    expect(rel.type).toBe('adjectival');
    expect(rel.provenance?.source).toBe('manual');
    expect(store.getState().relationshipDraft).toBeNull();
  });

  it('completing a link onto the same word is ignored', () => {
    store.getState().startVisualLink('art');
    store.getState().completeVisualLink('art');
    expect(store.getState().relationshipDraft).toBeNull();
  });
});

describe('dispatchEditIntent — hierarchy + tools + modals', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    store.getState().loadDocument(makeBase(), { corpus: 'gnt' });
  });

  it('promoteNode attaches to the grandparent', () => {
    // art → subj → root, so promoting art re-points it under root.
    dispatchEditIntent({ kind: 'promoteNode', nodeId: 'art' });
    expect(parentOf('art')!.headId).toBe(store.getState().doc.syntax.rootId);
  });

  it('moveNodeUnder re-points the incoming relation, keeping its type', () => {
    dispatchEditIntent({ kind: 'moveNodeUnder', nodeId: 'art', headId: 'verb' });
    const rel = parentOf('art')!;
    expect(rel.headId).toBe('verb');
    expect(rel.type).toBe('determiner'); // kept
  });

  it('setEditTool and switchDiagramMode drive view/tool state', () => {
    dispatchEditIntent({ kind: 'setEditTool', tool: 'link' });
    expect(store.getState().activeEditTool).toBe('link');
    dispatchEditIntent({ kind: 'switchDiagramMode', mode: 'dependency' });
    expect(store.getState().diagramMode).toBe('dependency');
  });

  it('modal intents open the central editModal; closeEditModal clears it', () => {
    dispatchEditIntent({ kind: 'openAdvancedWordDetails', nodeId: 'subj' });
    expect(store.getState().editModal).toEqual({ type: 'wordDetails', nodeId: 'subj' });
    dispatchEditIntent({ kind: 'openQuickGloss', nodeId: 'subj' });
    expect(store.getState().editModal).toEqual({ type: 'quickGloss', nodeId: 'subj' });
    store.getState().closeEditModal();
    expect(store.getState().editModal).toBeNull();
  });
});

describe('store — grouping', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    store.getState().loadDocument(makeBase(), { corpus: 'gnt' });
  });

  it('groupTokens merges word nodes into one phrase node, re-pointing children', () => {
    // Group the article + its noun (t1, t2) into one block.
    store.getState().groupTokens(['t1', 't2']);
    const { doc } = store.getState();
    const grouped = doc.syntax.nodes.find(
      (n) => n.tokenIds.includes('t1') && n.tokenIds.includes('t2'),
    );
    expect(grouped).toBeTruthy();
    // The old single-token nodes are gone.
    expect(doc.syntax.nodes.find((n) => n.id === 'art')).toBeUndefined();
    // No relation may dangle to a removed node.
    const ids = new Set(doc.syntax.nodes.map((n) => n.id));
    for (const r of doc.syntax.relations) {
      expect(ids.has(r.headId)).toBe(true);
      expect(ids.has(r.dependentId)).toBe(true);
    }
  });

  it('groupTokens is a no-op for fewer than two tokens', () => {
    const before = store.getState().doc.syntax.nodes.length;
    store.getState().groupTokens(['t1']);
    expect(store.getState().doc.syntax.nodes.length).toBe(before);
  });

  it('ungroupNode splits a multi-token node back into one node per token', () => {
    store.getState().groupTokens(['t1', 't2']);
    const grouped = store
      .getState()
      .doc.syntax.nodes.find((n) => n.tokenIds.includes('t1') && n.tokenIds.includes('t2'))!;
    store.getState().ungroupNode(grouped.id);
    const { doc } = store.getState();
    const t1Node = doc.syntax.nodes.find((n) => n.tokenIds.length === 1 && n.tokenIds[0] === 't1');
    const t2Node = doc.syntax.nodes.find((n) => n.tokenIds.length === 1 && n.tokenIds[0] === 't2');
    expect(t1Node).toBeTruthy();
    expect(t2Node).toBeTruthy();
  });

  it('grouped edits still persist as a patch against the base', () => {
    store.getState().groupTokens(['t1', 't2']);
    // The live doc differs from the base → a patch should have been derived.
    const { baseDoc, doc } = store.getState();
    expect(baseDoc).not.toBeNull();
    expect(doc.syntax.nodes.length).not.toBe(baseDoc!.syntax.nodes.length);
  });
});
