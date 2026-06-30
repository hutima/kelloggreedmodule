import type { KrDocument, SyntaxNode, Token } from '@/domain/schema';
import type { GrammarTone } from './types';

/**
 * The grammatical category the renderer may tint for a token — finite verb or
 * participle by part of speech, otherwise by case. This is the SINGLE source of
 * truth for grammar colour, shared by the Morphology Clause mode and the optional
 * colour overlay on the Kellogg-Reed and Phrase/Block diagrams, so a word's hue
 * is identical across every view. Colour is always paired with on-screen text
 * (the word itself), so it is never the only signal.
 */
export function tokenTone(tok: Token | undefined): GrammarTone | undefined {
  if (!tok) return undefined;
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
 * The tone for a whole syntax node, taken from its first token (a multi-token
 * node such as "Χριστοῦ Ἰησοῦ" shares one case, so the head token represents it).
 * Implied / elided nodes carry no token and so have no tone (they stay muted).
 */
export function nodeTone(doc: KrDocument, node: SyntaxNode): GrammarTone | undefined {
  const tid = node.tokenIds[0];
  if (!tid) return undefined;
  return tokenTone(doc.tokens.find((t) => t.id === tid));
}

/** A nodeId → tone map for every token-bearing node (for the HTML Phrase/Block view). */
export function toneByNode(doc: KrDocument): Map<string, GrammarTone> {
  const map = new Map<string, GrammarTone>();
  for (const node of doc.syntax.nodes) {
    const tone = nodeTone(doc, node);
    if (tone) map.set(node.id, tone);
  }
  return map;
}
