/**
 * Visual theme shared by the on-screen renderer and the SVG/PNG exporters, so
 * exports look identical to the canvas. Kept framework-free.
 */
export const THEME = {
  ink: '#1f2933',
  muted: '#8a97a3',
  accent: '#b90e31',
  /** Low-confidence (ambiguous) inferences — invites the user to relink. */
  tentative: '#c2410c',
  paper: '#ffffff',
  strokeWidth: 1.6,
  /**
   * Unicode-capable font stack for BOTH polytonic Greek and pointed Hebrew. The
   * browser picks the first listed face that has each glyph, so Greek/Latin
   * resolve to Gentium Plus while Hebrew falls through to the dedicated Hebrew
   * faces (SBL Hebrew, Ezra SIL, Taamey Frank CLM) — Cardo, late in the list,
   * is a capable both-scripts fallback.
   */
  fontFamily:
    "'Gentium Plus', 'SBL Hebrew', 'Ezra SIL', 'Taamey Frank CLM', 'Cardo', 'New Athena Unicode', 'GFS Didot', 'Palatino Linotype', 'Times New Roman', 'DejaVu Serif', serif",
  fontSize: 18,
  smallFontSize: 13,
} as const;

export function dashFor(style: 'solid' | 'dashed' | 'dotted'): string | undefined {
  if (style === 'dashed') return '7 5';
  if (style === 'dotted') return '2 4';
  return undefined;
}

/**
 * Colours for the Morphology Clause mode's grammatical categories. Chosen to be
 * reasonably distinguishable (incl. for common colour-vision deficiencies); the
 * mode always shows the morphology text too, so colour is never the only cue.
 */
export const TONE_COLORS: Record<string, string> = {
  nominative: '#1565c0', // blue — subjects / predicate nominatives
  accusative: '#c1440e', // rust — objects
  genitive: '#2e7d32', // green
  dative: '#6a1b9a', // purple
  vocative: '#00838f', // teal
  verb: '#b71c1c', // crimson — finite verbs
  participle: '#8d6e00', // olive
};

export function toneColor(tone: string | undefined): string | undefined {
  return tone ? TONE_COLORS[tone] : undefined;
}
