import { describe, it, expect } from 'vitest';
import { diffDocsForCompare } from '@/domain/contested';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

/**
 * The edit-mode before/after diff: which nodes/relations were added, removed, or
 * changed between the original parse and the current edits (same ids).
 */
function doc(relType: string, extraNode = false): KrDocument {
  const nodes: unknown[] = [
    { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
    { id: 'S', kind: 'word', role: 'subject', tokenIds: ['t1'] },
    { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
  ];
  const relations: unknown[] = [
    { id: 'r1', type: 'subject', headId: 'c0', dependentId: 'S' },
    { id: 'r2', type: relType, headId: 'c0', dependentId: 'V' },
  ];
  if (extraNode) {
    nodes.push({ id: 'X', kind: 'word', role: 'adjunct', tokenIds: ['t3'] });
    relations.push({ id: 'r3', type: 'adjunct', headId: 'V', dependentId: 'X' });
  }
  return KrDocumentSchema.parse({
    schemaVersion: 1, id: 'd', title: 't', language: 'en', text: 't',
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {}, tokens: [
      { id: 't1', index: 0, surface: 'dog', pos: 'noun' },
      { id: 't2', index: 1, surface: 'runs', pos: 'verb' },
      { id: 't3', index: 2, surface: 'fast', pos: 'adverb' },
    ],
    syntax: { rootId: 'c0', nodes, relations },
  });
}

describe('diffDocsForCompare', () => {
  it('reports a changed relation', () => {
    const d = diffDocsForCompare(doc('predicate'), doc('copula'));
    expect(d.changedRelationIds).toContain('r2');
    expect(d.addedRelationIds).toEqual([]);
    expect(d.removedRelationIds).toEqual([]);
  });

  it('reports added node + relation', () => {
    const d = diffDocsForCompare(doc('predicate'), doc('predicate', true));
    expect(d.addedNodeIds).toContain('X');
    expect(d.addedRelationIds).toContain('r3');
  });

  it('reports removed node + relation (base had the extra)', () => {
    const d = diffDocsForCompare(doc('predicate', true), doc('predicate'));
    expect(d.removedNodeIds).toContain('X');
    expect(d.removedRelationIds).toContain('r3');
  });

  it('reports no changes for identical docs', () => {
    const d = diffDocsForCompare(doc('predicate'), doc('predicate'));
    expect(d.changedNodeIds.length + d.changedRelationIds.length).toBe(0);
    expect(d.addedNodeIds.length + d.removedNodeIds.length).toBe(0);
  });
});
