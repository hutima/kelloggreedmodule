import type { KrDocument, Morphology, SyntacticRole } from '@/domain/schema';
import { getNode, nodeText, parentRelations, tidyGloss } from './queries';
import { transliterationOf } from './transliterate';

/**
 * Plain-language account of a word's job in the sentence, for the
 * "tap a word to reveal its function" affordance. Pure and presentation-free
 * (returns strings; the UI decides layout).
 */
export interface FunctionSummary {
  /** The word (or its label, for implied elements). */
  word: string;
  /** Short role headline, e.g. "Direct object". */
  role: string;
  /** Fuller sentence, e.g. "Direct object of “knows”." */
  detail: string;
  /** Morphology / part of speech, e.g. "noun · genitive singular masculine". */
  grammar?: string;
  /** Gloss, if the token carries one. */
  gloss?: string;
  /** Romanized pronunciation (Greek generated, Hebrew from the source). */
  translit?: string;
}

const ROLE_PHRASES: Partial<Record<SyntacticRole, { role: string; withHead: (h: string) => string }>> = {
  subject: { role: 'Subject', withHead: () => 'Subject of the clause.' },
  predicate: { role: 'Predicate', withHead: () => 'Predicate — the main verb of the clause.' },
  copula: { role: 'Linking verb', withHead: (h) => `Linking verb joining the subject to “${h}”.` },
  directObject: { role: 'Direct object', withHead: (h) => `Direct object of “${h}”.` },
  indirectObject: { role: 'Indirect object', withHead: (h) => `Indirect object of “${h}”.` },
  predicateNominative: { role: 'Predicate nominative', withHead: () => 'Predicate nominative — renames the subject.' },
  predicateAdjective: { role: 'Predicate adjective', withHead: () => 'Predicate adjective — describes the subject.' },
  objectComplement: { role: 'Object complement', withHead: (h) => `Completes the object of “${h}”.` },
  dativeComplement: { role: 'Dative complement', withHead: (h) => `Dative complement of “${h}”.` },
  genitiveComplement: { role: 'Genitive complement', withHead: (h) => `Genitive complement of “${h}”.` },
  agent: { role: 'Agent', withHead: (h) => `Agent of the passive “${h}”.` },
  adjectival: { role: 'Adjectival modifier', withHead: (h) => `Adjectival modifier of “${h}”.` },
  adverbial: { role: 'Adverbial modifier', withHead: (h) => `Adverbial modifier of “${h}”.` },
  determiner: { role: 'Determiner', withHead: (h) => `Article/determiner of “${h}”.` },
  genitive: { role: 'Genitive modifier', withHead: (h) => `Genitive modifier of “${h}”.` },
  apposition: { role: 'Apposition', withHead: (h) => `In apposition to “${h}” (renames it).` },
  prepositionalPhrase: { role: 'Prepositional phrase', withHead: (h) => `Prepositional phrase modifying “${h}”.` },
  prepositionObject: { role: 'Object of preposition', withHead: (h) => `Object of the preposition “${h}”.` },
  conjunction: { role: 'Conjunction', withHead: (h) => `Conjunction introducing “${h}”.` },
  coordinator: { role: 'Coordinator', withHead: () => 'Coordinator joining the conjuncts.' },
  conjunct: { role: 'Coordinated element', withHead: (h) => `Coordinated with “${h}”.` },
  particle: { role: 'Particle', withHead: () => 'Discourse particle.' },
  vocative: { role: 'Vocative', withHead: () => 'Vocative — direct address.' },
  interjection: { role: 'Interjection', withHead: () => 'Interjection.' },
  adjunct: { role: 'Adjunct', withHead: (h) => `Adjunct attached to “${h}”.` },
  clause: { role: 'Clause', withHead: () => 'A clause.' },
  unknown: { role: 'Unknown', withHead: () => 'Relationship not yet analysed.' },
};

const MORPH_ORDER: (keyof Morphology)[] = ['tense', 'voice', 'mood', 'case', 'gender', 'number', 'person', 'degree'];

function grammarString(doc: KrDocument, nodeId: string): string | undefined {
  const node = getNode(doc.syntax, nodeId);
  if (!node) return undefined;
  const tok = node.tokenIds.length ? doc.tokens.find((t) => t.id === node.tokenIds[0]) : undefined;
  if (!tok) return undefined;
  const m = tok.morphology ?? {};
  const feats = MORPH_ORDER.map((k) => m[k]).filter(Boolean) as string[];
  const parts = [tok.pos, feats.join(' ')].filter((s) => s && s.length);
  return parts.length ? parts.join(' · ') : undefined;
}

export function describeFunction(doc: KrDocument, nodeId: string): FunctionSummary | undefined {
  const node = getNode(doc.syntax, nodeId);
  if (!node) return undefined;
  const word = nodeText(doc, node) || node.label || '(implied)';

  // How does this node attach upward?
  const up = parentRelations(doc.syntax, nodeId)[0];
  let role = node.kind === 'clause' ? 'Clause' : 'Word';
  let detail = node.kind === 'clause' ? 'A clause.' : 'Not yet attached to the sentence.';
  if (up) {
    const phrase = ROLE_PHRASES[up.type];
    const head = getNode(doc.syntax, up.headId);
    const headText = head ? nodeText(doc, head) || head.label || head.kind : '';
    if (phrase) {
      role = phrase.role;
      detail = up.label ? `${phrase.withHead(headText)} (${up.label})` : phrase.withHead(headText);
    } else {
      role = up.type;
      detail = `${up.type} of “${headText}”.`;
    }
  } else if (node.kind !== 'clause') {
    // No upward relation of its own, but the word may be a CONNECTOR / subordinator
    // whose text the parse carries as a relation's LABEL rather than a drawn node —
    // e.g. ἐάν on a conditional clause. Describe that job instead of calling it
    // unattached (which would be misleading).
    const labels = doc.syntax.relations.find((r) => r.labelNodeId === nodeId);
    if (labels) {
      const pos = node.tokenIds.length ? doc.tokens.find((t) => t.id === node.tokenIds[0])?.pos : undefined;
      role = pos === 'particle' ? 'Particle' : pos === 'conjunction' ? 'Conjunction' : 'Connective';
      const clause = ROLE_PHRASES[labels.type]?.role.toLowerCase() ?? String(labels.type);
      detail = `Connecting word — introduces the ${clause} clause.`;
    }
  }
  if (node.implied) detail = `Implied / elided. ${detail}`;

  const tok = node.tokenIds.length ? doc.tokens.find((t) => t.id === node.tokenIds[0]) : undefined;
  return {
    word,
    role,
    detail,
    grammar: grammarString(doc, nodeId),
    gloss: tok?.gloss ? tidyGloss(tok.gloss) : undefined,
    translit: tok ? transliterationOf(tok) : undefined,
  };
}
