import type { Token } from '@/domain/schema';

/**
 * Romanization for the word-detail popover. Greek is transliterated
 * algorithmically (the Lowfat source carries none); Hebrew uses the academic
 * transliteration the macula-hebrew source already provides per word (kept in
 * `morphology.extra.translit`), since vowel-pointing it from scratch is lossy.
 */

const GREEK: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'ē', θ: 'th', ι: 'i',
  κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's',
  ς: 's', τ: 't', υ: 'y', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'ō',
};
const GREEK_VOWELS = new Set(['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω']);
const ROUGH = 0x0314; // combining rough breathing (dasia) → an "h"
const IOTA_SUBSCRIPT = 0x0345;

const isCombining = (code: number): boolean => code >= 0x0300 && code <= 0x036f;

interface Unit {
  base: string;
  lower: string;
  upper: boolean;
  rough: boolean;
  iotaSub: boolean;
}

/**
 * Transliterate polytonic Greek to Latin (a readable academic scheme): η→ē, ω→ō,
 * θ→th, χ→ch, φ→ph, ψ→ps, ξ→x; υ→y but u in the diphthongs αυ/ευ/ου/ηυ; γ→n
 * before γ/κ/ξ/χ; a rough breathing adds a leading h (ρ with one → rh); the iota
 * subscript is written on the line.
 */
export function transliterateGreek(input: string): string {
  // Decompose so breathings/accents/iota-subscript become inspectable marks.
  const chars = [...input.normalize('NFD')];
  const units: Unit[] = [];
  for (let i = 0; i < chars.length; i++) {
    const code = chars[i]!.codePointAt(0)!;
    if (isCombining(code)) continue; // attached to the preceding base below
    const base = chars[i]!;
    const lower = base.toLowerCase();
    const u: Unit = { base, lower, upper: base !== lower, rough: false, iotaSub: false };
    for (let j = i + 1; j < chars.length; j++) {
      const c = chars[j]!.codePointAt(0)!;
      if (!isCombining(c)) break;
      if (c === ROUGH) u.rough = true;
      if (c === IOTA_SUBSCRIPT) u.iotaSub = true;
    }
    units.push(u);
  }

  let out = '';
  units.forEach((u, idx) => {
    let m = GREEK[u.lower];
    if (m === undefined) {
      out += u.base; // spaces, punctuation, non-Greek pass through
      return;
    }
    if (u.lower === 'γ') {
      const next = units[idx + 1]?.lower;
      if (next && 'γκξχ'.includes(next)) m = 'n';
    } else if (u.lower === 'υ') {
      const prev = units[idx - 1]?.lower;
      if (prev && 'αεοη'.includes(prev)) m = 'u'; // diphthong: au/eu/ou/ēu
    } else if (u.lower === 'ρ' && u.rough) {
      m = 'rh';
    }
    if (u.iotaSub) m += 'i';
    out += m;
  });

  // A rough breathing on the first vowel (or the second vowel of an initial
  // diphthong) of a vowel-initial word is written as a leading h.
  const first = units.find((u) => GREEK[u.lower] !== undefined);
  if (first && GREEK_VOWELS.has(first.lower)) {
    const i0 = units.indexOf(first);
    const second = units[i0 + 1];
    if (first.rough || (second && GREEK_VOWELS.has(second.lower) && second.rough)) {
      out = `h${out}`;
    }
  }
  // Preserve a leading capital (proper nouns, sentence starts).
  if (units[0]?.upper && out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}

/** Romanization for a token: the source's own (Hebrew) or generated (Greek). */
export function transliterationOf(token: Token): string | undefined {
  const provided = token.morphology?.extra?.translit;
  if (provided) return provided;
  if (token.language === 'grc' && token.surface) return transliterateGreek(token.surface);
  return undefined;
}
