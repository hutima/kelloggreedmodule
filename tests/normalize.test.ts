import { describe, it, expect } from 'vitest';
import { normalizeSyntax, unassignedTokens } from '@/domain/model';
import { layoutDocument } from '@/domain/layout';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

function build(nodes: unknown[], relations: unknown[], tokens: unknown[], rootId = 'c0'): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1, id: 'doc', title: 't', language: 'en', text: 't',
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {}, tokens, syntax: { rootId, nodes, relations },
  });
}
const renderedTexts = (doc: KrDocument) =>
  layoutDocument(doc).elements.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);
const duplicates = (texts: string[]) => {
  const c = new Map<string, number>();
  for (const t of texts) c.set(t, (c.get(t) ?? 0) + 1);
  return [...c.entries()].filter(([, n]) => n > 1).map(([t]) => t);
};

describe('normalizeSyntax — no word is drawn twice', () => {
  it('collapses exact-duplicate relations', () => {
    const doc = build(
      [
        { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'v', kind: 'word', role: 'predicate', tokenIds: ['t1'] },
      ],
      [
        { id: 'r1', type: 'predicate', headId: 'c0', dependentId: 'v' },
        { id: 'r2', type: 'predicate', headId: 'c0', dependentId: 'v' },
      ],
      [{ id: 't1', index: 0, surface: 'runs', pos: 'verb' }],
    );
    const n = normalizeSyntax(doc);
    expect(n.syntax.relations).toHaveLength(1);
    expect(duplicates(renderedTexts(n))).toEqual([]);
  });

  it('keeps a single, highest-priority parent per node (verb not also a subject)', () => {
    const doc = build(
      [
        { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'v', kind: 'word', tokenIds: ['t1'] },
      ],
      [
        { id: 'r1', type: 'subject', headId: 'c0', dependentId: 'v' },
        { id: 'r2', type: 'predicate', headId: 'c0', dependentId: 'v' },
      ],
      [{ id: 't1', index: 0, surface: 'is', pos: 'verb' }],
    );
    const n = normalizeSyntax(doc);
    const parents = n.syntax.relations.filter((r) => r.dependentId === 'v');
    expect(parents).toHaveLength(1);
    expect(parents[0]!.type).toBe('predicate'); // predicate outranks subject
    expect(duplicates(renderedTexts(n))).toEqual([]);
  });

  it('gives a shared token to one node only and splices an empty wrapper', () => {
    // A phrase node holding [of, this] plus child word nodes holding them again.
    const doc = build(
      [
        { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'v', kind: 'word', role: 'predicate', tokenIds: ['t0'] },
        { id: 'pp', kind: 'phrase', role: 'prepositionalPhrase', tokenIds: ['t1', 't2'] },
        { id: 'prep', kind: 'word', role: 'prepositionalPhrase', tokenIds: ['t1'] },
        { id: 'obj', kind: 'word', role: 'prepositionObject', tokenIds: ['t2'] },
      ],
      [
        { id: 'r0', type: 'predicate', headId: 'c0', dependentId: 'v' },
        { id: 'r1', type: 'prepositionalPhrase', headId: 'v', dependentId: 'pp' },
        { id: 'r2', type: 'adjunct', headId: 'pp', dependentId: 'prep' },
        { id: 'r3', type: 'prepositionObject', headId: 'prep', dependentId: 'obj' },
      ],
      [
        { id: 't0', index: 0, surface: 'go', pos: 'verb' },
        { id: 't1', index: 1, surface: 'of', pos: 'preposition' },
        { id: 't2', index: 2, surface: 'it', pos: 'pronoun' },
      ],
    );
    const n = normalizeSyntax(doc);
    // the empty phrase wrapper is gone; its child reparented to the verb
    expect(n.syntax.nodes.some((nd) => nd.id === 'pp')).toBe(false);
    expect(n.syntax.relations.find((r) => r.dependentId === 'prep')!.headId).toBe('v');
    const texts = renderedTexts(n);
    expect(duplicates(texts)).toEqual([]);
    expect(texts).not.toContain('∅');
  });

  it('drops an implied subject once a real subject fills the same slot', () => {
    const doc = build(
      [
        { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'imp', kind: 'word', role: 'subject', tokenIds: [], implied: true, label: '(implied)' },
        { id: 'real', kind: 'word', role: 'subject', tokenIds: ['t1'] },
        { id: 'v', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
      ],
      [
        { id: 'r1', type: 'subject', headId: 'c0', dependentId: 'imp' },
        { id: 'r2', type: 'subject', headId: 'c0', dependentId: 'real' },
        { id: 'r3', type: 'predicate', headId: 'c0', dependentId: 'v' },
      ],
      [
        { id: 't1', index: 0, surface: 'people', pos: 'noun' },
        { id: 't2', index: 1, surface: 'cheered', pos: 'verb' },
      ],
    );
    const n = normalizeSyntax(doc);
    expect(n.syntax.nodes.some((nd) => nd.id === 'imp')).toBe(false);
    expect(n.syntax.relations.some((r) => r.dependentId === 'imp')).toBe(false);
    expect(n.syntax.nodes.some((nd) => nd.id === 'real')).toBe(true);
    // and the placeholder text is gone from the rendered diagram
    expect(renderedTexts(n)).not.toContain('(implied)');
  });

  it('keeps a lone implied subject (genuine pro-drop)', () => {
    const doc = build(
      [
        { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'imp', kind: 'word', role: 'subject', tokenIds: [], implied: true, label: '(he)' },
        { id: 'v', kind: 'word', role: 'predicate', tokenIds: ['t1'] },
      ],
      [
        { id: 'r1', type: 'subject', headId: 'c0', dependentId: 'imp' },
        { id: 'r2', type: 'predicate', headId: 'c0', dependentId: 'v' },
      ],
      [{ id: 't1', index: 0, surface: 'ἔρχεται', pos: 'verb' }],
    );
    expect(normalizeSyntax(doc).syntax.nodes.some((nd) => nd.id === 'imp')).toBe(true);
  });

  it('keeps an intentional implied (empty) node', () => {
    const doc = build(
      [
        { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 's', kind: 'word', role: 'subject', tokenIds: [], implied: true, label: '(he)' },
        { id: 'v', kind: 'word', role: 'predicate', tokenIds: ['t1'] },
      ],
      [
        { id: 'r1', type: 'subject', headId: 'c0', dependentId: 's' },
        { id: 'r2', type: 'predicate', headId: 'c0', dependentId: 'v' },
      ],
      [{ id: 't1', index: 0, surface: 'runs', pos: 'verb' }],
    );
    const n = normalizeSyntax(doc);
    expect(n.syntax.nodes.some((nd) => nd.id === 's')).toBe(true);
    expect(renderedTexts(n)).toContain('(he)');
  });
});

describe('unassignedTokens', () => {
  it('lists tokens no node realizes, in surface order', () => {
    const doc = build(
      [
        { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'v', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
      ],
      [{ id: 'r2', type: 'predicate', headId: 'c0', dependentId: 'v' }],
      [
        { id: 't1', index: 0, surface: 'My', pos: 'pronoun' },
        { id: 't2', index: 1, surface: 'is', pos: 'verb' },
        { id: 't3', index: 2, surface: 'Tim', pos: 'propernoun' },
      ],
    );
    expect(unassignedTokens(doc).map((t) => t.surface)).toEqual(['My', 'Tim']);
  });
});
