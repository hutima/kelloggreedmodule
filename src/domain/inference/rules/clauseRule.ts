import type { Token } from '@/domain/schema';
import { lexicon } from '../lexicon';
import type { Inference, InferenceRule, RuleContext } from '../types';
import { buildWordNode, wordNodeId } from './helpers';

/**
 * Bootstraps the clause spine: main verb (predicate), its subject (explicit or
 * implied), and — for copular clauses — a predicate nominative/adjective.
 *
 * This is deliberately conservative and language-aware rather than order-bound:
 *   - the subject is found by NOMINATIVE case in Greek, not by position;
 *   - a missing subject yields an IMPLIED node (pro-drop / elided), never a
 *     forced reordering;
 *   - copular clauses are recognised so an omitted copula can still anchor a
 *     predicate nominative.
 */
function findMainVerb(ctx: RuleContext): Token | undefined {
  const lex = lexicon(ctx.doc.language);
  // Prefer an explicit finite verb; fall back to a lexical copula.
  const verby = ctx.doc.tokens.find(
    (t) => t.pos === 'verb' || t.morphology?.mood === 'indicative',
  );
  if (verby) return verby;
  return ctx.doc.tokens.find((t) => lex.isCopula(t.surface));
}

function isNominal(t: Token): boolean {
  return (
    t.pos === 'noun' ||
    t.pos === 'propernoun' ||
    t.pos === 'pronoun' ||
    t.morphology?.case === 'nominative'
  );
}

export const clauseRule: InferenceRule = {
  name: 'clause-spine',
  description: 'Identify predicate, subject (explicit or implied), and predicate complement.',
  run: (ctx) => {
    const { doc, model, nextId } = ctx;
    const lex = lexicon(doc.language);
    const out: Inference[] = [];
    const verb = findMainVerb(ctx);
    if (!verb) return out;

    const isCopula = lex.isCopula(verb.surface);

    // --- predicate ---
    out.push({
      id: nextId('inf'),
      title: `Predicate: ${verb.surface}`,
      category: 'predicate',
      provenance: {
        source: 'inferred',
        confidence: 'high',
        reason: isCopula
          ? `"${verb.surface}" is a copula/linking verb anchoring the predicate.`
          : `"${verb.surface}" is the main finite verb.`,
      },
      tokenIds: [verb.id],
      ops: [
        { op: 'addNode', node: buildWordNode(verb, { role: 'predicate' }) },
        {
          op: 'addRelation',
          relation: {
            id: nextId('rel'),
            type: 'predicate',
            headId: model.rootId,
            dependentId: wordNodeId(verb.id),
            provenance: { source: 'inferred', confidence: 'high' },
          },
        },
      ],
    });

    // --- subject: nominative nominal other than a predicate complement ---
    const nominatives = doc.tokens.filter(
      (t) => t.id !== verb.id && isNominal(t) && !lex.isArticle(t.surface),
    );
    const subjectTok = nominatives[0];

    if (subjectTok) {
      out.push({
        id: nextId('inf'),
        title: `Subject: ${subjectTok.surface}`,
        category: 'subject',
        provenance: {
          source: 'inferred',
          confidence: 'medium',
          reason:
            doc.language === 'grc'
              ? `Nominative nominal "${subjectTok.surface}" is the likely subject.`
              : `"${subjectTok.surface}" is the likely subject of "${verb.surface}".`,
        },
        tokenIds: [subjectTok.id],
        ops: [
          { op: 'addNode', node: buildWordNode(subjectTok, { role: 'subject' }) },
          {
            op: 'addRelation',
            relation: {
              id: nextId('rel'),
              type: 'subject',
              headId: model.rootId,
              dependentId: wordNodeId(subjectTok.id),
              provenance: { source: 'inferred', confidence: 'medium' },
            },
          },
        ],
      });
    } else {
      // implied subject (pro-drop / elided)
      const impliedId = `node_implied_subj_${verb.id}`;
      out.push({
        id: nextId('inf'),
        title: 'Implied subject',
        category: 'subject',
        provenance: {
          source: 'inferred',
          confidence: 'high',
          reason: 'Finite verb without an explicit nominative subject (implied/pro-drop).',
        },
        tokenIds: [verb.id],
        ops: [
          {
            op: 'addNode',
            node: {
              id: impliedId,
              kind: 'word',
              role: 'subject',
              tokenIds: [],
              implied: true,
              label: '(implied)',
              provenance: { source: 'inferred', confidence: 'high' },
            },
          },
          {
            op: 'addRelation',
            relation: {
              id: nextId('rel'),
              type: 'subject',
              headId: model.rootId,
              dependentId: impliedId,
              provenance: { source: 'inferred', confidence: 'high' },
            },
          },
        ],
      });
    }

    // --- predicate complement for copular clauses ---
    if (isCopula) {
      const complement = nominatives[1] ?? doc.tokens.find((t) => t.pos === 'adjective');
      if (complement) {
        const isAdj = complement.pos === 'adjective';
        out.push({
          id: nextId('inf'),
          title: `${isAdj ? 'Predicate adjective' : 'Predicate nominative'}: ${complement.surface}`,
          category: 'predicate',
          provenance: {
            source: 'inferred',
            confidence: 'medium',
            reason: `Copular clause links the subject to "${complement.surface}" (no English word-order assumption).`,
          },
          tokenIds: [complement.id],
          ops: [
            {
              op: 'addNode',
              node: buildWordNode(complement, {
                role: isAdj ? 'predicateAdjective' : 'predicateNominative',
              }),
            },
            {
              op: 'addRelation',
              relation: {
                id: nextId('rel'),
                type: isAdj ? 'predicateAdjective' : 'predicateNominative',
                headId: wordNodeId(verb.id),
                dependentId: wordNodeId(complement.id),
                provenance: { source: 'inferred', confidence: 'medium' },
              },
            },
          ],
        });
      }
    }

    return out;
  },
};
