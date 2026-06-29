import type {
  KrDocument,
  SermonAnchor,
  HighlightCategory,
  SyntacticRole,
  ClauseType,
} from '@/domain/schema';
import type { DiagramMode } from '@/domain/layout';
import type { Selection } from '@/state/types';

/**
 * EDITING CORE — view-agnostic types.
 *
 * The same shared syntax graph is edited from every visualization. Each
 * visualization contributes an {@link EditorViewAdapter} that, given the current
 * selection, lists the actions that make sense FOR WHAT THE USER IS LOOKING AT.
 * Actions are described as serializable {@link EditIntent}s (not closures) so the
 * adapters stay pure and unit-testable; the EditorController maps an intent to a
 * store call or to a guided modal. This is what keeps semantic edits flowing to
 * one model while letting each view offer its own affordances.
 */

/** A serializable description of an edit (semantic) or a modal to open. */
export type EditIntent =
  // --- direct semantic edits (flow to the shared syntax graph) ---
  | { kind: 'setRole'; nodeId: string; role: SyntacticRole }
  | { kind: 'setImplied'; nodeId: string; implied: boolean }
  | { kind: 'setClauseType'; nodeId: string; clauseType: ClauseType }
  | { kind: 'attachNodeTo'; dependentId: string; headId: string; type: SyntacticRole }
  | { kind: 'changeRelationType'; relationId: string; type: SyntacticRole }
  | { kind: 'reverseRelation'; relationId: string }
  | { kind: 'removeRelation'; relationId: string }
  | { kind: 'removeNode'; nodeId: string }
  | { kind: 'startRelink'; relationId: string; end: 'head' | 'dependent' }
  // --- layout-only edits (stay view-specific) ---
  | { kind: 'resetLayout'; nodeId: string }
  // --- sermon edits (flow to sermon-prep data) ---
  | { kind: 'toggleHighlight'; anchor: SermonAnchor; category: HighlightCategory }
  // --- open a guided modal ---
  | { kind: 'openRelationBuilder'; dependentId?: string; headId?: string; relationId?: string }
  | { kind: 'openRoleEditor'; nodeId: string }
  | { kind: 'openBlockEditor'; nodeId: string }
  | { kind: 'openMorphology'; nodeId: string }
  | { kind: 'openNote'; anchor: SermonAnchor };

/** One contextual action shown in the SelectionActionSheet. */
export interface EditorAction {
  id: string;
  label: string;
  /** Short helper text shown under the label. */
  hint?: string;
  /** Visual grouping: ordinary syntax edit, layout-only, sermon, or dangerous. */
  group?: 'syntax' | 'layout' | 'sermon' | 'danger';
  intent: EditIntent;
}

/** Whether an edit changes the shared syntax model or only this view's layout. */
export function intentScope(intent: EditIntent): 'syntax' | 'layout' | 'sermon' | 'modal' {
  switch (intent.kind) {
    case 'resetLayout':
      return 'layout';
    case 'toggleHighlight':
      return 'sermon';
    case 'openRelationBuilder':
    case 'openRoleEditor':
    case 'openBlockEditor':
    case 'openMorphology':
    case 'openNote':
      return 'modal';
    default:
      return 'syntax';
  }
}

/** An adapter turns "what is selected, in which view" into available actions. */
export interface EditorViewAdapter {
  mode: DiagramMode;
  /** Human label for the view (for the sheet header / docs). */
  label: string;
  /** Plain-language summary of the current target, for the sheet header. */
  describeTarget(doc: KrDocument, selection: Selection): string | null;
  /** All contextual actions for the current selection (ordered). */
  getActions(doc: KrDocument, selection: Selection): EditorAction[];
  /** The single most likely action (used for a one-tap default). */
  getPrimaryAction(doc: KrDocument, selection: Selection): EditorAction | null;
}
