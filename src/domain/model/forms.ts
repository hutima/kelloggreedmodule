import type { Token } from '@/domain/schema';

/**
 * Word-FORM helpers for the Morphology view — a token's grammatical category
 * (for tinting) and its morphology broken into individually-glossable codes.
 *
 * Pure and presentation-free (returns data; the UI decides colour/layout). The
 * abbreviations intentionally match the glossary keys (`nom`, `aor`, `ptcp`,
 * `3`, `sg`…) so every code can be tapped for its meaning, and they mirror the
 * compact strings the SVG Morphology layout prints, so the two views read alike.
 */

const CASE_ABBR: Record<string, string> = {
  nominative: 'nom', genitive: 'gen', dative: 'dat', accusative: 'acc', vocative: 'voc',
};
const NUM_ABBR: Record<string, string> = { singular: 'sg', dual: 'du', plural: 'pl' };
const GEN_ABBR: Record<string, string> = { masculine: 'm', feminine: 'f', neuter: 'n', common: 'c', both: 'c' };
const TENSE_ABBR: Record<string, string> = {
  present: 'pres', imperfect: 'impf', future: 'fut', aorist: 'aor', perfect: 'pf', pluperfect: 'plpf', past: 'past',
};
const VOICE_ABBR: Record<string, string> = { active: 'act', middle: 'mid', passive: 'pass', middlepassive: 'm/p' };
const MOOD_ABBR: Record<string, string> = {
  indicative: 'ind', subjunctive: 'subj', optative: 'opt', imperative: 'impv', infinitive: 'inf', participle: 'ptcp',
};
const PERS_ABBR: Record<string, string> = { first: '1', second: '2', third: '3' };

/** A grammatical tone key (matches the renderer's TONE_COLORS) for tinting. */
export type ToneKey =
  | 'nominative' | 'accusative' | 'genitive' | 'dative' | 'vocative' | 'verb' | 'participle';

/** The category to tint a word by — finite verb, participle, or its case. */
export function grammarTone(tok: Token): ToneKey | undefined {
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

/** A single morphology code: its short text and an optional glossary key. */
export interface MorphCode {
  text: string;
  glossKey?: string;
}

const code = (text: string | undefined, glossKey?: string): MorphCode | undefined =>
  text ? { text, glossKey: glossKey ?? text } : undefined;

/**
 * A token's morphology as a list of individually-glossable codes, by part of
 * speech and language. Person and number stay separate (each glossable) rather
 * than fused ("3sg"), so a learner can tap either.
 */
export function morphCodes(tok: Token): MorphCode[] {
  const m = tok.morphology ?? {};
  const ex = m.extra ?? {};
  let out: (MorphCode | undefined)[];
  if (tok.language === 'hbo') {
    if (tok.pos === 'verb' || tok.pos === 'participle') {
      out = [code(ex.stem, undefined), code(ex.type, undefined), code(m.person && PERS_ABBR[m.person]), code(m.number && NUM_ABBR[m.number]), code(m.gender && GEN_ABBR[m.gender])];
    } else {
      out = [code(m.number && NUM_ABBR[m.number]), code(m.gender && GEN_ABBR[m.gender]), code(ex.state, undefined)];
    }
  } else if (tok.pos === 'verb') {
    out = [code(m.tense && TENSE_ABBR[m.tense]), code(m.voice && VOICE_ABBR[m.voice]), code(m.mood && MOOD_ABBR[m.mood]), code(m.person && PERS_ABBR[m.person]), code(m.number && NUM_ABBR[m.number])];
  } else if (tok.pos === 'participle') {
    out = [code(m.tense && TENSE_ABBR[m.tense]), code(m.voice && VOICE_ABBR[m.voice]), code('ptcp'), code(m.case && CASE_ABBR[m.case]), code(m.number && NUM_ABBR[m.number]), code(m.gender && GEN_ABBR[m.gender])];
  } else if (tok.pos === 'infinitive') {
    out = [code(m.tense && TENSE_ABBR[m.tense]), code(m.voice && VOICE_ABBR[m.voice]), code('inf')];
  } else {
    out = [code(m.case && CASE_ABBR[m.case]), code(m.number && NUM_ABBR[m.number]), code(m.gender && GEN_ABBR[m.gender])];
  }
  return out.filter((c): c is MorphCode => Boolean(c));
}
