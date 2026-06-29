/**
 * Visual theme shared by the on-screen renderer and the SVG/PNG exporters, so
 * exports look identical to the canvas. Kept framework-free.
 */
export const THEME = {
  ink: '#1f2933',
  muted: '#8a97a3',
  accent: '#2f6f9f',
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
