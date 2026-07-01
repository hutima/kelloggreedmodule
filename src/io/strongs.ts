import { foldAccents } from '@/domain/model';

/**
 * Strong's lexicon — the WHOLE Greek (5,523) and Hebrew (8,674) dictionaries, so a
 * new word for a textual variant can be given a Strong's lemma without a book
 * being loaded. Derived from James Strong's Exhaustive Concordance (1890, public
 * domain) via the Open Scriptures machine-readable edition (CC BY-SA), the same
 * licence family as the OpenText / macula corpora already bundled here. The
 * compact form keeps only what the add-a-word search needs: lemma, transliteration,
 * a short gloss (from the Strong's definition) and the KJV renderings (for search).
 *
 * The JSON is fetched on demand (never precached — it's big and rarely needed) and
 * cached: by this module for the session, and by the service worker's runtime cache
 * for offline re-use.
 */

export interface StrongsEntry {
  /** Strong's number, no G/H prefix (e.g. "1401"). */
  strong: string;
  language: 'grc' | 'hbo';
  lemma: string;
  translit?: string;
  /** Short display gloss (first sense of the Strong's definition). */
  gloss?: string;
  /** KJV renderings — searched, not shown. */
  kjv?: string;
}

/** Raw compact entry as stored: {l:lemma, t:translit, g:gloss, k:kjv}. */
interface RawEntry {
  l: string;
  t?: string;
  g?: string;
  k?: string;
}

const cache = new Map<'grc' | 'hbo', StrongsEntry[]>();

function lexiconBase(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.replace(/\/$/, '')}/lexicon/`;
}

/** Load (and cache) the whole Greek or Hebrew Strong's lexicon. */
export async function loadStrongs(language: 'grc' | 'hbo'): Promise<StrongsEntry[]> {
  const hit = cache.get(language);
  if (hit) return hit;
  const file = language === 'hbo' ? 'strongs-hebrew.json' : 'strongs-greek.json';
  const res = await fetch(`${lexiconBase()}${file}`);
  if (!res.ok) {
    throw new Error(`Could not load the ${language === 'hbo' ? 'Hebrew' : 'Greek'} Strong's lexicon.`);
  }
  const raw = (await res.json()) as Record<string, RawEntry>;
  const entries: StrongsEntry[] = Object.entries(raw).map(([strong, v]) => ({
    strong,
    language,
    lemma: v.l,
    translit: v.t,
    gloss: v.g,
    kjv: v.k,
  }));
  cache.set(language, entries);
  return entries;
}

export const STRONGS_RESULT_CAP = 40;

/**
 * Search the lexicon by Strong's number, lemma, transliteration, or gloss / KJV
 * term. Pure and synchronous (an in-memory scan), ranked most-relevant first:
 * a number or an exact lemma/translit beats a prefix, which beats a gloss word,
 * which beats a KJV rendering. Accent/point-insensitive via `foldAccents`.
 */
export function searchStrongs(
  entries: StrongsEntry[],
  query: string,
  cap = STRONGS_RESULT_CAP,
): StrongsEntry[] {
  const q = query.trim();
  if (!q) return [];
  const digits = q.replace(/^[gh]/i, '');
  const numeric = /^\d+$/.test(digits);
  const needle = foldAccents(q);
  const scored: { e: StrongsEntry; s: number }[] = [];

  for (const e of entries) {
    let s = 0;
    if (numeric) {
      if (e.strong === digits) s = 100;
      else if (e.strong.startsWith(digits)) s = 60;
    } else {
      const lemma = foldAccents(e.lemma);
      const tr = e.translit ? foldAccents(e.translit) : '';
      const g = e.gloss ? foldAccents(e.gloss) : '';
      const k = e.kjv ? foldAccents(e.kjv) : '';
      if (lemma === needle || tr === needle) s = 100;
      else if (lemma.startsWith(needle) || tr.startsWith(needle)) s = 70;
      else if (g.includes(needle)) s = 50;
      else if (k.includes(needle)) s = 40;
      else if (lemma.includes(needle)) s = 20;
    }
    if (s > 0) scored.push({ e, s });
  }

  scored.sort(
    (a, b) => b.s - a.s || a.e.strong.length - b.e.strong.length || Number(a.e.strong) - Number(b.e.strong),
  );
  return scored.slice(0, cap).map((x) => x.e);
}
