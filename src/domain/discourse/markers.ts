import type {
  DiscourseMarker,
  DiscourseToken,
  MarkerFunction,
  Provenance,
} from '@/domain/schema';

/**
 * GREEK DISCOURSE-MARKER HINT LEXICON.
 *
 * Particles and conjunctions are CLUES about discourse structure, not a
 * magisterium: γάρ often introduces grounds, οὖν often marks an inference —
 * but "often" is the strongest claim this table is allowed to make. Every
 * entry therefore records a HINT function and a (deliberately modest)
 * confidence, and everything downstream must present it as "possible".
 *
 * The lexicon is keyed by NFC-normalized lemma as MACULA/SBLGNT spell it.
 */
export interface MarkerHint {
  fn: MarkerFunction;
  confidence: 'medium' | 'low';
  /** Short human explanation, reused by chips / suggestions. */
  note: string;
}

export const GREEK_MARKER_HINTS: Record<string, MarkerHint> = {
  γάρ: { fn: 'causal', confidence: 'medium', note: 'γάρ often introduces a ground or explanation' },
  οὖν: { fn: 'inferential', confidence: 'medium', note: 'οὖν often marks an inference, result, or transition' },
  διό: { fn: 'inferential', confidence: 'medium', note: 'διό often marks an inference or result' },
  ἄρα: { fn: 'inferential', confidence: 'medium', note: 'ἄρα often marks an inference' },
  ἀλλά: { fn: 'contrastive', confidence: 'medium', note: 'ἀλλά often marks a contrast' },
  πλήν: { fn: 'contrastive', confidence: 'medium', note: 'πλήν often marks a contrast or exception' },
  δέ: { fn: 'development', confidence: 'low', note: 'δέ can mark development, contrast, or a transition — usually low signal' },
  καί: { fn: 'additive', confidence: 'low', note: 'καί can mark addition or a series — very common, low signal' },
  ἵνα: { fn: 'purpose', confidence: 'medium', note: 'ἵνα often introduces purpose (sometimes result), depending on context' },
  ὅπως: { fn: 'purpose', confidence: 'medium', note: 'ὅπως often introduces purpose' },
  ὅτι: { fn: 'content', confidence: 'low', note: 'ὅτι can introduce content or a ground, depending on context' },
  εἰ: { fn: 'conditional', confidence: 'medium', note: 'εἰ often introduces a condition' },
  ἐάν: { fn: 'conditional', confidence: 'medium', note: 'ἐάν often introduces a condition' },
  μέν: { fn: 'development', confidence: 'low', note: 'μέν often pairs with a following δέ (balanced contrast or development)' },
  ὥστε: { fn: 'resultative', confidence: 'medium', note: 'ὥστε often introduces a result' },
  τότε: { fn: 'temporal', confidence: 'low', note: 'τότε can mark a temporal transition' },
  νῦν: { fn: 'temporal', confidence: 'low', note: 'νῦν can mark a temporal or logical "now"' },
};

/** Parts of speech a discourse marker can be. */
const MARKER_POS = new Set(['conjunction', 'particle', 'adverb']);

const nfc = (s: string) => s.normalize('NFC');

/** The hint entry for a token, if it is a discourse-relevant marker. */
export function markerHintFor(token: {
  lemma?: string;
  pos?: string;
}): MarkerHint | undefined {
  if (!token.lemma || !token.pos || !MARKER_POS.has(token.pos)) return undefined;
  return GREEK_MARKER_HINTS[nfc(token.lemma)];
}

/**
 * Scan the range's tokens for discourse-relevant particles/conjunctions and
 * produce marker records. `scopeOf` supplies the unit each token belongs to
 * (so a chip renders inside its unit). Pure; ids derive from the (stable)
 * source token ids so markers survive reloads.
 */
export function detectDiscourseMarkers(
  tokens: DiscourseToken[],
  scopeOf: (tokenId: string) => string | undefined,
): DiscourseMarker[] {
  const out: DiscourseMarker[] = [];
  for (const t of tokens) {
    const hint = markerHintFor(t);
    if (!hint) continue;
    const provenance: Provenance = {
      source: 'inferred',
      confidence: hint.confidence,
      reason: hint.note,
    };
    out.push({
      id: `dm_${t.id}`,
      tokenId: t.id,
      surface: t.surface,
      lemma: t.lemma ? nfc(t.lemma) : undefined,
      pos: t.pos,
      ref: t.ref,
      suggestedFunction: hint.fn,
      scopeUnitId: scopeOf(t.id),
      provenance,
    });
  }
  return out;
}
