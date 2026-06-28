/** Tunable geometry for the Kellogg-Reed renderer. All in SVG user units. */
export const LAYOUT = {
  margin: 28,
  /** Horizontal padding around a word sitting on the baseline. */
  wordPadX: 12,
  /** Gap between sibling blocks on the baseline. */
  baselineGap: 0,
  /** How far the subject|predicate divider rises above / drops below baseline. */
  dividerUp: 20,
  dividerDown: 20,
  /** Object separator: vertical tick standing on the baseline. */
  separatorUp: 22,
  /** Vertical drop from a head baseline to its modifiers' sub-baseline. */
  slantDrop: 34,
  /** Horizontal run of a modifier slant. */
  slantRun: 18,
  /** Horizontal run of a diagonal carrying a preposition / leaf modifier. */
  diagRun: 26,
  /** Gap between stacked dependents beneath a head. */
  dependentGap: 22,
  /** Extra room reserved below the clause for phrase/clause adjuncts. */
  adjunctDrop: 30,
  /**
   * Vertical stacking of clause-valued children (subordinate, complement,
   * coordinate clauses). Tall blocks stack down a shared vertical stem instead
   * of flowing horizontally, which keeps the diagram narrow and untangled.
   */
  /** Horizontal indent of a stacked clause from its vertical stem. */
  spineIndent: 26,
  /** Drop from the stem's top to the first stacked clause's baseline. */
  clauseFirstDrop: 24,
  /** Vertical gap between the bottom of one stacked clause and the next. */
  clauseStackGap: 34,
  fontSize: 18,
  smallFontSize: 13,
  /** Vertical offset of word text above its baseline. */
  textRise: 6,
} as const;
