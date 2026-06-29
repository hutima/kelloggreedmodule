import type { AlternateDiff, KrDocument } from '@/domain/schema';
import type { DiagramElement } from '@/domain/layout';

/**
 * Subtle difference highlighting shared by single-preview and side-by-side. Given
 * the computed {@link AlternateDiff}, decide whether a layout element is part of
 * the change — and how (changed / added / removed) — so the renderer can outline
 * ONLY what differs, never the whole passage.
 */
export type HighlightKind = 'changed' | 'added' | 'removed';

export function highlightForElement(
  el: DiagramElement,
  diff: AlternateDiff | null,
): HighlightKind | null {
  if (!diff) return null;
  const nodeId = el.nodeId;
  const relationId = el.relationId;
  if (relationId) {
    if (diff.addedRelationIds.includes(relationId)) return 'added';
    if (diff.removedRelationIds.includes(relationId)) return 'removed';
    if (diff.changedRelationIds.includes(relationId)) return 'changed';
  }
  if (nodeId) {
    if (diff.addedNodeIds.includes(nodeId)) return 'added';
    if (diff.removedNodeIds.includes(nodeId)) return 'removed';
    if (diff.changedNodeIds.includes(nodeId)) return 'changed';
  }
  return null;
}

/** The set of node ids to softly mark across modes (changed + token-derived). */
export function highlightedNodeIds(diff: AlternateDiff | null): Set<string> {
  const s = new Set<string>();
  if (!diff) return s;
  for (const id of [...diff.changedNodeIds, ...diff.addedNodeIds, ...diff.removedNodeIds]) s.add(id);
  return s;
}

/**
 * Nodes impacted by the change, resolved AGAINST A GIVEN document — the changed
 * nodes plus the endpoints of every changed/added/removed relation present in
 * that doc, plus token-derived nodes. Used to mark the affected words in whichever
 * frame (base or variant) is being drawn.
 */
export function impactedNodeIds(diff: AlternateDiff | null, doc: KrDocument): Set<string> {
  const set = new Set<string>();
  if (!diff) return set;
  for (const id of [...diff.changedNodeIds, ...diff.addedNodeIds, ...diff.removedNodeIds]) set.add(id);
  const relIds = new Set([
    ...diff.changedRelationIds,
    ...diff.addedRelationIds,
    ...diff.removedRelationIds,
  ]);
  for (const r of doc.syntax.relations) {
    if (relIds.has(r.id)) {
      set.add(r.headId);
      set.add(r.dependentId);
    }
  }
  if (diff.changedTokenIds.length) {
    const tokenToNode = new Map<string, string>();
    for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);
    for (const t of diff.changedTokenIds) {
      const nid = tokenToNode.get(t);
      if (nid) set.add(nid);
    }
  }
  return set;
}

/**
 * Nodes that MOVED between base and variant — a relation present in both whose
 * head changed. Drives the "old position, crossed out" ghosts in the block diff.
 */
export function movedNodes(
  baseDoc: KrDocument,
  variantDoc: KrDocument,
): { dependentId: string; oldHeadId: string; newHeadId: string }[] {
  const baseRel = new Map(baseDoc.syntax.relations.map((r) => [r.id, r] as const));
  const out: { dependentId: string; oldHeadId: string; newHeadId: string }[] = [];
  for (const v of variantDoc.syntax.relations) {
    const b = baseRel.get(v.id);
    if (b && b.headId !== v.headId) {
      out.push({ dependentId: v.dependentId, oldHeadId: b.headId, newHeadId: v.headId });
    }
  }
  return out;
}
