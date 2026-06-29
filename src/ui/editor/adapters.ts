import type { KrDocument } from '@/domain/schema';
import { getNode } from '@/domain/model';
import type { DiagramMode } from '@/domain/layout';
import type { Selection } from '@/state/types';
import type { EditorAction, EditorViewAdapter } from './types';
import {
  commonNodeActions,
  commonRelationActions,
  describeNode,
  describeRelation,
  resolveTarget,
} from './common';

/**
 * The five visualization edit adapters. Each shares the common node/relation
 * actions but leads with the affordance that fits its view, and adds view-
 * specific actions (Kellogg-Reed → layout; Phrase/Block → hierarchy; Dependency
 * → edges; Morphology → word data). Semantic edits all reach the same model.
 */

function layoutActions(doc: KrDocument, nodeId: string): EditorAction[] {
  if (!(nodeId in doc.layoutHints)) return [];
  return [
    {
      id: 'reset-layout',
      label: 'Reset visual placement',
      hint: 'Only affects how this view is drawn',
      group: 'layout',
      intent: { kind: 'resetLayout', nodeId },
    },
  ];
}

/** A. Kellogg-Reed — function diagram; layout tuning matters here. */
export const kelloggReedAdapter: EditorViewAdapter = {
  mode: 'kellogg-reed',
  label: 'Kellogg-Reed',
  describeTarget(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return describeRelation(doc, t.id);
    if (t.kind === 'node') return describeNode(doc, t.id);
    return null;
  },
  getActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return commonRelationActions(doc, t.id);
    if (t.kind === 'node') return [...commonNodeActions(doc, t.id), ...layoutActions(doc, t.id)];
    return [];
  },
  getPrimaryAction(doc, selection) {
    return this.getActions(doc, selection)[0] ?? null;
  },
};

/** B. Phrase/Block — clause hierarchy; the most mobile-friendly syntax editor. */
export const phraseBlockAdapter: EditorViewAdapter = {
  mode: 'phrase-block',
  label: 'Phrase / Block',
  describeTarget(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'node') return describeNode(doc, t.id);
    if (t.kind === 'relation') return describeRelation(doc, t.id);
    return null;
  },
  getActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return commonRelationActions(doc, t.id);
    if (t.kind !== 'node') return [];
    const node = getNode(doc.syntax, t.id);
    const blockAction: EditorAction = {
      id: 'block',
      label: node?.kind === 'clause' ? 'Change block type / move…' : 'Move under / change type…',
      hint: 'Promote, demote, or reparent this block',
      group: 'syntax',
      intent: { kind: 'openBlockEditor', nodeId: t.id },
    };
    // Lead with the hierarchy editor in this view.
    return [blockAction, ...commonNodeActions(doc, t.id)];
  },
  getPrimaryAction(doc, selection) {
    return this.getActions(doc, selection)[0] ?? null;
  },
};

/** C. Dependency — head/dependent editing is the headline interaction. */
export const dependencyAdapter: EditorViewAdapter = {
  mode: 'dependency',
  label: 'Dependency',
  describeTarget(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return describeRelation(doc, t.id);
    if (t.kind === 'node') return describeNode(doc, t.id);
    return null;
  },
  getActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return commonRelationActions(doc, t.id);
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
    // The generic "attach" from common is redundant with the leads above.
    const rest = commonNodeActions(doc, t.id).filter((a) => a.id !== 'attach');
    return [...lead, ...rest];
  },
  getPrimaryAction(doc, selection) {
    return this.getActions(doc, selection)[0] ?? null;
  },
};

/** D. Morphology / Clause — word-level data is safest edited here. */
export const morphologyAdapter: EditorViewAdapter = {
  mode: 'morphology',
  label: 'Morphology / Clause',
  describeTarget(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'node') return describeNode(doc, t.id);
    if (t.kind === 'relation') return describeRelation(doc, t.id);
    return null;
  },
  getActions(doc, selection) {
    const t = resolveTarget(doc, selection);
    if (t.kind === 'relation') return commonRelationActions(doc, t.id);
    if (t.kind !== 'node') return [];
    const node = getNode(doc.syntax, t.id);
    const lead: EditorAction[] = [
      {
        id: 'morph-lead',
        label: 'Edit word details…',
        hint: 'Lemma, gloss, part of speech, parsing',
        group: 'syntax',
        intent: { kind: 'openMorphology', nodeId: t.id },
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
    const rest = commonNodeActions(doc, t.id).filter((a) => a.id !== 'morphology');
    return [...lead, ...rest];
  },
  getPrimaryAction(doc, selection) {
    return this.getActions(doc, selection)[0] ?? null;
  },
};

const ADAPTERS: Record<DiagramMode, EditorViewAdapter> = {
  'kellogg-reed': kelloggReedAdapter,
  'phrase-block': phraseBlockAdapter,
  dependency: dependencyAdapter,
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
): EditorAction[] {
  return adapterFor(mode).getActions(doc, selection);
}
