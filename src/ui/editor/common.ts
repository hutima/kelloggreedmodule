import type { KrDocument } from '@/domain/schema';
import { getNode, getRelation, nodeText, describeFunction } from '@/domain/model';
import type { Selection } from '@/state/types';
import type { EditorAction } from './types';

/** Resolve what the current selection points at (relation wins over node). */
export type ResolvedTarget =
  | { kind: 'relation'; id: string }
  | { kind: 'node'; id: string }
  | { kind: 'token'; id: string }
  | { kind: 'none' };

export function resolveTarget(doc: KrDocument, selection: Selection): ResolvedTarget {
  if (selection.relationId && getRelation(doc.syntax, selection.relationId))
    return { kind: 'relation', id: selection.relationId };
  if (selection.nodeId && getNode(doc.syntax, selection.nodeId))
    return { kind: 'node', id: selection.nodeId };
  if (selection.tokenId) return { kind: 'token', id: selection.tokenId };
  return { kind: 'none' };
}

export interface SelectableNode {
  id: string;
  label: string;
  kind: KrDocument['syntax']['nodes'][number]['kind'];
  /** Lowest surface index in the node (for ordering); Infinity if none. */
  order: number;
  isRoot: boolean;
}

/** All nodes a user can pick as a head/dependent, in surface order. */
export function selectableNodes(doc: KrDocument): SelectableNode[] {
  const idx = new Map(doc.tokens.map((t) => [t.id, t.index]));
  return doc.syntax.nodes
    .map((n) => {
      const order = n.tokenIds.length
        ? Math.min(...n.tokenIds.map((t) => idx.get(t) ?? Infinity))
        : Infinity;
      return {
        id: n.id,
        label: nodeName(doc, n.id),
        kind: n.kind,
        order,
        isRoot: n.id === doc.syntax.rootId,
      };
    })
    .sort((a, b) => a.order - b.order);
}

/** Short display name for a node (its words, or its implied label). */
export function nodeName(doc: KrDocument, id: string): string {
  const n = getNode(doc.syntax, id);
  if (!n) return id;
  return nodeText(doc, n) || n.label || n.kind;
}

export function describeNode(doc: KrDocument, id: string): string | null {
  const summary = describeFunction(doc, id);
  if (!summary) return nodeName(doc, id);
  return `${summary.word} — ${summary.detail}`;
}

export function describeRelation(doc: KrDocument, id: string): string | null {
  const r = getRelation(doc.syntax, id);
  if (!r) return null;
  return `${nodeName(doc, r.dependentId)} → ${nodeName(doc, r.headId)} (${r.type})`;
}

/**
 * Actions common to a selected NODE in every view. Mode adapters prepend their
 * own primary action and append mode-specific actions.
 */
export function commonNodeActions(doc: KrDocument, nodeId: string): EditorAction[] {
  const node = getNode(doc.syntax, nodeId);
  if (!node) return [];
  const isRoot = nodeId === doc.syntax.rootId;
  const actions: EditorAction[] = [];

  if (!isRoot) {
    actions.push({
      id: 'role',
      label: 'Change role',
      hint: 'Subject, object, modifier…',
      group: 'syntax',
      intent: { kind: 'openRoleEditor', nodeId },
    });
    actions.push({
      id: 'attach',
      label: 'Attach to another word…',
      hint: 'Make this depend on a different head',
      group: 'syntax',
      intent: { kind: 'openRelationBuilder', dependentId: nodeId },
    });
    actions.push({
      id: 'implied',
      label: node.implied ? 'Unmark implied/elided' : 'Mark implied/elided',
      hint: 'For omitted subjects, an absent copula, etc.',
      group: 'syntax',
      intent: { kind: 'setImplied', nodeId, implied: !node.implied },
    });
  }

  actions.push({
    id: 'note',
    label: 'Add / edit note',
    group: 'sermon',
    intent: { kind: 'openNote', anchor: { type: 'node', nodeId } },
  });
  actions.push({
    id: 'highlight',
    label: 'Highlight',
    hint: 'Mark this for sermon prep',
    group: 'sermon',
    intent: { kind: 'toggleHighlight', anchor: { type: 'node', nodeId }, category: 'emphasis' },
  });
  actions.push({
    id: 'morphology',
    label: 'Advanced edit…',
    hint: 'Lemma, gloss, part of speech, parsing',
    group: 'syntax',
    intent: { kind: 'openMorphology', nodeId },
  });

  if (!isRoot) {
    actions.push({
      id: 'delete',
      label: 'Delete word',
      group: 'danger',
      intent: { kind: 'removeNode', nodeId },
    });
  }
  return actions;
}

/** Actions common to a selected RELATION/edge in every view. */
export function commonRelationActions(doc: KrDocument, relationId: string): EditorAction[] {
  const r = getRelation(doc.syntax, relationId);
  if (!r) return [];
  return [
    {
      id: 'type',
      label: 'Change relationship type',
      group: 'syntax',
      intent: { kind: 'openRelationBuilder', relationId },
    },
    {
      id: 'reattach-dep',
      label: 'Reattach dependent…',
      hint: 'Click the new dependent word',
      group: 'syntax',
      intent: { kind: 'startRelink', relationId, end: 'dependent' },
    },
    {
      id: 'reattach-head',
      label: 'Reattach head…',
      hint: 'Click the new head word',
      group: 'syntax',
      intent: { kind: 'startRelink', relationId, end: 'head' },
    },
    {
      id: 'reverse',
      label: 'Reverse direction',
      group: 'syntax',
      intent: { kind: 'reverseRelation', relationId },
    },
    {
      id: 'rel-note',
      label: 'Add / edit relation note',
      group: 'sermon',
      intent: { kind: 'openNote', anchor: { type: 'relation', relationId } },
    },
    {
      id: 'delete-rel',
      label: 'Delete relation',
      group: 'danger',
      intent: { kind: 'removeRelation', relationId },
    },
  ];
}
