/**
 * Text measurement. In the browser we could use the Canvas API, but a
 * dependency-free estimate keeps the layout engine pure and testable in Node
 * (Vitest) without a DOM. Greek polytonic glyphs and combining diacritics are
 * accounted for so labels don't overlap, and East Asian wide glyphs advance a
 * full em so CJK words don't under-measure.
 */

export interface FontMetrics {
  /** Average glyph advance as a fraction of font size. */
  avgCharRatio: number;
  fontSize: number;
}

export const BASE_FONT: FontMetrics = { avgCharRatio: 0.58, fontSize: 18 };
export const SMALL_FONT: FontMetrics = { avgCharRatio: 0.55, fontSize: 13 };

/** East Asian wide/fullwidth glyphs advance ~one em regardless of typeface. */
const WIDE_CHAR_RATIO = 1.0;

/** Zero-width code points (combining marks & joiners) add no advance, so an
 *  accented/pointed word doesn't over-measure. */
function isZeroWidth(code: number): boolean {
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
  // Arabic harakat and Koranic annotation marks stack on their base letter:
  // 064B–065F (fathatan…wavy hamza below), 0670 (superscript alef), 06D6–06DC,
  // 06DF–06E4, 06E7–06E8 and 06EA–06ED (all category Mn). End-of-ayah (06DD)
  // and the spacing small waw/yeh (06E5/06E6) do advance and are excluded.
  const combiningArabic =
    (code >= 0x064b && code <= 0x065f) ||
    code === 0x0670 ||
    (code >= 0x06d6 && code <= 0x06dc) ||
    (code >= 0x06df && code <= 0x06e4) ||
    code === 0x06e7 ||
    code === 0x06e8 ||
    (code >= 0x06ea && code <= 0x06ed);
  // ZWNJ / ZWJ shape their neighbours but have no advance of their own.
  const joiner = code === 0x200c || code === 0x200d;
  return combiningGreek || combiningHebrew || combiningArabic || joiner;
}

/** East Asian wide & fullwidth ranges — a cheap code-point check in the same
 *  style as the combining tables above (not a full UAX #11 implementation). */
function isWide(code: number): boolean {
  return (
    // CJK symbols & punctuation (3000–303F), Hiragana (3040–309F),
    // Katakana (30A0–30FF) — one contiguous run.
    (code >= 0x3000 && code <= 0x30ff) ||
    // CJK Unified Ideographs extension A.
    (code >= 0x3400 && code <= 0x4dbf) ||
    // CJK Unified Ideographs.
    (code >= 0x4e00 && code <= 0x9fff) ||
    // Hangul syllables.
    (code >= 0xac00 && code <= 0xd7a3) ||
    // Fullwidth forms (FF00–FF60) and fullwidth signs (FFE0–FFE6).
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

export function measureText(text: string, font: FontMetrics = BASE_FONT): number {
  // Advance in ems: zero for combining marks/joiners, ~1 for East Asian wide
  // glyphs, the font's average ratio for everything else.
  let em = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (isZeroWidth(code)) continue;
    em += isWide(code) ? WIDE_CHAR_RATIO : font.avgCharRatio;
  }
  return Math.max(em, font.avgCharRatio) * font.fontSize;
}
