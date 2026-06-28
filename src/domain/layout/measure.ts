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

/** Counts code points, ignoring zero-width combining marks (Greek accents). */
function visibleLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    // Combining diacritical marks (incl. Greek extended) add no advance.
    const combining =
      (code >= 0x0300 && code <= 0x036f) || (code >= 0x1dc0 && code <= 0x1dff);
    if (!combining) n++;
  }
  return n;
}

export function measureText(text: string, font: FontMetrics = BASE_FONT): number {
  const len = visibleLength(text);
  return Math.max(len, 1) * font.fontSize * font.avgCharRatio;
}
