import type { Token } from '@/domain/schema';
import { lexicon } from '../lexicon';
import type { InferenceRule } from '../types';
import { buildWordNode, wordNodeId } from './helpers';

/**
 * Attaches an article to the noun it determines. In Greek the article is
 * matched by case/gender/number AGREEMENT (the nearest agreeing nominal),
 * which is robust to free word order and to the article being separated from
 * its head. In English it falls back to the next nominal.
 */
function agrees(article: Token, noun: Token): boolean {
  const a = article.morphology;
  const n = noun.morphology;
  if (!a || !n) return false;
  const eq = (x?: string, y?: string) => !x || !y || x === y;
  return eq(a.case, n.case) && eq(a.gender, n.gender) && eq(a.number, n.number);
}

export const determinerRule: InferenceRule = {
  name: 'determiner',
  description: 'Attach articles/determiners to their noun (by agreement in Greek).',
  run: ({ doc, nextId }) => {
    const lex = lexicon(doc.language);
    const nominals = doc.tokens.filter(
      (t) => t.pos === 'noun' || t.pos === 'propernoun' || t.morphology?.case,
    );

    return doc.tokens
      .filter((t) => lex.isArticle(t.surface) || t.pos === 'article')
      .map((article) => {
        // Prefer an agreeing nominal; else the nearest nominal to the right.
        const agreeing = nominals.find((n) => agrees(article, n));
        const next = nominals
          .filter((n) => n.index > article.index)
          .sort((x, y) => x.index - y.index)[0];
        const head = agreeing ?? next;
        return { article, head };
      })
      .filter((x): x is { article: Token; head: Token } => Boolean(x.head))
      .map(({ article, head }) => ({
        id: nextId('inf'),
        title: `Determiner: ${article.surface} → ${head.surface}`,
        category: 'modifier' as const,
        provenance: {
          source: 'inferred' as const,
          confidence: 'medium' as const,
          reason:
            doc.language === 'grc'
              ? `Article "${article.surface}" agrees with "${head.surface}".`
              : `Article "${article.surface}" determines "${head.surface}".`,
        },
        tokenIds: [article.id, head.id],
        ops: [
          { op: 'addNode' as const, node: buildWordNode(head) },
          { op: 'addNode' as const, node: buildWordNode(article, { role: 'determiner' }) },
          {
            op: 'addRelation' as const,
            relation: {
              id: nextId('rel'),
              type: 'determiner' as const,
              headId: wordNodeId(head.id),
              dependentId: wordNodeId(article.id),
              provenance: { source: 'inferred' as const, confidence: 'medium' as const },
            },
          },
        ],
      }));
  },
};
