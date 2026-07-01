import type { KrDocument, Token } from '@/domain/schema';

/**
 * Fill an OpenText document's LEMMA-form tokens with the inflected SURFACE forms
 * from the parallel Nestle1904 passage. OpenText omits the inflected text (a
 * copyright restriction), so its tokens read in dictionary forms until aligned.
 *
 * Each OpenText token carries `morphology.extra.ref` (verse, e.g. "Phlm.1.1") and
 * `extra.wvi` (its 1-based position within that verse). Nestle1904 tokens carry
 * the same anchor as an osisId ("Phlm.1.1!1"). So the primary match is by
 * (verse, within-verse index), VALIDATED by lemma; a textual variant (OpenText is
 * over NA27, our base is Nestle1904) shifts a word or two, so on a lemma mismatch
 * we fall back to a lemma match elsewhere in the same verse. A word that aligns to
 * nothing keeps its lemma form, so the diagram is always complete.
 */

/** Accent/case-insensitive Greek key for comparing lemmas across editions. */
function bareLemma(s: string | undefined): string {
  return (s ?? '')
    // Drop a homograph disambiguator suffix — Nestle1904 spells distinct lexemes
    // that share a form as "δοῦλος (II)" / "ἄπειμι (I)", while OpenText's lemma is
    // bare ("δοῦλος"). Without this the lemma check fails and the word (e.g.
    // Phil 1:1 δοῦλοι) never aligns, so it stays stuck in its lemma form.
    .replace(/\s*\([^)]*\)\s*$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ᷀-᷿ͅ]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ');
}

/** verse ("Phlm.1.1") and within-verse index from a Nestle1904 osisId. */
function parseOsisId(ref: string | undefined): { verse: string; idx: number } | null {
  if (!ref) return null;
  const m = ref.match(/^(.*)!(\d+)$/);
  return m ? { verse: m[1]!, idx: Number(m[2]) } : { verse: ref, idx: 0 };
}

interface SurfaceIndex {
  byPos: Map<string, Token>; // "verse!idx" → token
  byVerse: Map<string, Token[]>; // verse → tokens (lemma fallback)
}

/** Index Nestle1904 tokens (from `lowfatToDocuments`) by verse + position. */
export function buildSurfaceIndex(nestleTokens: Token[]): SurfaceIndex {
  const byPos = new Map<string, Token>();
  const byVerse = new Map<string, Token[]>();
  for (const t of nestleTokens) {
    const loc = parseOsisId(t.morphology?.extra?.ref);
    if (!loc) continue;
    byPos.set(`${loc.verse}!${loc.idx}`, t);
    (byVerse.get(loc.verse) ?? byVerse.set(loc.verse, []).get(loc.verse)!).push(t);
  }
  return { byPos, byVerse };
}

export interface AlignResult {
  doc: KrDocument;
  aligned: number;
  total: number;
}

/**
 * Return a copy of `doc` with each token's `surface` (and the doc `text`) replaced
 * by the aligned Nestle1904 inflected form where one is found. Pure — `doc` is
 * unchanged. `aligned`/`total` report coverage.
 */
export function alignOpenTextSurface(doc: KrDocument, index: SurfaceIndex): AlignResult {
  const used = new Set<Token>();
  let aligned = 0;

  const tokens = doc.tokens.map((t) => {
    const ref = t.morphology?.extra?.ref;
    const wvi = Number(t.morphology?.extra?.wvi ?? 0);
    const lemKey = bareLemma(t.lemma ?? t.surface);
    let match: Token | undefined;

    const byPos = ref ? index.byPos.get(`${ref}!${wvi}`) : undefined;
    if (byPos && bareLemma(byPos.lemma) === lemKey) match = byPos;
    if (!match && ref) {
      // Lemma fallback within the verse (textual-variant drift): nearest unused
      // token with the same lemma.
      const candidates = (index.byVerse.get(ref) ?? []).filter(
        (c) => !used.has(c) && bareLemma(c.lemma) === lemKey,
      );
      match = candidates[0];
    }
    if (!match) return t;
    used.add(match);
    aligned++;
    // Take the inflected surface AND the English gloss from Nestle1904 — OpenText
    // ships no English gloss (only lemma + Louw-Nida), so without this the
    // English-gloss toggle has nothing to show and leaves the Greek in place.
    return { ...t, surface: match.surface, gloss: match.gloss ?? t.gloss };
  });

  const text = [...tokens].sort((a, b) => a.index - b.index).map((t) => t.surface).join(' ');
  return { doc: { ...doc, tokens, text }, aligned, total: doc.tokens.length };
}
