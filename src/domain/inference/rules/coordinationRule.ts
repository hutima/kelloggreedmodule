import { lexicon } from '../lexicon';
import type { InferenceRule } from '../types';
import { buildWordNode, nextToken, prevToken, wordNodeId } from './helpers';

/**
 * Recognises a coordinator (and / καί / δέ ...) flanked by two like elements
 * and proposes a coordinator node joining the two conjuncts. Only the local
 * surface neighbours are linked; deeper coordinate structures are left for the
 * user to extend.
 */
export const coordinationRule: InferenceRule = {
  name: 'coordination',
  description: 'Join elements flanking a coordinating conjunction.',
  run: ({ doc, nextId }) => {
    const lex = lexicon(doc.language);
    return doc.tokens
      .filter((t) => lex.isCoordinator(t.surface) || t.pos === 'conjunction')
      .map((conj) => ({
        conj,
        left: prevToken(doc.tokens, conj),
        right: nextToken(doc.tokens, conj),
      }))
      .filter((x) => Boolean(x.left) && Boolean(x.right))
      .map(({ conj, left, right }) => ({
        id: nextId('inf'),
        title: `Coordination: ${left!.surface} ${conj.surface} ${right!.surface}`,
        category: 'coordination' as const,
        provenance: {
          source: 'inferred' as const,
          confidence: 'low' as const,
          reason: `"${conj.surface}" coordinates "${left!.surface}" and "${right!.surface}".`,
        },
        tokenIds: [left!.id, conj.id, right!.id],
        ops: [
          { op: 'addNode' as const, node: buildWordNode(conj, { role: 'coordinator' }) },
          { op: 'addNode' as const, node: buildWordNode(left!) },
          { op: 'addNode' as const, node: buildWordNode(right!) },
          {
            op: 'addRelation' as const,
            relation: {
              id: nextId('rel'),
              type: 'conjunct' as const,
              headId: wordNodeId(conj.id),
              dependentId: wordNodeId(left!.id),
              provenance: { source: 'inferred' as const, confidence: 'low' as const },
            },
          },
          {
            op: 'addRelation' as const,
            relation: {
              id: nextId('rel'),
              type: 'conjunct' as const,
              headId: wordNodeId(conj.id),
              dependentId: wordNodeId(right!.id),
              provenance: { source: 'inferred' as const, confidence: 'low' as const },
            },
          },
        ],
      }));
  },
};
