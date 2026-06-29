import type {
  KrDocument,
  AlternateReading,
  AlternateDiff,
  SyntaxNode,
  Relation,
} from '@/domain/schema';

/**
 * Compute what actually differs between the base document and an applied
 * alternate, so the UI can highlight ONLY the changed elements (subtle, not a
 * whole-passage wash). For semantic-only and textual readings there is no
 * structural change, so the "changed" sets come from the overlay/variant.
 */

function sameEntity(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffBaseAndAlternate(
  baseDoc: KrDocument,
  alternateDoc: KrDocument,
  reading: AlternateReading,
): AlternateDiff {
  const semanticOnly = !reading.syntaxPatch && Boolean(reading.semanticOverlay);
  const textualVariant = Boolean(reading.textualVariant);

  const changedNodeIds: string[] = [];
  const changedRelationIds: string[] = [];
  const addedNodeIds: string[] = [];
  const removedNodeIds: string[] = [];
  const addedRelationIds: string[] = [];
  const removedRelationIds: string[] = [];
  const changedTokenIds: string[] = [];

  if (reading.syntaxPatch) {
    const baseNodes = new Map(baseDoc.syntax.nodes.map((n) => [n.id, n] as const));
    const altNodes = new Map(alternateDoc.syntax.nodes.map((n) => [n.id, n] as const));
    for (const [id, n] of altNodes) {
      const prev = baseNodes.get(id);
      if (!prev) addedNodeIds.push(id);
      else if (!sameEntity(prev, n)) changedNodeIds.push(id);
    }
    for (const id of baseNodes.keys()) if (!altNodes.has(id)) removedNodeIds.push(id);

    const baseRels = new Map(baseDoc.syntax.relations.map((r) => [r.id, r] as const));
    const altRels = new Map(alternateDoc.syntax.relations.map((r) => [r.id, r] as const));
    for (const [id, r] of altRels) {
      const prev = baseRels.get(id);
      if (!prev) addedRelationIds.push(id);
      else if (!sameEntity(prev, r)) changedRelationIds.push(id);
    }
    for (const id of baseRels.keys()) if (!altRels.has(id)) removedRelationIds.push(id);
  } else if (reading.semanticOverlay) {
    const o = reading.semanticOverlay;
    if (o.relationId) changedRelationIds.push(o.relationId);
    if (o.nodeId) changedNodeIds.push(o.nodeId);
    if (o.tokenIds) changedTokenIds.push(...o.tokenIds);
  }

  if (reading.textualVariant?.affectedBaseTokenIds) {
    changedTokenIds.push(...reading.textualVariant.affectedBaseTokenIds);
  }

  return {
    changedTokenIds: [...new Set(changedTokenIds)],
    changedNodeIds,
    changedRelationIds,
    addedNodeIds,
    removedNodeIds,
    addedRelationIds,
    removedRelationIds,
    semanticOnly,
    textualVariant,
    summary: summarize(baseDoc, reading, {
      changedNodeIds,
      changedRelationIds,
      addedRelationIds,
      removedRelationIds,
    }),
  };
}

function nodeName(doc: KrDocument, nodeId: string): string {
  const n = doc.syntax.nodes.find((x) => x.id === nodeId);
  if (!n) return nodeId;
  const surfaces = n.tokenIds
    .map((tid) => doc.tokens.find((t) => t.id === tid)?.surface)
    .filter(Boolean);
  return surfaces.join(' ') || n.label || n.kind;
}

function summarize(
  baseDoc: KrDocument,
  reading: AlternateReading,
  counts: {
    changedNodeIds: string[];
    changedRelationIds: string[];
    addedRelationIds: string[];
    removedRelationIds: string[];
  },
): string[] {
  const out: string[] = [];
  if (reading.textualVariant) {
    out.push('Depends on a different Greek/Hebrew wording.');
    return out;
  }
  if (reading.semanticOverlay) {
    out.push(`Same tree — reads the relation as: ${reading.semanticOverlay.semanticLabel}.`);
    return out;
  }
  const relBase = baseDoc.syntax.relations;
  for (const id of counts.changedRelationIds) {
    const r = relBase.find((x) => x.id === id);
    if (r) out.push(`Changes attachment of ${nodeName(baseDoc, r.dependentId)}.`);
  }
  if (counts.addedRelationIds.length) out.push(`Adds ${counts.addedRelationIds.length} relationship(s).`);
  if (counts.removedRelationIds.length) out.push(`Removes ${counts.removedRelationIds.length} relationship(s).`);
  if (!out.length && counts.changedNodeIds.length) out.push('Changes node grouping or labels.');
  if (!out.length) out.push('Same Greek/Hebrew text; structure unchanged.');
  return out;
}

/** Highlight class for a node given a diff (or null when unaffected). */
export function getHighlightForNode(diff: AlternateDiff, nodeId: string): string | null {
  if (diff.addedNodeIds.includes(nodeId)) return 'added';
  if (diff.removedNodeIds.includes(nodeId)) return 'removed';
  if (diff.changedNodeIds.includes(nodeId)) return 'changed';
  return null;
}

export function getHighlightForRelation(diff: AlternateDiff, relationId: string): string | null {
  if (diff.addedRelationIds.includes(relationId)) return 'added';
  if (diff.removedRelationIds.includes(relationId)) return 'removed';
  if (diff.changedRelationIds.includes(relationId)) return 'changed';
  return null;
}

export function getHighlightForToken(diff: AlternateDiff, tokenId: string): string | null {
  return diff.changedTokenIds.includes(tokenId) ? 'changed' : null;
}

/** Resolve the set of base node ids touched by a diff (for cross-mode highlight). */
export function affectedNodeSet(
  diff: AlternateDiff,
  baseDoc: KrDocument,
): Set<string> {
  const ids = new Set<string>([...diff.changedNodeIds, ...diff.removedNodeIds]);
  // Map changed tokens to their owning base nodes too.
  if (diff.changedTokenIds.length) {
    const tokenToNode = new Map<string, string>();
    for (const n of baseDoc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);
    for (const t of diff.changedTokenIds) {
      const nid = tokenToNode.get(t);
      if (nid) ids.add(nid);
    }
  }
  // A changed relation marks its endpoints.
  const relById = new Map(baseDoc.syntax.relations.map((r) => [r.id, r] as const));
  for (const rid of diff.changedRelationIds) {
    const r = relById.get(rid);
    if (r) {
      ids.add(r.dependentId);
      ids.add(r.headId);
    }
  }
  return ids;
}

// Re-export entity types touched here so callers don't reach into schema.
export type { SyntaxNode, Relation };
