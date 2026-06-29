import { describe, it, expect } from 'vitest';
import { combinePassage } from '@/io/passage';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';
import { layoutDocument } from '@/domain/layout';

/** A minimal one-clause Greek sentence document. */
function sentence(id: string, title: string, subj: string, verb: string): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1, id, title, language: 'grc', text: `${subj} ${verb}`,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', layoutHints: {},
    tokens: [
      { id: 's', index: 0, surface: subj, pos: 'noun' },
      { id: 'v', index: 1, surface: verb, pos: 'verb' },
    ],
    syntax: {
      rootId: 'c',
      nodes: [
        { id: 'c', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'S', kind: 'word', role: 'subject', tokenIds: ['s'] },
        { id: 'V', kind: 'word', role: 'predicate', tokenIds: ['v'] },
      ],
      relations: [
        { id: 'r1', type: 'subject', headId: 'c', dependentId: 'S' },
        { id: 'r2', type: 'predicate', headId: 'c', dependentId: 'V' },
      ],
    },
  });
}

describe('combinePassage', () => {
  const a = sentence('gnt_a', 'Romans 5:1', 'Παῦλος', 'γράφει');
  const b = sentence('gnt_b', 'Romans 5:2', 'Πέτρος', 'λέγει');

  it('returns the single document unchanged when only one is selected', () => {
    expect(combinePassage([a])).toBe(a);
  });

  it('combines sentences under a discourse root with no id collisions', () => {
    const doc = combinePassage([a, b]);
    expect(() => KrDocumentSchema.parse(doc)).not.toThrow();
    const root = doc.syntax.nodes.find((n) => n.id === doc.syntax.rootId)!;
    expect(root.clauseType).toBe('discourse');
    // Both sentences hang off the root, labelled by verse.
    const children = doc.syntax.relations.filter((r) => r.headId === root.id);
    expect(children).toHaveLength(2);
    const labels = children.map((r) => doc.syntax.nodes.find((n) => n.id === r.dependentId)?.label);
    expect(labels).toEqual(['5:1', '5:2']);
    // Ids are unique and all relations reference existing nodes.
    const ids = new Set(doc.syntax.nodes.map((n) => n.id));
    expect(ids.size).toBe(doc.syntax.nodes.length);
    for (const r of doc.syntax.relations) {
      expect(ids.has(r.headId)).toBe(true);
      expect(ids.has(r.dependentId)).toBe(true);
    }
    // Both surface forms survive (no token-id clobbering).
    expect(doc.tokens.map((t) => t.surface).sort()).toEqual(['Πέτρος', 'Παῦλος', 'γράφει', 'λέγει'].sort());
    // Reference text carries verse numbers.
    expect(doc.text).toContain('[5:1]');
    expect(doc.text).toContain('[5:2]');
    expect(doc.title).toBe('Romans 5:1–2');
  });

  it('lays out both sentences stacked (each its own baseline)', () => {
    const layout = layoutDocument(combinePassage([a, b]));
    const yOf = (t: string) =>
      (layout.elements.find((e) => e.kind === 'text' && (e as { text: string }).text === t) as { y: number } | undefined)?.y;
    // Both verbs are drawn, on clearly different rows.
    expect(yOf('γράφει')).toBeDefined();
    expect(yOf('λέγει')).toBeDefined();
    expect(Math.abs(yOf('λέγει')! - yOf('γράφει')!)).toBeGreaterThan(40);
  });
});
