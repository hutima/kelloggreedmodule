import type { KrDocument, SyntacticRole } from '@/domain/schema';
import { getNode, parentRelations } from '@/domain/model';
import type { DiagramMode } from '@/domain/layout';
import type { Selection, EditTier } from '@/state/types';
import type { EditorAction, EditorViewAdapter } from './types';
import {
  advancedNodeActions,
  advancedRelationActions,
  basicRelationActions,
  describeNode,
  describeRelation,
  mainVerbAction,
  quickRoleChips,
  resolveTarget,
  sermonNodeActions,
} from './common';
import { ROLE_LABEL } from './roles';
import { helpFor } from './help';

/**
 * The four visualization edit adapters, each defining its OWN Basic and Advanced
 * behavior. Basic is visual-first and plain-English (mostly chips and clicks);
 * Advanced is technical and modal-rich (full role lists, morphology). Both tiers
 * funnel semantic edits to the same shared syntax graph — the modes are lenses,
 * not separate models.
 */

function layoutActions(doc: KrDocument, nodeId: string): EditorAction[] {
  if (!(nodeId in doc.layoutHints)) return [];
  return [
    {
      id: 'reset-layout',
      label: 'Reset visual placement',
      hint: 'Visual placement only — does not change the syntax',
      group: 'layout',
      intent: { kind: 'resetLayout', nodeId },
    },
  ];
}

/** "Reattach…" for a NODE, acting on its incoming relation (visual relink). */
function reattachNodeAction(doc: KrDocument, nodeId: string): EditorAction[] {
  const incoming = parentRelations(doc.syntax, nodeId)[0];
  if (!incoming) return [];
  return [
    {
      id: 'reattach',
      label: 'Reattach…',
      hint: 'Click the new word this should attach to',
      group: 'syntax',
      intent: { kind: 'startRelink', relationId: incoming.id, end: 'head' },
    },
  ];
}

// =====================================================================
// A. Kellogg-Reed — formal review & presentation. Layout tuning matters.
// =====================================================================
export const kelloggReedAdapter: EditorViewAdapter = {
  mode: 'kellogg-reed',
  label: 'Kellogg-Reed',
  basicInteraction: { tools: ['link', 'delete'], visualLink: true },
  describeTarget(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return describeRelation(doc, t.id);
    if (t.kind === 'node') return describeNode(doc, t.id);
    return null;
  },
  getBasicActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return basicRelationActions(doc, t.id);
    if (t.kind !== 'node') return [];
    if (t.id === doc.syntax.rootId) return sermonNodeActions(t.id);
    return [
      ...quickRoleChips(doc, t.id),
      ...mainVerbAction(doc, t.id),
      ...reattachNodeAction(doc, t.id),
      ...sermonNodeActions(t.id),
    ];
  },
  getAdvancedActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return advancedRelationActions(doc, t.id);
    if (t.kind === 'node')
      return [...advancedNodeActions(doc, t.id), ...layoutActions(doc, t.id)];
    return [];
  },
  getActions(doc, selection, tier = 'advanced') {
    return tier === 'basic' ? this.getBasicActions(doc, selection) : this.getAdvancedActions(doc, selection);
  },
  getPrimaryAction(doc, selection, tier = 'advanced') {
    return this.getActions(doc, selection, tier)[0] ?? null;
  },
  getHelpContent(tier) {
    return helpFor('kellogg-reed', tier);
  },
};

// =====================================================================
// B. Phrase / Block — the recommended sermon-prep editor (row workbench).
// =====================================================================
function phraseFunctionChips(doc: KrDocument, nodeId: string): EditorAction[] {
  const node = getNode(doc.syntax, nodeId);
  if (node?.kind === 'clause') {
    const types: { ct: NonNullable<typeof node.clauseType>; label: string }[] = [
      { ct: 'independent', label: 'Main clause' },
      { ct: 'adverbial', label: 'Supporting clause' },
      { ct: 'relative', label: 'Relative clause' },
      { ct: 'participial', label: 'Participial clause' },
      { ct: 'infinitival', label: 'Infinitive clause' },
      { ct: 'coordinate', label: 'Coordinate' },
    ];
    return types.map((t) => ({
      id: `ct-${t.ct}`,
      label: t.label,
      group: 'syntax',
      chip: true,
      intent: { kind: 'setClauseType', nodeId, clauseType: t.ct },
    }));
  }
  return quickRoleChips(doc, nodeId);
}

export const phraseBlockAdapter: EditorViewAdapter = {
  mode: 'phrase-block',
  label: 'Phrase / Block',
  // The 'move' (tap-to-reparent) TOOL is dropped from the toolbar — drag-and-drop
  // covers reparenting now. The underlying tool + the row menus' "Move under…"
  // chips still use it; only the redundant toolbar button is gone.
  basicInteraction: { tools: ['group'], rowReparent: true, grouping: true },
  describeTarget(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'node') return describeNode(doc, t.id);
    if (t.kind === 'relation') return describeRelation(doc, t.id);
    return null;
  },
  getBasicActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return basicRelationActions(doc, t.id);
    if (t.kind !== 'node') return [];
    if (t.id === doc.syntax.rootId) return sermonNodeActions(t.id);
    const node = getNode(doc.syntax, t.id);
    const actions: EditorAction[] = [];
    actions.push({
      id: 'promote',
      label: 'Promote',
      hint: 'Move one outline level shallower',
      group: 'syntax',
      intent: { kind: 'promoteNode', nodeId: t.id },
    });
    actions.push({
      id: 'demote',
      label: 'Demote',
      hint: 'Nest under the previous block',
      group: 'syntax',
      intent: { kind: 'demoteNode', nodeId: t.id },
    });
    actions.push({
      id: 'move-under',
      label: 'Move under…',
      hint: 'Then click the block to depend on',
      group: 'syntax',
      intent: { kind: 'setEditTool', tool: 'move' },
    });
    actions.push(...phraseFunctionChips(doc, t.id));
    if (node && node.kind === 'word' && node.tokenIds.length > 1) {
      actions.push({
        id: 'ungroup',
        label: 'Ungroup',
        hint: 'Split back into separate words',
        group: 'syntax',
        intent: { kind: 'ungroupNode', nodeId: t.id },
      });
    }
    actions.push(...sermonNodeActions(t.id));
    return actions;
  },
  getAdvancedActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return advancedRelationActions(doc, t.id);
    if (t.kind !== 'node') return [];
    const node = getNode(doc.syntax, t.id);
    const lead: EditorAction[] = [
      {
        id: 'block',
        label: node?.kind === 'clause' ? 'Change block type / move…' : 'Move under / change type…',
        hint: 'Full clause-type and role lists, explicit move-under',
        group: 'syntax',
        intent: { kind: 'openBlockEditor', nodeId: t.id },
      },
    ];
    return [...lead, ...advancedNodeActions(doc, t.id)];
  },
  getActions(doc, selection, tier = 'advanced') {
    return tier === 'basic' ? this.getBasicActions(doc, selection) : this.getAdvancedActions(doc, selection);
  },
  getPrimaryAction(doc, selection, tier = 'advanced') {
    return this.getActions(doc, selection, tier)[0] ?? null;
  },
  getHelpContent(tier) {
    return helpFor('phrase-block', tier);
  },
};

// =====================================================================
// C. Dependency — the cleanest visual relationship editor (word→word).
// =====================================================================
export const dependencyAdapter: EditorViewAdapter = {
  mode: 'dependency',
  label: 'Dependency',
  basicInteraction: {
    tools: ['link', 'delete'],
    visualLink: true,
    quickRoles: [
      'subject',
      'predicate',
      'directObject',
      'objectComplement',
      'adjectival',
      'genitive',
      'apposition',
      'prepositionObject',
      'conjunct',
    ],
  },
  describeTarget(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return describeRelation(doc, t.id);
    if (t.kind === 'node') return describeNode(doc, t.id);
    return null;
  },
  getBasicActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return basicRelationActions(doc, t.id);
    if (t.kind !== 'node') return [];
    if (t.id === doc.syntax.rootId) return sermonNodeActions(t.id);
    return [
      {
        id: 'attach-to',
        label: 'Attach to…',
        hint: 'Click the word this depends on, then pick a label',
        group: 'syntax',
        intent: { kind: 'startVisualLink', dependentId: t.id },
      },
      ...quickRoleChips(doc, t.id),
      ...mainVerbAction(doc, t.id),
      ...reattachNodeAction(doc, t.id),
      ...sermonNodeActions(t.id),
    ];
  },
  getAdvancedActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return advancedRelationActions(doc, t.id);
    if (t.kind !== 'node') return [];
    const isRoot = t.id === doc.syntax.rootId;
    const lead: EditorAction[] = isRoot
      ? []
      : [
          {
            id: 'attach-lead',
            label: 'Make this depend on…',
            hint: 'Pick the head and the relationship',
            group: 'syntax',
            intent: { kind: 'openRelationBuilder', dependentId: t.id },
          },
          {
            id: 'head-of',
            label: 'Make head of…',
            hint: 'Pick a word that depends on this',
            group: 'syntax',
            intent: { kind: 'openRelationBuilder', headId: t.id },
          },
        ];
    const rest = advancedNodeActions(doc, t.id).filter((a) => a.id !== 'attach');
    return [...lead, ...rest];
  },
  getActions(doc, selection, tier = 'advanced') {
    return tier === 'basic' ? this.getBasicActions(doc, selection) : this.getAdvancedActions(doc, selection);
  },
  getPrimaryAction(doc, selection, tier = 'advanced') {
    return this.getActions(doc, selection, tier)[0] ?? null;
  },
  getHelpContent(tier) {
    return helpFor('dependency', tier);
  },
};

// =====================================================================
// D. Morphology / Word Details — word study & parsing, NOT structure.
// =====================================================================
const SIMPLE_FUNCTIONS: { role: SyntacticRole; label: string }[] = [
  { role: 'subject', label: 'Subject' },
  { role: 'predicate', label: 'Verb' },
  { role: 'directObject', label: 'Object' },
  { role: 'adverbial', label: 'Modifier' },
];

export const morphologyAdapter: EditorViewAdapter = {
  mode: 'morphology',
  label: 'Morphology / Word Details',
  basicInteraction: { tools: [] },
  describeTarget(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'node') return describeNode(doc, t.id);
    if (t.kind === 'relation') return describeRelation(doc, t.id);
    return null;
  },
  getBasicActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') {
      // Word study isn't the place to rewire structure — point users to it.
      return [
        {
          id: 'edit-in-dep',
          label: 'Edit this in Dependency…',
          hint: 'Relationships are edited there',
          group: 'syntax',
          intent: { kind: 'switchDiagramMode', mode: 'dependency' },
        },
        ...basicRelationActions(doc, t.id),
      ];
    }
    if (t.kind !== 'node') return [];
    if (t.id === doc.syntax.rootId) return sermonNodeActions(t.id);
    const actions: EditorAction[] = [
      {
        id: 'quick-gloss',
        label: 'Quick gloss…',
        hint: 'Edit the English gloss',
        group: 'syntax',
        intent: { kind: 'openQuickGloss', nodeId: t.id },
      },
      ...sermonNodeActions(t.id),
      ...SIMPLE_FUNCTIONS.map(
        (f): EditorAction => ({
          id: `fn-${f.role}`,
          label: f.label,
          group: 'syntax',
          chip: true,
          intent: { kind: 'setRole', nodeId: t.id, role: f.role },
        }),
      ),
      {
        id: 'word-details',
        label: 'Word details…',
        hint: 'Full parsing (Advanced)',
        group: 'syntax',
        intent: { kind: 'openAdvancedWordDetails', nodeId: t.id },
      },
      {
        id: 'edit-structure-dep',
        label: 'Edit structure in Dependency',
        group: 'syntax',
        intent: { kind: 'switchDiagramMode', mode: 'dependency' },
      },
      {
        id: 'edit-structure-block',
        label: 'Edit structure in Phrase/Block',
        group: 'syntax',
        intent: { kind: 'switchDiagramMode', mode: 'phrase-block' },
      },
    ];
    return actions;
  },
  getAdvancedActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return advancedRelationActions(doc, t.id);
    if (t.kind !== 'node') return [];
    const node = getNode(doc.syntax, t.id);
    const lead: EditorAction[] = [
      {
        id: 'word-details-lead',
        label: 'Word details…',
        hint: 'Lemma, gloss, part of speech, full parsing',
        group: 'syntax',
        intent: { kind: 'openAdvancedWordDetails', nodeId: t.id },
      },
    ];
    if (node?.kind === 'clause') {
      lead.push({
        id: 'clause-type',
        label: 'Change clause type / block…',
        group: 'syntax',
        intent: { kind: 'openBlockEditor', nodeId: t.id },
      });
    }
    const rest = advancedNodeActions(doc, t.id).filter((a) => a.id !== 'word-details');
    return [...lead, ...rest];
  },
  getActions(doc, selection, tier = 'advanced') {
    return tier === 'basic' ? this.getBasicActions(doc, selection) : this.getAdvancedActions(doc, selection);
  },
  getPrimaryAction(doc, selection, tier = 'advanced') {
    return this.getActions(doc, selection, tier)[0] ?? null;
  },
  getHelpContent(tier) {
    return helpFor('morphology', tier);
  },
};

const ADAPTERS: Record<DiagramMode, EditorViewAdapter> = {
  'kellogg-reed': kelloggReedAdapter,
  'phrase-block': phraseBlockAdapter,
  dependency: dependencyAdapter,
  // The dependency TREE is the same head→dependent graph as the arc view, so it
  // shares its editing adapter (select a word/edge, relink, relabel).
  'dependency-tree': dependencyAdapter,
  // Constituency is presentation-only (read-only, not in EDITABLE_MODES); this
  // entry only satisfies the exhaustive map — editing never routes through it.
  constituency: kelloggReedAdapter,
  morphology: morphologyAdapter,
};

export function adapterFor(mode: DiagramMode): EditorViewAdapter {
  return ADAPTERS[mode] ?? kelloggReedAdapter;
}

/** Convenience for the controller / tests. */
export function actionsFor(
  mode: DiagramMode,
  doc: KrDocument,
  selection: Selection,
  tier: EditTier = 'advanced',
): EditorAction[] {
  return adapterFor(mode).getActions(doc, selection, tier);
}

/** Re-exported so callers don't reach into roles.ts. */
export { ROLE_LABEL };
