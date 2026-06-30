import type {
  KrDocument,
  SermonAnchor,
  HighlightCategory,
  SyntacticRole,
  ClauseType,
} from '@/domain/schema';
import type { DiagramMode } from '@/domain/layout';
import type {
  Selection,
  EditTier,
  BasicEditTool,
} from '@/state/types';

export type { EditTier, BasicEditTool } from '@/state/types';

/**
 * EDITING CORE — view-agnostic, tier-aware types.
 *
 * The same shared syntax graph is edited from every visualization. Each
 * visualization contributes an {@link EditorViewAdapter} that, given the current
 * selection AND the active {@link EditTier}, lists the actions that make sense
 * FOR WHAT THE USER IS LOOKING AT. Actions are described as serializable
 * {@link EditIntent}s (not closures) so the adapters stay pure and unit-testable;
 * the EditorController maps an intent to a store call or to a guided modal.
 *
 * BASIC tier is visual-first, sermon-prep-first, plain-English, minimal
 * dropdowns. ADVANCED tier is technical and precise (full role lists, morphology,
 * manual relation building). Semantic edits from either tier flow to one model.
 */

/** A serializable description of an edit (semantic) or a modal/tool to drive. */
export type EditIntent =
  // --- direct semantic edits (flow to the shared syntax graph) ---
  | { kind: 'setRole'; nodeId: string; role: SyntacticRole }
  | { kind: 'addClause' }
  | { kind: 'setMainPredicate'; nodeId: string }
  | { kind: 'setImplied'; nodeId: string; implied: boolean }
  | { kind: 'setClauseType'; nodeId: string; clauseType: ClauseType }
  | { kind: 'attachNodeTo'; dependentId: string; headId: string; type: SyntacticRole }
  | { kind: 'changeRelationType'; relationId: string; type: SyntacticRole }
  | { kind: 'reverseRelation'; relationId: string }
  | { kind: 'removeRelation'; relationId: string }
  | { kind: 'removeNode'; nodeId: string }
  | { kind: 'startRelink'; relationId: string; end: 'head' | 'dependent' }
  // --- hierarchy moves (resolved to attachNodeTo by the controller) ---
  | { kind: 'promoteNode'; nodeId: string }
  | { kind: 'demoteNode'; nodeId: string }
  | { kind: 'moveNodeUnder'; nodeId: string; headId: string; type?: SyntacticRole }
  // --- phrase grouping (new graph mutations) ---
  | { kind: 'groupTokens'; tokenIds: string[] }
  | { kind: 'ungroupNode'; nodeId: string }
  // --- visual linking (Basic, mostly Dependency / Kellogg-Reed) ---
  | { kind: 'startVisualLink'; dependentId: string }
  | { kind: 'completeVisualLink'; headId: string }
  | { kind: 'openQuickRolePicker'; dependentId: string; headId: string }
  // --- tool / view switches ---
  | { kind: 'setEditTool'; tool: BasicEditTool }
  | { kind: 'switchDiagramMode'; mode: DiagramMode }
  // --- layout-only edits (stay view-specific) ---
  | { kind: 'resetLayout'; nodeId: string }
  // --- sermon edits (flow to sermon-prep data) ---
  | { kind: 'toggleHighlight'; anchor: SermonAnchor; category: HighlightCategory }
  // --- open a guided modal ---
  | { kind: 'openRelationBuilder'; dependentId?: string; headId?: string; relationId?: string }
  | { kind: 'openRoleEditor'; nodeId: string }
  | { kind: 'openBlockEditor'; nodeId: string }
  | { kind: 'openAdvancedWordDetails'; nodeId: string }
  | { kind: 'openQuickGloss'; nodeId: string }
  | { kind: 'openNote'; anchor: SermonAnchor };

/** One contextual action shown in the inline popover or the action sheet. */
export interface EditorAction {
  id: string;
  label: string;
  /** Short helper text shown under the label. */
  hint?: string;
  /** Visual grouping: ordinary syntax edit, layout-only, sermon, or dangerous. */
  group?: 'syntax' | 'layout' | 'sermon' | 'danger';
  /** Show this action as a compact chip (Basic tier) rather than a list row. */
  chip?: boolean;
  intent: EditIntent;
}

/**
 * Mode-aware, tier-aware help shown by the "How to edit" button. Practical, not
 * theoretical — it answers the same set of questions for every mode and tier.
 */
export interface EditHelpContent {
  /** "Kellogg-Reed · Basic Edit". */
  title: string;
  /** What this mode is best for. */
  bestFor: string;
  /** What this tier does in this mode (bullet points). */
  whatItDoes: string[];
  /** How to create a relationship. */
  createRelationship: string;
  /** How to move / reparent something. */
  reparent: string;
  /** How to change a label. */
  changeLabel: string;
  /** How to delete a relationship. */
  deleteRelationship: string;
  /** When to switch modes (or tiers). */
  whenToSwitch: string;
}

/** Optional per-mode configuration for the Basic-Edit visual surface. */
export interface BasicInteractionConfig {
  /** Tools offered in this mode's Basic toolbar (besides the always-on Select). */
  tools: BasicEditTool[];
  /** Whether word→word visual linking is the headline interaction. */
  visualLink?: boolean;
  /** Whether row-based promote/demote/move-under applies. */
  rowReparent?: boolean;
  /** Whether grouping contiguous words into a phrase applies. */
  grouping?: boolean;
  /** The roles to surface first in the RelationshipQuickPicker for this mode. */
  quickRoles?: SyntacticRole[];
}

/** Whether an edit changes the shared syntax model, layout, sermon, or a modal. */
export function intentScope(intent: EditIntent): 'syntax' | 'layout' | 'sermon' | 'modal' | 'tool' {
  switch (intent.kind) {
    case 'resetLayout':
      return 'layout';
    case 'toggleHighlight':
      return 'sermon';
    case 'setEditTool':
    case 'switchDiagramMode':
    case 'startVisualLink':
    case 'completeVisualLink':
      return 'tool';
    case 'openRelationBuilder':
    case 'openRoleEditor':
    case 'openBlockEditor':
    case 'openAdvancedWordDetails':
    case 'openQuickGloss':
    case 'openQuickRolePicker':
    case 'openNote':
      return 'modal';
    default:
      return 'syntax';
  }
}

/**
 * An adapter turns "what is selected, in which view, at which tier" into the
 * available actions, plus the mode/tier help and the Basic interaction config.
 */
export interface EditorViewAdapter {
  mode: DiagramMode;
  /** Human label for the view (for the sheet header / docs). */
  label: string;
  /** Plain-language summary of the current target, for the sheet header. */
  describeTarget(doc: KrDocument, selection: Selection): string | null;
  /** Visual-first, plain-English actions for the current selection. */
  getBasicActions(doc: KrDocument, selection: Selection): EditorAction[];
  /** Technical, precise actions (full role list, morphology, manual relations). */
  getAdvancedActions(doc: KrDocument, selection: Selection): EditorAction[];
  /** Compatibility wrapper: pick the tier's action list (defaults to Advanced). */
  getActions(doc: KrDocument, selection: Selection, tier?: EditTier): EditorAction[];
  /** The single most likely action for a one-tap default, per tier. */
  getPrimaryAction(doc: KrDocument, selection: Selection, tier?: EditTier): EditorAction | null;
  /** Mode + tier help for the "How to edit" modal. */
  getHelpContent(tier: EditTier): EditHelpContent;
  /** Optional Basic-Edit visual configuration for this mode. */
  basicInteraction?: BasicInteractionConfig;
}
