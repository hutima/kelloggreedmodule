import type { KrDocument, SyntaxNode, Token } from '@/domain/schema';
import type { GrammarTone } from './types';

/**
 * Grammatical tint for a single token — finite verb and participle by part of
 * speech, otherwise by morphological case. This is the one source of the word
 * colours: the Morphology Clause mode pairs the tint with its morphology text,
 * and the structural modes (Kellogg-Reed, Phrase/Block) reuse it so a word
 * carries the SAME colour in every view. Tokens with no case and no verb/
 * participle form (articles, prepositions, conjunctions…) stay untinted.
 */
export function toneOf(tok: Token): GrammarTone | undefined {
  if (tok.pos === 'verb') return 'verb';
  if (tok.pos === 'participle') return 'participle';
  switch (tok.morphology?.case) {
    case 'nominative':
      return 'nominative';
    case 'accusative':
      return 'accusative';
    case 'genitive':
      return 'genitive';
    case 'dative':
      return 'dative';
    case 'vocative':
      return 'vocative';
    default:
      return undefined;
  }
}

/**
 * Tone for a syntax node's head word — its first token. Implied/elided nodes
 * carry no token, so they return `undefined` and render in the muted ink.
 */
export function toneOfNode(doc: KrDocument, node: SyntaxNode): GrammarTone | undefined {
  const tid = node.tokenIds[0];
  if (!tid) return undefined;
  const tok = doc.tokens.find((t) => t.id === tid);
  return tok ? toneOf(tok) : undefined;
}
