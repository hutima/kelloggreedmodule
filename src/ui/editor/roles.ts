import type { KrDocument, SyntacticRole } from '@/domain/schema';
import { getNode, nodeText } from '@/domain/model';

/**
 * Relationship-type metadata for the guided editors: short labels, plain-English
 * descriptions, contextual suggestions per head, and a plain-language preview.
 * Kept apart from the model so the wording can evolve without schema churn.
 */

export const ROLE_LABEL: Record<SyntacticRole, string> = {
  clause: 'clause',
  subject: 'subject',
  predicate: 'main verb',
  copula: 'linking verb',
  directObject: 'direct object',
  indirectObject: 'indirect object',
  predicateNominative: 'predicate nominative',
  predicateAdjective: 'predicate adjective',
  objectComplement: 'object complement',
  dativeComplement: 'dative complement',
  genitiveComplement: 'genitive complement',
  agent: 'agent',
  adjectival: 'adjectival modifier',
  adverbial: 'adverbial modifier',
  determiner: 'article / determiner',
  genitive: 'genitive modifier',
  apposition: 'apposition',
  prepositionalPhrase: 'prepositional phrase',
  prepositionObject: 'object of preposition',
  conjunction: 'conjunction',
  coordinator: 'coordinator',
  conjunct: 'coordinated element',
  particle: 'particle',
  vocative: 'vocative',
  interjection: 'interjection',
  adjunct: 'adjunct',
  unknown: 'unknown',
};

export const ROLE_DESC: Partial<Record<SyntacticRole, string>> = {
  subject: 'The doer or topic — what the clause is about.',
  predicate: 'The finite verb that carries the clause.',
  copula: 'A linking verb joining the subject to a complement.',
  directObject: 'Receives the action of the verb directly.',
  indirectObject: 'The recipient — to/for whom the action is done.',
  predicateNominative: 'A noun in the predicate that renames the subject.',
  predicateAdjective: 'An adjective in the predicate describing the subject.',
  objectComplement: 'Completes the meaning of the direct object.',
  dativeComplement: 'A dative argument completing the verb.',
  genitiveComplement: 'A genitive argument completing the verb.',
  agent: 'The doer of a passive verb (e.g. ὑπό + genitive).',
  adjectival: 'Modifies a noun like an adjective (incl. relative clauses).',
  adverbial: 'Modifies a verb/clause (manner, time, cause…).',
  determiner: 'An article or determiner marking a noun.',
  genitive: 'An adnominal genitive (possessive, descriptive…).',
  apposition: 'Renames or re-identifies another noun.',
  prepositionalPhrase: 'A preposition + its object modifying a head.',
  prepositionObject: 'The noun governed by a preposition.',
  conjunction: 'Joins words, phrases, or clauses.',
  coordinator: 'Coordinates two or more equal elements.',
  conjunct: 'One member of a coordinate structure.',
  particle: 'A discourse particle (δέ, γάρ, μέν, οὖν…).',
  vocative: 'Direct address.',
  interjection: 'An exclamation.',
  adjunct: 'A loosely attached optional modifier.',
};

/** Contextual chips (first row) suggested for a given head node. */
export function suggestRolesForHead(doc: KrDocument, headId: string): SyntacticRole[] {
  const head = getNode(doc.syntax, headId);
  if (!head) return ['adjunct'];
  if (head.kind === 'clause') {
    // Verb (predicate) must be reachable as a one-tap chip — a clause's nucleus is
    // assigned exactly like its subject/object, not buried behind Advanced.
    return ['subject', 'predicate', 'directObject', 'indirectObject', 'predicateNominative', 'adverbial'];
  }
  const tok = head.tokenIds.length ? doc.tokens.find((t) => t.id === head.tokenIds[0]) : undefined;
  const pos = tok?.pos;
  switch (pos) {
    case 'verb':
    case 'participle':
    case 'infinitive':
      return ['subject', 'directObject', 'indirectObject', 'predicateNominative', 'adverbial'];
    case 'noun':
    case 'propernoun':
    case 'pronoun':
      return ['adjectival', 'genitive', 'determiner', 'apposition', 'prepositionalPhrase'];
    case 'preposition':
      return ['prepositionObject'];
    case 'conjunction':
      return ['conjunct', 'coordinator'];
    case 'adjective':
      return ['adverbial', 'genitive'];
    default:
      return ['adjectival', 'adverbial', 'genitive', 'apposition', 'prepositionalPhrase'];
  }
}

/** The full role list (for the "More…" search), suggestions first. */
export function allRoles(): SyntacticRole[] {
  return Object.keys(ROLE_LABEL) as SyntacticRole[];
}

/** Plain-English preview, e.g. "λόγος functions as the subject of ἦν." */
export function relationPreview(
  doc: KrDocument,
  dependentId: string,
  headId: string,
  type: SyntacticRole,
): string {
  const dep = getNode(doc.syntax, dependentId);
  const head = getNode(doc.syntax, headId);
  const depName = dep ? nodeText(doc, dep) || dep.label || dep.kind : '(?)';
  const headName = head ? nodeText(doc, head) || head.label || head.kind : '(?)';
  return `${depName} functions as the ${ROLE_LABEL[type]} of ${headName}.`;
}
