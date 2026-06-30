import type { KrDocument, LayoutHints } from '@/domain/schema';
import type { DiagramLayout } from '../types';
import { layoutDocument, type LayoutOptions } from '../engine';
import { layoutDependency } from './dependency';
import { layoutDependencyTree } from './dependency-tree';
import { layoutConstituency } from './constituency';
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
  | 'constituency'
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
  { id: 'constituency', label: 'Constituency Tree', description: 'Phrase-structure tree (S → NP VP), categories on the branches' },
  { id: 'morphology', label: 'Morphology Clause', description: 'Greek forms and agreement' },
];

/**
 * Default visualization on first load (mobile AND desktop): Phrase/Block — the
 * most finger-friendly, sermon-useful structural lens. The selector still lists
 * Kellogg-Reed first; this only sets which mode is shown initially.
 */
export const DEFAULT_MODE: DiagramMode = 'phrase-block';

/**
 * The visualization that supports EDITING. Only the Phrase/Block (block diagram)
 * is editable — it is the finger-friendly, structural lens where building clauses
 * and assigning words is workable. Every OTHER view (Kellogg-Reed, Dependency,
 * Dependency Tree, Constituency, Morphology) is a presentation-only rendering of
 * the same one shared syntax graph: edits made in the block diagram flow through
 * and update all of them, but you cannot edit IN them. (Kellogg-Reed in
 * particular is just a visual of what the block diagram is saying.)
 */
export const EDITABLE_MODES: DiagramMode[] = ['phrase-block'];

/** The editable mode to fall back to / point users toward for editing. */
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
      return layoutDependencyTree(doc, options.treeOrientation);
    case 'constituency':
      return layoutConstituency(doc, options.treeOrientation);
    case 'phrase-block':
      return layoutPhraseBlock(doc, { colorMode: options.colorMode });
    case 'morphology':
      return layoutMorphology(doc);
    case 'kellogg-reed':
    default:
      return layoutDocument(doc, hints, options);
  }
}
