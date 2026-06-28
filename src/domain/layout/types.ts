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
  nodeId?: string;
  relationId?: string;
}

export type DiagramElement = LineElement | TextElement;

export interface DiagramLayout {
  width: number;
  height: number;
  elements: DiagramElement[];
}
