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
