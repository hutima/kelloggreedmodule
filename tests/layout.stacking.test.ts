import { describe, it, expect } from 'vitest';
import { layoutDocument } from '@/domain/layout';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

/**
 * Regression tests for the readability fix: tall clause-valued children stack
 * VERTICALLY on a shared stem instead of fanning out horizontally. Without this
 * a document with several coordinated/subordinate clauses degenerates into one
 * extremely wide, overlapping strip.
 */

function word(id: string, surface: string) {
  return { id, index: 0, surface };
}

/** A root clause coordinating N independent "I run" clauses. */
function coordinatedClauses(n: number): KrDocument {
  const tokens = [];
  const nodes: Record<string, unknown>[] = [
    { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
  ];
  const relations: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const subj = `ts${i}`;
    const verb = `tv${i}`;
    tokens.push({ ...word(subj, 'I'), pos: 'pronoun' });
    tokens.push({ ...word(verb, 'run'), pos: 'verb' });
    nodes.push({ id: `c${i}`, kind: 'clause', clauseType: 'independent', tokenIds: [] });
    nodes.push({ id: `s${i}`, kind: 'word', role: 'subject', tokenIds: [subj] });
    nodes.push({ id: `v${i}`, kind: 'word', role: 'predicate', tokenIds: [verb] });
    relations.push({ id: `rc${i}`, type: 'conjunct', headId: 'n_root', dependentId: `c${i}` });
    relations.push({ id: `rs${i}`, type: 'subject', headId: `c${i}`, dependentId: `s${i}` });
    relations.push({ id: `rv${i}`, type: 'predicate', headId: `c${i}`, dependentId: `v${i}` });
  }
  return KrDocumentSchema.parse({
    schemaVersion: 1,
    id: 'doc_stack',
    title: 't',
    language: 'en',
    text: 'I run. I run.',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {},
    tokens,
    syntax: { rootId: 'n_root', nodes, relations },
  });
}

const subjectYs = (layout: ReturnType<typeof layoutDocument>) =>
  layout.elements
    .filter((e) => e.kind === 'text' && (e as { text: string }).text === 'I')
    .map((e) => (e as { y: number }).y)
    .sort((a, b) => a - b);

describe('clause stacking keeps the diagram readable', () => {
  it('stacks coordinated clauses vertically, not horizontally', () => {
    const layout = layoutDocument(coordinatedClauses(5));
    const ys = subjectYs(layout);
    expect(ys.length).toBe(5);
    // Each successive clause's subject is clearly lower than the previous one.
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]!).toBeGreaterThan(ys[i - 1]! + 20);
    }
    // Vertical stacking ⇒ five clauses are no wider than one (they share an x
    // column); a horizontal strip would be ~5× as wide.
    const one = layoutDocument(coordinatedClauses(1));
    expect(layout.width).toBeLessThan(one.width + 40);
  });

  it('does not balloon in width as clauses are added', () => {
    const five = layoutDocument(coordinatedClauses(5));
    const ten = layoutDocument(coordinatedClauses(10));
    // Doubling the clause count must not materially widen the diagram.
    expect(ten.width).toBeLessThan(five.width + 40);
    // ...it grows downward instead.
    expect(ten.height).toBeGreaterThan(five.height);
  });
});
