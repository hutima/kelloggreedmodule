import { lexicon } from '../lexicon';
import type { InferenceRule } from '../types';
import { buildWordNode, nextToken, wordNodeId } from './helpers';

/**
 * Builds a prepositional phrase: preposition + its object. The PP is attached
 * beneath the main verb as an adverbial adjunct by default (the user can
 * re-attach it beneath a noun for an adjectival reading). The object is taken
 * as the next nominal in surface order — a heuristic the user can correct.
 */
export const prepositionRule: InferenceRule = {
  name: 'prepositional-phrase',
  description: 'Group prepositions with their object and attach the phrase beneath its head.',
  run: ({ doc, model, nextId }) => {
    const lex = lexicon(doc.language);
    return doc.tokens
      .filter((t) => lex.isPreposition(t.surface) || t.pos === 'preposition')
      .map((prep) => {
        const object =
          doc.tokens.find(
            (t) => t.index > prep.index && (t.pos === 'noun' || t.pos === 'propernoun' || t.morphology?.case),
          ) ?? nextToken(doc.tokens, prep);
        return { prep, object };
      })
      .filter((x) => Boolean(x.object))
      .map(({ prep, object }) => ({
        id: nextId('inf'),
        title: `Prepositional phrase: ${prep.surface} ${object!.surface}`,
        category: 'preposition' as const,
        provenance: {
          source: 'inferred' as const,
          confidence: 'medium' as const,
          reason: `Preposition "${prep.surface}" governs "${object!.surface}".`,
        },
        tokenIds: [prep.id, object!.id],
        ops: [
          { op: 'addNode' as const, node: buildWordNode(prep, { role: 'prepositionalPhrase' }) },
          { op: 'addNode' as const, node: buildWordNode(object!, { role: 'prepositionObject' }) },
          // PP attaches beneath the main verb (adverbial) by default.
          {
            op: 'addRelation' as const,
            relation: {
              id: nextId('rel'),
              type: 'prepositionalPhrase' as const,
              headId: model.rootId,
              dependentId: wordNodeId(prep.id),
              label: prep.surface,
              provenance: { source: 'inferred' as const, confidence: 'low' as const,
                reason: 'Default attachment beneath the predicate; re-attach for an adjectival reading.' },
            },
          },
          {
            op: 'addRelation' as const,
            relation: {
              id: nextId('rel'),
              type: 'prepositionObject' as const,
              headId: wordNodeId(prep.id),
              dependentId: wordNodeId(object!.id),
              provenance: { source: 'inferred' as const, confidence: 'medium' as const },
            },
          },
        ],
      }));
  },
};
