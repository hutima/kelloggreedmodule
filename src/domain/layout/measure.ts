/**
 * Text measurement. In the browser we could use the Canvas API, but a
 * dependency-free estimate keeps the layout engine pure and testable in Node
 * (Vitest) without a DOM. Greek polytonic glyphs and combining diacritics are
 * accounted for so labels don't overlap.
 */

export interface FontMetrics {
  /** Average glyph advance as a fraction of font size. */
  avgCharRatio: number;
  fontSize: number;
}

export const BASE_FONT: FontMetrics = { avgCharRatio: 0.58, fontSize: 18 };
export const SMALL_FONT: FontMetrics = { avgCharRatio: 0.55, fontSize: 13 };

/** Counts code points, ignoring zero-width combining marks (Greek accents,
 *  Hebrew points & cantillation) so an accented/pointed word doesn't over-measure. */
function visibleLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    // Combining diacritical marks (incl. Greek extended) add no advance.
    const combiningGreek =
      (code >= 0x0300 && code <= 0x036f) || (code >= 0x1dc0 && code <= 0x1dff);
    // Hebrew points (niqqud) and cantillation (te'amim) stack on their base
    // consonant: 0x0591–0x05BD plus the scattered points 0x05BF/05C1/05C2/05C4/
    // 05C5/05C7. The visible separators maqaf (05BE), paseq (05C0), sof pasuq
    // (05C3) and nun hafukha (05C6) are NOT combining and do advance.
    const combiningHebrew =
      (code >= 0x0591 && code <= 0x05bd) ||
      code === 0x05bf ||
      code === 0x05c1 ||
      code === 0x05c2 ||
      code === 0x05c4 ||
      code === 0x05c5 ||
      code === 0x05c7;
    if (!combiningGreek && !combiningHebrew) n++;
  }
  return n;
}

export function measureText(text: string, font: FontMetrics = BASE_FONT): number {
  const len = visibleLength(text);
  return Math.max(len, 1) * font.fontSize * font.avgCharRatio;
}
