/**
 * LAYOUT PRIMITIVES — the contract between the layout engine and the renderer.
 *
 * The layout engine emits a flat list of geometric primitives. The renderer is
 * "dumb": it only maps primitives to SVG. Crucially, the renderer never sees
 * tokens, surface order, or the syntax graph — so it cannot accidentally let
 * linear word order leak into the picture. All structure is decided here.
 */

export type LineStyle = 'solid' | 'dashed' | 'dotted';

/** Grammatical categories the renderer can tint (Morphology Clause mode). */
export type GrammarTone =
  | 'nominative'
  | 'accusative'
  | 'genitive'
  | 'dative'
  | 'vocative'
  | 'verb'
  | 'participle';

/** Semantic tag, so the renderer / CSS can theme line kinds distinctly. */
export type ElementRole =
  | 'baseline'
  | 'divider' // subject|predicate
  | 'separator' // object / complement separator
  | 'slant' // modifier slant
  | 'connector' // attaches a phrase/clause to its head
  | 'coordination'
  | 'stem'; // vertical drop to a sub-structure

export interface LineElement {
  kind: 'line';
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: LineStyle;
  role: ElementRole;
  /** Originating syntax node/relation id for hit-testing & selection. */
  nodeId?: string;
  relationId?: string;
  /** A low-confidence (ambiguous) inference — rendered in a distinct colour. */
  tentative?: boolean;
  /**
   * Explicit stroke colour (e.g. the Dependency mode's per-relation hue). When
   * set it overrides the default ink — colour is decided by the layout so the
   * renderer stays dumb and exports match the canvas exactly.
   */
  color?: string;
}

export interface TextElement {
  kind: 'text';
  id: string;
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
  /** Modifiers / labels are italic by convention. */
  italic?: boolean;
  /** Smaller text for connector labels (prepositions, conjunctions). */
  small?: boolean;
  muted?: boolean; // implied/elided elements
  /** A low-confidence (ambiguous) inference — rendered in a distinct colour. */
  tentative?: boolean;
  /**
   * A grammatical category the renderer may tint (case, finite verb, participle…)
   * — used by the Morphology Clause mode to highlight forms. Always paired with
   * the on-screen morphology text, so colour is never the only signal.
   */
  tone?: GrammarTone;
  /**
   * Clockwise rotation in degrees about (x, y). Used to write a word ALONG a
   * diagonal connector — the traditional Kellogg-Reed treatment of
   * prepositions and single-word modifiers.
   */
  rotate?: number;
  nodeId?: string;
  relationId?: string;
  /**
   * Explicit fill colour (e.g. a Dependency-mode relation label matching its
   * arc). Overrides tone/muted/ink so the layer that knows the meaning picks the
   * colour and the renderer just draws it.
   */
  color?: string;
  /**
   * Draw the text inside a small rounded "chip" (white fill, coloured border &
   * text), the way labelled dependency arcs read in a Universal-Dependencies
   * graph. The chip is sized to the measured text.
   */
  box?: boolean;
  /**
   * A glossary key. When present the label is interactive: tapping it opens the
   * shared detail panel explaining the abbreviation (e.g. `agr` → agreement).
   * See {@link file://./../model/glossary.ts}.
   */
  glossKey?: string;
}

/**
 * A quadratic Bézier curve (start → control → end). Used by the alternate
 * diagram modes — dependency arcs over the token row, discourse-flow connectors —
 * where a straight `LineElement` would read as crossings. The Kellogg-Reed layout
 * never emits these.
 */
export interface CurveElement {
  kind: 'curve';
  id: string;
  x1: number;
  y1: number;
  /** Control point. */
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  style: LineStyle;
  role: ElementRole;
  /** Draw a small arrowhead at the end point. */
  arrow?: boolean;
  nodeId?: string;
  relationId?: string;
  tentative?: boolean;
  /** Explicit stroke colour — see {@link LineElement.color}. */
  color?: string;
}

export type DiagramElement = LineElement | TextElement | CurveElement;

export interface DiagramLayout {
  width: number;
  height: number;
  elements: DiagramElement[];
}
