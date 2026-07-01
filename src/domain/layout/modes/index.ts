import type { KrDocument, LayoutHints, Relation } from '@/domain/schema';
import { childRelations, docDirection, getNode } from '@/domain/model';
import type { DiagramLayout } from '../types';
import { layoutDocument, mirrorLayout, type LayoutOptions } from '../engine';
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

/**
 * Attach a subject clause's PARTICLE subordinator (ἄν / ἐάν in "ὃς ἐάν …" =
 * "whoever") to that clause's subject word, so it slants beneath the relative
 * pronoun as an ordinary modifier in EVERY visualization — instead of being an
 * orphan the parse carries only as the relation's label (which no diagram draws).
 * Scoped to particles on a subject relation, so conjunction subordinators (ὅτι /
 * ἵνα on complement clauses) keep their connector-label treatment untouched.
 */
function attachSubjectParticles(doc: KrDocument): KrDocument {
  const posOf = new Map(doc.tokens.map((t) => [t.id, t.pos]));
  const attached = new Set(doc.syntax.relations.map((r) => r.dependentId));
  const added: Relation[] = [];
  for (const r of doc.syntax.relations) {
    if (r.type !== 'subject' || !r.labelNodeId || attached.has(r.labelNodeId)) continue;
    const labelNode = getNode(doc.syntax, r.labelNodeId);
    const tid = labelNode?.tokenIds[0];
    if (!tid || posOf.get(tid) !== 'particle') continue;
    const subj = childRelations(doc.syntax, r.dependentId).find((c) => c.type === 'subject');
    if (!subj) continue;
    added.push({
      id: `r_relpart_${r.id}`,
      type: 'adjunct',
      headId: subj.dependentId,
      dependentId: r.labelNodeId,
      provenance: {
        source: 'inferred',
        confidence: 'medium',
        reason: 'Indefinite-relative particle attached to its pronoun (ὃς + ἄν/ἐάν).',
      },
    });
  }
  return added.length
    ? { ...doc, syntax: { ...doc.syntax, relations: [...doc.syntax.relations, ...added] } }
    : doc;
}

export function layoutForMode(
  mode: DiagramMode,
  doc: KrDocument,
  hints: LayoutHints = {},
  options: LayoutOptions = {},
): DiagramLayout {
  doc = attachSubjectParticles(doc);
  // The effective right-to-left flag: an explicit option wins (the flip toggle),
  // else the document's own direction (Hebrew/Arabic → RTL). Kellogg-Reed mirrors
  // internally via its `rtl` option; the phrase/block diagram is mirrored here so
  // both flip together. (The tree/dependency/morphology modes read left-to-right
  // regardless, so they are left unflipped.)
  const rtl = options.rtl ?? docDirection(doc) === 'rtl';
  switch (mode) {
    case 'dependency':
      return layoutDependency(doc);
    case 'dependency-tree':
      return layoutDependencyTree(doc, options.treeOrientation);
    case 'constituency':
      return layoutConstituency(doc, options.treeOrientation);
    case 'phrase-block': {
      const layout = layoutPhraseBlock(doc, { colorMode: options.colorMode });
      return rtl ? mirrorLayout(layout) : layout;
    }
    case 'morphology':
      return layoutMorphology(doc);
    case 'kellogg-reed':
    default:
      return layoutDocument(doc, hints, { ...options, rtl });
  }
}
