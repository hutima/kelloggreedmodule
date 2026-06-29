import { describe, it, expect } from 'vitest';
import {
  adapterFor,
  dependencyAdapter,
  phraseBlockAdapter,
  morphologyAdapter,
  kelloggReedAdapter,
} from '@/ui/editor/adapters';
import { createDocument } from '@/domain/model';
import type { KrDocument } from '@/domain/schema';

function makeDoc(): KrDocument {
  const doc = createDocument({ language: 'grc', title: 'Test' }, () => '2024-01-01T00:00:00.000Z');
  const rootId = doc.syntax.rootId;
  return {
    ...doc,
    tokens: [{ id: 't1', index: 0, surface: 'λόγος' }],
    syntax: {
      rootId,
      nodes: [
        { id: rootId, kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n1', kind: 'word', role: 'subject', tokenIds: ['t1'] },
      ],
      relations: [{ id: 'r1', type: 'subject', headId: rootId, dependentId: 'n1' }],
    },
    layoutHints: { n1: { offsetX: 4 } },
  };
}

describe('editor view adapters', () => {
  it('registry maps every diagram mode to an adapter', () => {
    expect(adapterFor('kellogg-reed').mode).toBe('kellogg-reed');
    expect(adapterFor('phrase-block').mode).toBe('phrase-block');
    expect(adapterFor('dependency').mode).toBe('dependency');
    expect(adapterFor('morphology').mode).toBe('morphology');
  });

  it('a node selection offers role/attach/note actions in every view', () => {
    const doc = makeDoc();
    for (const a of [kelloggReedAdapter, phraseBlockAdapter, dependencyAdapter, morphologyAdapter]) {
      const actions = a.getActions(doc, { nodeId: 'n1' });
      expect(actions.length).toBeGreaterThan(0);
      // every adapter ultimately allows adding a note (sermon prep)
      expect(actions.some((x) => x.intent.kind === 'openNote')).toBe(true);
    }
  });

  it('the root node cannot be deleted or re-roled', () => {
    const doc = makeDoc();
    const actions = kelloggReedAdapter.getActions(doc, { nodeId: doc.syntax.rootId });
    expect(actions.some((a) => a.intent.kind === 'removeNode')).toBe(false);
    expect(actions.some((a) => a.intent.kind === 'openRoleEditor')).toBe(false);
  });

  it('Dependency view leads with "make this depend on…"', () => {
    const doc = makeDoc();
    const primary = dependencyAdapter.getPrimaryAction(doc, { nodeId: 'n1' });
    expect(primary?.intent.kind).toBe('openRelationBuilder');
  });

  it('Phrase/Block view leads with the block (hierarchy) editor', () => {
    const doc = makeDoc();
    const primary = phraseBlockAdapter.getPrimaryAction(doc, { nodeId: 'n1' });
    expect(primary?.intent.kind).toBe('openBlockEditor');
  });

  it('Morphology view leads with the word-details editor', () => {
    const doc = makeDoc();
    const primary = morphologyAdapter.getPrimaryAction(doc, { nodeId: 'n1' });
    expect(primary?.intent.kind).toBe('openMorphology');
  });

  it('Kellogg-Reed view offers a reset-layout action only when a hint exists', () => {
    const doc = makeDoc();
    const withHint = kelloggReedAdapter.getActions(doc, { nodeId: 'n1' });
    expect(withHint.some((a) => a.intent.kind === 'resetLayout')).toBe(true);
    const noHint = kelloggReedAdapter.getActions({ ...doc, layoutHints: {} }, { nodeId: 'n1' });
    expect(noHint.some((a) => a.intent.kind === 'resetLayout')).toBe(false);
  });

  it('a relation selection offers type/reattach/reverse/delete', () => {
    const doc = makeDoc();
    const actions = dependencyAdapter.getActions(doc, { relationId: 'r1' });
    const kinds = actions.map((a) => a.intent.kind);
    expect(kinds).toContain('openRelationBuilder');
    expect(kinds).toContain('startRelink');
    expect(kinds).toContain('reverseRelation');
    expect(kinds).toContain('removeRelation');
  });
});
