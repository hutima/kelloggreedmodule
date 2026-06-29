/**
 * LAYOUT PRIMITIVES — the contract between the layout engine and the renderer.
 *
 * The layout engine emits a flat list of geometric primitives. The renderer is
 * "dumb": it only maps primitives to SVG. Crucially, the renderer never sees
 * tokens, surface order, or the syntax graph — so it cannot accidentally let
 * linear word order leak into the picture. All structure is decided here.
 */

export type LineStyle = 'solid' | 'dashed' | 'dotted';

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
   * Clockwise rotation in degrees about (x, y). Used to write a word ALONG a
   * diagonal connector — the traditional Kellogg-Reed treatment of
   * prepositions and single-word modifiers.
   */
  rotate?: number;
  nodeId?: string;
  relationId?: string;
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
}

export type DiagramElement = LineElement | TextElement | CurveElement;

export interface DiagramLayout {
  width: number;
  height: number;
  elements: DiagramElement[];
}
