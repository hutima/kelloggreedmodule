import { describe, it, expect } from 'vitest';
import { glossDoc, GRC_FUNCTION_GLOSS } from '@/domain/model';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

/**
 * English-gloss mode swaps Greek words for their glosses. Function words the base
 * data leaves unglossed (subordinators, relatives) must still read English —
 * both as tokens and as the connector LABEL written on a clause's link.
 */
function doc(): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1, id: 'd', title: 't', language: 'grc', text: 'ἵνα …',
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {},
    tokens: [
      { id: 't_hina', index: 0, surface: 'ἵνα', pos: 'conjunction' }, // no gloss in data
      { id: 't_v', index: 1, surface: 'κάμψῃ', pos: 'verb', gloss: 'should bow' },
    ],
    syntax: {
      rootId: 'c0',
      nodes: [
        { id: 'c0', kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'sub', kind: 'clause', clauseType: 'adverbial', tokenIds: [] },
        { id: 'v', kind: 'word', role: 'predicate', tokenIds: ['t_v'] },
      ],
      relations: [
        { id: 'r1', type: 'predicate', headId: 'sub', dependentId: 'v' },
        // the subordinator written on the connecting line as a Greek label
        { id: 'r2', type: 'adverbial', headId: 'c0', dependentId: 'sub', label: 'ἵνα' },
      ],
    },
  });
}

describe('gloss-mode function-word fallback', () => {
  it('glosses an unglossed subordinator/relative token via the fallback map', () => {
    const g = glossDoc(doc());
    expect(g.tokens.find((t) => t.id === 't_hina')!.surface).toBe('so that');
    // a real data gloss still wins
    expect(g.tokens.find((t) => t.id === 't_v')!.surface).toBe('should bow');
  });

  it('glosses the Greek connector LABEL of a clause link', () => {
    const g = glossDoc(doc());
    expect(g.syntax.relations.find((r) => r.id === 'r2')!.label).toBe('so that');
  });

  it('does not confuse a relative with the look-alike article (accent-keyed)', () => {
    // ὅ (relative) is mapped; ὁ (article) is not.
    expect(GRC_FUNCTION_GLOSS['ὅ']).toBe('which');
    expect(GRC_FUNCTION_GLOSS['ὁ']).toBeUndefined();
  });
});
