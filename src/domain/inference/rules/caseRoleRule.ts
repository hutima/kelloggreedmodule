import type { Token } from '@/domain/schema';
import { lexicon } from '../lexicon';
import type { Inference, InferenceRule, RuleContext } from '../types';
import { buildWordNode, prevToken, wordNodeId } from './helpers';

/**
 * Greek argument structure from morphological CASE — robust to free word order
 * because it never relies on position:
 *
 *   - ACCUSATIVE nominal  → direct object of the verb        (confident)
 *   - DATIVE nominal      → dative complement of the verb    (ambiguous)
 *   - GENITIVE nominal    → adnominal genitive of a noun      (ambiguous)
 *
 * The dative (indirect object? instrument? sphere?) and the genitive (whose
 * head? what relation?) are genuinely uncertain, so they are emitted at LOW
 * confidence. The layout flags low-confidence links as `tentative`, the canvas
 * draws them in the ambiguity colour, and the user can tap to relink them to
 * the right word. Accusative→object is reliable enough to mark confident.
 *
 * Tokens governed by a preposition are skipped — `prepositionRule` owns those.
 */
function findMainVerb(ctx: RuleContext): Token | undefined {
  const lex = lexicon(ctx.doc.language);
  return (
    ctx.doc.tokens.find((t) => t.pos === 'verb' || t.morphology?.mood === 'indicative') ??
    ctx.doc.tokens.find((t) => lex.isCopula(t.surface))
  );
}

function isNominal(t: Token): boolean {
  return t.pos === 'noun' || t.pos === 'propernoun' || t.pos === 'pronoun' || Boolean(t.morphology?.case);
}

export const caseRoleRule: InferenceRule = {
  name: 'case-roles',
  description: 'Assign object/complement/genitive roles from Greek case (free word order).',
  run: (ctx) => {
    const { doc, model, nextId } = ctx;
    if (doc.language !== 'grc') return [];
    const lex = lexicon(doc.language);
    const verb = findMainVerb(ctx);
    const out: Inference[] = [];

    const governedByPrep = (t: Token) => {
      const prev = prevToken(doc.tokens, t);
      return prev ? lex.isPreposition(prev.surface) || prev.pos === 'preposition' : false;
    };

    for (const t of doc.tokens) {
      const c = t.morphology?.case;
      if (!c || !isNominal(t) || lex.isArticle(t.surface)) continue;
      if (governedByPrep(t)) continue;

      if (c === 'accusative' && verb && t.id !== verb.id) {
        out.push(
          roleInference(ctx, nextId, t, verb, 'directObject', 'object', 'high',
            `Accusative "${t.surface}" is the direct object of "${verb.surface}".`),
        );
      } else if (c === 'dative' && verb && t.id !== verb.id) {
        out.push(
          roleInference(ctx, nextId, t, verb, 'dativeComplement', 'object', 'low',
            `Dative "${t.surface}" — likely a complement of "${verb.surface}", but the dative is ambiguous (indirect object, instrument, sphere…). Relink if needed.`),
        );
      } else if (c === 'genitive') {
        // Adnominal genitive: attach to the nearest other nominal as its head.
        const head = nearestNominalHead(doc.tokens, t);
        if (!head) continue;
        out.push(
          roleInference(ctx, nextId, t, head, 'genitive', 'modifier', 'low',
            `Genitive "${t.surface}" modifies "${head.surface}" — head and function (possessive, partitive…) are uncertain. Relink if needed.`),
        );
      }
    }

    void model;
    return out;
  },
};

function nearestNominalHead(tokens: Token[], gen: Token): Token | undefined {
  // Prefer the closest non-genitive nominal before the genitive; else after.
  const candidates = tokens.filter(
    (t) => t.id !== gen.id && (t.pos === 'noun' || t.pos === 'propernoun') && t.morphology?.case !== 'genitive',
  );
  const before = candidates.filter((t) => t.index < gen.index).sort((a, b) => b.index - a.index)[0];
  const after = candidates.filter((t) => t.index > gen.index).sort((a, b) => a.index - b.index)[0];
  return before ?? after;
}

function roleInference(
  _ctx: RuleContext,
  nextId: RuleContext['nextId'],
  dep: Token,
  head: Token,
  type: 'directObject' | 'dativeComplement' | 'genitive',
  category: Inference['category'],
  confidence: 'high' | 'low',
  reason: string,
): Inference {
  return {
    id: nextId('inf'),
    title: `${type}: ${head.surface} → ${dep.surface}`,
    category,
    provenance: { source: 'inferred', confidence, reason },
    tokenIds: [head.id, dep.id],
    ops: [
      { op: 'addNode', node: buildWordNode(head) },
      { op: 'addNode', node: buildWordNode(dep, { role: type }) },
      {
        op: 'addRelation',
        relation: {
          id: nextId('rel'),
          type,
          headId: wordNodeId(head.id),
          dependentId: wordNodeId(dep.id),
          provenance: { source: 'inferred', confidence, reason },
        },
      },
    ],
  };
}
