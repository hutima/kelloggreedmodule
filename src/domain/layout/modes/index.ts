import type { KrDocument, LayoutHints } from '@/domain/schema';
import type { DiagramLayout } from '../types';
import { layoutDocument, type LayoutOptions } from '../engine';
import { layoutDependency } from './dependency';
import { layoutDependencyTree } from './dependency-tree';
import { layoutPhraseBlock } from './phrase-block';
import { layoutMorphology } from './morphology';

/**
 * Alternate diagram modes. Every mode is a function (doc, hints, options) →
 * DiagramLayout producing the SAME primitives the renderer already draws, so the
 * canvas, export, pan/zoom and hover popover are shared. Kellogg-Reed is the
 * existing engine and the default.
 */
export type DiagramMode =
  | 'kellogg-reed'
  | 'phrase-block'
  | 'dependency'
  | 'dependency-tree'
  | 'morphology';

export interface DiagramModeInfo {
  id: DiagramMode;
  label: string;
  /** One-line description for the tooltip / caption. */
  description: string;
}

/** Selector order; Kellogg-Reed first (the default). */
export const DIAGRAM_MODES: DiagramModeInfo[] = [
  { id: 'kellogg-reed', label: 'Kellogg-Reed', description: 'Traditional function diagram' },
  { id: 'phrase-block', label: 'Phrase / Block', description: 'Clause hierarchy' },
  { id: 'dependency', label: 'Dependency', description: 'Head-dependent word relationships' },
  { id: 'dependency-tree', label: 'Dependency Tree', description: 'Top-down head-dependent tree (Perseus style)' },
  { id: 'morphology', label: 'Morphology Clause', description: 'Greek forms and agreement' },
];

/**
 * Default visualization on first load (mobile AND desktop): Phrase/Block — the
 * most finger-friendly, sermon-useful structural lens. The selector still lists
 * Kellogg-Reed first; this only sets which mode is shown initially.
 */
export const DEFAULT_MODE: DiagramMode = 'phrase-block';

/**
 * The visualizations that support EDITING. Only the two pedagogically familiar,
 * finger-friendly structural lenses are editable: Kellogg-Reed and Phrase/Block.
 * Dependency, Dependency Tree and Morphology are presentation-only — their direct
 * graph manipulation is not user-friendly, so Edit mode falls back to one of these
 * two. Because every mode is a lens over the ONE shared syntax graph, edits made
 * here still flow through to Explore/Study in every visualization.
 */
export const EDITABLE_MODES: DiagramMode[] = ['kellogg-reed', 'phrase-block'];

/** The editable mode to fall back to when Edit mode opens on a read-only one. */
export const DEFAULT_EDIT_MODE: DiagramMode = 'phrase-block';

/** Whether a visualization can be edited (the others are presentation-only). */
export function isEditableMode(mode: DiagramMode): boolean {
  return EDITABLE_MODES.includes(mode);
}

export function layoutForMode(
  mode: DiagramMode,
  doc: KrDocument,
  hints: LayoutHints = {},
  options: LayoutOptions = {},
): DiagramLayout {
  switch (mode) {
    case 'dependency':
      return layoutDependency(doc);
    case 'dependency-tree':
      return layoutDependencyTree(doc);
    case 'phrase-block':
      return layoutPhraseBlock(doc);
    case 'morphology':
      return layoutMorphology(doc);
    case 'kellogg-reed':
    default:
      return layoutDocument(doc, hints, options);
  }
}
