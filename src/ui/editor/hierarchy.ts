import type { KrDocument, SyntacticRole } from '@/domain/schema';
import { getNode, childRelations, parentRelations, descendantIds } from '@/domain/model';
import { selectableNodes, type SelectableNode } from './common';

/**
 * Pure hierarchy maths for Phrase/Block reparenting (promote / demote / move
 * under). All three are expressed with the existing `attachNodeTo` graph
 * mutation; these helpers compute the target head, so the controller, the
 * adapters, the workbench, and the advanced BlockEditor all agree on what
 * "promote" and "demote" mean.
 *
 *   Promote  = attach to the GRANDPARENT (one outline level shallower).
 *   Demote   = attach under the PREVIOUS SIBLING (one level deeper).
 *   Move under = attach under any chosen node that isn't a descendant.
 */

/** The relationship type to keep when only the parent changes. */
export function keepType(doc: KrDocument, nodeId: string): SyntacticRole {
  return parentRelations(doc.syntax, nodeId)[0]?.type ?? 'adjunct';
}

/** Lowest surface index anywhere in a node's subtree (Greek/free word order). */
export function subtreeOrder(doc: KrDocument, nodeId: string): number {
  const idx = new Map(doc.tokens.map((t) => [t.id, t.index]));
  const seen = new Set<string>();
  const visit = (id: string): number => {
    if (seen.has(id)) return Infinity;
    seen.add(id);
    const n = getNode(doc.syntax, id);
    if (!n) return Infinity;
    const own = n.tokenIds.length ? Math.min(...n.tokenIds.map((t) => idx.get(t) ?? Infinity)) : Infinity;
    const kids = childRelations(doc.syntax, id).map((r) => visit(r.dependentId));
    return Math.min(own, ...kids);
  };
  return visit(nodeId);
}

/** The grandparent head id (one level up), if any. */
export function grandparentId(doc: KrDocument, nodeId: string): string | undefined {
  const parent = parentRelations(doc.syntax, nodeId)[0];
  if (!parent) return undefined;
  return parentRelations(doc.syntax, parent.headId)[0]?.headId;
}

/** The previous sibling (under the same parent, earlier in surface order). */
export function previousSiblingId(doc: KrDocument, nodeId: string): string | undefined {
  const parent = parentRelations(doc.syntax, nodeId)[0];
  if (!parent) return undefined;
  const mine = subtreeOrder(doc, nodeId);
  return childRelations(doc.syntax, parent.headId)
    .map((r) => r.dependentId)
    .filter((id) => id !== nodeId)
    .map((id) => ({ id, o: subtreeOrder(doc, id) }))
    .filter((s) => s.o < mine)
    .sort((a, b) => b.o - a.o)[0]?.id;
}

/** Nodes a block may be moved under (excludes itself, its descendants, parent). */
export function moveTargets(doc: KrDocument, nodeId: string): SelectableNode[] {
  const parent = parentRelations(doc.syntax, nodeId)[0];
  const banned = new Set([nodeId, ...descendantIds(doc.syntax, nodeId)]);
  return selectableNodes(doc).filter((n) => !banned.has(n.id) && n.id !== parent?.headId);
}

export function canPromote(doc: KrDocument, nodeId: string): boolean {
  return nodeId !== doc.syntax.rootId && Boolean(grandparentId(doc, nodeId));
}

export function canDemote(doc: KrDocument, nodeId: string): boolean {
  return nodeId !== doc.syntax.rootId && Boolean(previousSiblingId(doc, nodeId));
}
