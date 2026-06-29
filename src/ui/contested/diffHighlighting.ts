import type { AlternateDiff } from '@/domain/schema';
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
