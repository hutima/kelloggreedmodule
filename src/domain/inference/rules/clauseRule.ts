import type { Token } from '@/domain/schema';
import { impliedSubjectPronoun } from '@/domain/model';
import { lexicon } from '../lexicon';
import type { Inference, InferenceRule, RuleContext } from '../types';
import { IMPLIED_COPULA_ID, buildWordNode, impliedCopulaNode, wordNodeId } from './helpers';

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

/**
 * Could `t` be a subject / predicate nominative? In Greek that is decided by
 * CASE — a nominative nominal — so an oblique pronoun like dative ὑμῖν is never
 * mistaken for the subject. English has no case, so fall back to part of speech.
 */
function isSubjectCandidate(t: Token, language: string): boolean {
  if (language === 'grc') {
    return t.morphology?.case === 'nominative';
  }
  return t.pos === 'noun' || t.pos === 'propernoun' || t.pos === 'pronoun';
}

export const clauseRule: InferenceRule = {
  name: 'clause-spine',
  description: 'Identify predicate, subject (explicit or implied), and predicate complement.',
  run: (ctx) => {
    const { doc, model, nextId } = ctx;
    const lex = lexicon(doc.language);
    const out: Inference[] = [];
    const verb = findMainVerb(ctx);

    // --- subject: nominative nominal other than a predicate complement ---
    const nominatives = doc.tokens.filter(
      (t) =>
        (!verb || t.id !== verb.id) &&
        isSubjectCandidate(t, doc.language) &&
        !lex.isArticle(t.surface),
    );
    const subjectTok = nominatives[0];

    // A verbless clause with no nominative gives us nothing to anchor on.
    if (!verb && !subjectTok) return out;

    // An explicit verb is copular when it is a copula; an implied predicate is
    // copular by definition (it only ever stands in for "to be").
    const isCopula = verb ? lex.isCopula(verb.surface) : true;

    // --- predicate: an explicit verb, or a synthesized copula when a nominal
    //     clause has a subject but no verb (Greek "χάρις … ὑμῖν", imperatives) ---
    if (verb) {
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
    } else {
      out.push({
        id: nextId('inf'),
        title: 'Implied copula',
        category: 'predicate',
        provenance: {
          source: 'inferred',
          confidence: 'medium',
          reason: `Nominal clause with the nominative "${subjectTok!.surface}" but no verb — an implied copula links subject and complement.`,
        },
        tokenIds: [],
        ops: [
          { op: 'addNode', node: impliedCopulaNode(doc.language) },
          {
            op: 'addRelation',
            relation: {
              id: nextId('rel'),
              type: 'predicate',
              headId: model.rootId,
              dependentId: IMPLIED_COPULA_ID,
              provenance: { source: 'inferred', confidence: 'medium' },
            },
          },
        ],
      });
    }

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
              : `"${subjectTok.surface}" is the likely subject${verb ? ` of "${verb.surface}"` : ''}.`,
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
    } else if (verb) {
      // implied subject (pro-drop / elided) — only meaningful with a real verb.
      // A first/second-person verb names its own subject, so impute the pronoun
      // (σπένδομαι → "(ἐγώ)", an imperative → "(you)"); third person can't be
      // named from morphology alone, so it stays a generic "(implied)" filler.
      const impliedId = `node_implied_subj_${verb.id}`;
      const pronoun = impliedSubjectPronoun(verb.morphology, doc.language);
      out.push({
        id: nextId('inf'),
        title: pronoun ? `Implied subject (${pronoun})` : 'Implied subject',
        category: 'subject',
        provenance: {
          source: 'inferred',
          confidence: 'high',
          reason: pronoun
            ? `Finite ${verb.morphology?.person}-person verb without an explicit subject — pro-drop "${pronoun}".`
            : 'Finite verb without an explicit nominative subject (implied/pro-drop).',
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
              label: pronoun ? `(${pronoun})` : '(implied)',
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

    // --- predicate complement for copular clauses with an explicit verb ---
    // (A verbless clause's second nominative is usually a COORDINATED subject —
    // "χάρις καὶ εἰρήνη" — not a predicate nominative, so we don't guess one
    // there; caseRoleRule supplies any dative/accusative complement instead.)
    if (isCopula && verb) {
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
