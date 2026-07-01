import type { Language, Token } from '@/domain/schema';
import { makeId } from './ids';

/**
 * Splits raw sentence text into surface tokens. Unicode-aware so polytonic
 * Greek (with combining diacritics) is preserved intact. Trailing punctuation
 * is kept attached to the word for now; the editor lets the user split/merge.
 *
 * This only establishes surface order — it makes no syntactic claims.
 */
export function tokenize(text: string, language?: Language): Token[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Split on whitespace; keep everything else (including combining marks).
  const pieces = trimmed.split(/\s+/u);
  return pieces.map((surface, index) => ({
    id: makeId('tok'),
    index,
    surface,
    language,
    provenance: { source: 'given' as const, confidence: 'high' as const },
  }));
}

/** Reassigns sequential indices after tokens are added/removed/reordered. */
export function reindex(tokens: Token[]): Token[] {
  return tokens.map((t, i) => ({ ...t, index: i }));
}

/**
 * Detect the language of a sentence from its DOMINANT script — Koine Greek,
 * Biblical Hebrew, or English (the default). Each language uses a disjoint
 * Unicode block, so this is unambiguous for whole-sentence input and lets the UI
 * skip an error-prone language dropdown (a stray Greek word in an English gloss,
 * or vice versa, can't flip the result because we count the majority script).
 */
export function detectLanguage(text: string): Language {
  let greek = 0;
  let hebrew = 0;
  let latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    // Greek and Coptic (0370–03FF) + Greek Extended / polytonic (1F00–1FFF).
    if ((c >= 0x0370 && c <= 0x03ff) || (c >= 0x1f00 && c <= 0x1fff)) greek++;
    // Hebrew block (0590–05FF).
    else if (c >= 0x0590 && c <= 0x05ff) hebrew++;
    // Basic Latin letters.
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
  }
  if (greek >= hebrew && greek > latin) return 'grc';
  if (hebrew > greek && hebrew > latin) return 'hbo';
  return 'en';
}

/**
 * Sentence punctuation the editions add editorially — periods, commas, colons,
 * the Greek ano teleia (·) and question mark (;), dashes, quotes, brackets. A
 * word-internal ELISION apostrophe (ἀλλ') is deliberately NOT stripped: it is
 * part of the word, not sentence punctuation. Used by the "infer punctuation"
 * export option so the model proposes its own breaks/attachments.
 */
const SENTENCE_PUNCT = /[.,:;!?·…—–‑―«»"“”„‟()[\]{}··;‐]/g;

/** Strip editorial sentence punctuation from `text`, collapsing whitespace. */
export function stripPunctuation(text: string): string {
  return text.replace(SENTENCE_PUNCT, ' ').replace(/\s+/g, ' ').trim();
}
