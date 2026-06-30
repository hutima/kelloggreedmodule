import type { SyntacticRole } from '@/domain/schema';

/**
 * Per-relation colours for the Dependency graph. Grouped into meaning families
 * (core arguments, complements, modifiers, prepositional, coordination …) so an
 * arc and its label chip share a hue and the reader can tell which label belongs
 * to which arc at a glance. The palette is chosen to stay distinguishable for
 * common colour-vision deficiencies; the label text is always shown too, so
 * colour is never the only cue.
 */
const REL_FAMILY: Record<string, string> = {
  core: '#1565c0', // blue — subject / nsubj
  object: '#c1440e', // rust — direct & indirect objects
  complement: '#00838f', // teal — predicate nom./adj., copula, agent
  modifier: '#2e7d32', // green — adjectival, adverbial, determiner, genitive, apposition
  prepositional: '#6a1b9a', // purple — prepositional phrase & its object, case
  coordination: '#9c6f1a', // amber — conjuncts, coordinator, conjunction, particle
  clause: '#5b6470', // slate — clause-level / catch-all
};

const ROLE_TO_FAMILY: Partial<Record<SyntacticRole, keyof typeof REL_FAMILY>> = {
  subject: 'core',
  predicate: 'clause',
  copula: 'complement',
  directObject: 'object',
  indirectObject: 'object',
  predicateNominative: 'complement',
  predicateAdjective: 'complement',
  objectComplement: 'object',
  dativeComplement: 'complement',
  genitiveComplement: 'complement',
  agent: 'complement',
  adjectival: 'modifier',
  adverbial: 'modifier',
  determiner: 'modifier',
  genitive: 'modifier',
  apposition: 'modifier',
  prepositionalPhrase: 'prepositional',
  prepositionObject: 'prepositional',
  conjunction: 'coordination',
  coordinator: 'coordination',
  conjunct: 'coordination',
  particle: 'coordination',
  vocative: 'clause',
  interjection: 'clause',
  adjunct: 'clause',
  clause: 'clause',
  unknown: 'clause',
};

/** Colour for a relation type, for the Dependency arc + its matching chip. */
export function relationColor(role: SyntacticRole): string {
  return REL_FAMILY[ROLE_TO_FAMILY[role] ?? 'clause']!;
}

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
  /** Coordination fork: vertical gap between stacked conjunct baselines. Wide
   * enough to give the coordinator (and / καί) clear room on its dashed line. */
  coordMemberGap: 28,
  /** Coordination fork: horizontal run of the prongs from the junction. */
  coordProngRun: 30,
  /**
   * A clause that fills a CORE slot (direct/indirect object, predicate
   * nominative, subject) is a noun clause: traditionally it rides a PEDESTAL
   * standing in that slot above the main line, not a stem below. Only compact
   * clauses are pedestalled; a very tall embedded clause (height beyond this)
   * would tower over everything, so it stays below on a dotted stem instead.
   */
  pedestalMaxHeight: 170,
  /** Pedestal foot (the little stand on the baseline): half-width and rise. */
  pedestalFootHalf: 13,
  pedestalFootRise: 16,
  /** Clearance between the pedestal foot and the embedded clause's lowest point. */
  pedestalGap: 12,
  /**
   * Minimum riser height from the foot apex up to the pedestal's baseline. A
   * pedestalled clause with little below-baseline content — e.g. a
   * predicate-nominative "ΚΥΡΙΟΣ ΙΗΣΟΥΣ ΧΡΙΣΤΟΣ", whose only depth is the
   * back-slant ABOVE its baseline — would otherwise sit right on top of the main
   * line, crushing the riser and its ὅτι/ἵνα connector. Keep the platform clearly
   * elevated regardless.
   */
  pedestalMinRiser: 44,
  fontSize: 18,
  smallFontSize: 13,
  /** Vertical offset of word text above its baseline. */
  textRise: 6,
} as const;
