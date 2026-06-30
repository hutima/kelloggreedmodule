import type {
  KrDocument,
  Relation,
  SyntaxModel,
  SyntaxNode,
  Token,
} from '@/domain/schema';
import { descendantIds } from './queries';

/**
 * Pure, immutable edits to the syntax model and document. Each returns a new
 * object; callers (the editor store, the inference engine) never mutate in
 * place. Keeping every structural edit here means there is exactly one place to
 * audit when the model grows.
 */

export function upsertNode(model: SyntaxModel, node: SyntaxNode): SyntaxModel {
  const exists = model.nodes.some((n) => n.id === node.id);
  return {
    ...model,
    nodes: exists
      ? model.nodes.map((n) => (n.id === node.id ? node : n))
      : [...model.nodes, node],
  };
}

export function updateNode(
  model: SyntaxModel,
  id: string,
  patch: Partial<SyntaxNode>,
): SyntaxModel {
  return {
    ...model,
    nodes: model.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
  };
}

export function upsertRelation(model: SyntaxModel, relation: Relation): SyntaxModel {
  const exists = model.relations.some((r) => r.id === relation.id);
  return {
    ...model,
    relations: exists
      ? model.relations.map((r) => (r.id === relation.id ? relation : r))
      : [...model.relations, relation],
  };
}

export function updateRelation(
  model: SyntaxModel,
  id: string,
  patch: Partial<Relation>,
): SyntaxModel {
  return {
    ...model,
    relations: model.relations.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  };
}

export function removeRelation(model: SyntaxModel, id: string): SyntaxModel {
  return { ...model, relations: model.relations.filter((r) => r.id !== id) };
}

/**
 * Removes a node and its whole subtree, plus any relations touching the removed
 * nodes. The root node cannot be removed (returns the model unchanged).
 */
export function removeNodeSubtree(model: SyntaxModel, id: string): SyntaxModel {
  if (id === model.rootId) return model;
  const doomed = new Set<string>([id, ...descendantIds(model, id)]);
  return {
    ...model,
    nodes: model.nodes.filter((n) => !doomed.has(n.id)),
    relations: model.relations.filter(
      (r) => !doomed.has(r.headId) && !doomed.has(r.dependentId),
    ),
  };
}

/**
 * Detach a SINGLE node from the tree without destroying its subtree: the node is
 * removed and its incoming relation dropped, but its children are re-pointed onto
 * the node's former parent so they stay reachable. Tokens are NOT touched — the
 * node's words simply become UNASSIGNED (no node realizes them), so they reappear
 * in the editor's word bank. This is the first half of the two-step delete: a word
 * removed from the diagram goes back to "unassigned" rather than vanishing; a
 * second delete from the bank removes the token for good.
 *
 * The root cannot be detached (returns the model unchanged). A node with no parent
 * simply drops its children's incoming edges (they become detached too) — but in
 * practice every placed word hangs off the root, so a parent always exists.
 */
export function detachNode(model: SyntaxModel, id: string): SyntaxModel {
  if (id === model.rootId) return model;
  const parentHead = model.relations.find((r) => r.dependentId === id)?.headId;
  return {
    ...model,
    nodes: model.nodes.filter((n) => n.id !== id),
    relations: model.relations
      // Drop the node's own incoming relation(s).
      .filter((r) => r.dependentId !== id)
      // Re-home its children onto its former parent (keeping the subtree alive).
      .map((r) => (r.headId === id && parentHead ? { ...r, headId: parentHead } : r))
      // With no parent to re-home onto, drop the now-dangling child edges.
      .filter((r) => r.headId !== id)
      // Never leave a self-loop behind.
      .filter((r) => r.headId !== r.dependentId),
  };
}

// --- token edits --------------------------------------------------------------

export function updateToken(
  doc: KrDocument,
  id: string,
  patch: Partial<Token>,
): KrDocument {
  return {
    ...doc,
    tokens: doc.tokens.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

/** Replaces the syntax model wholesale (e.g. after applying inferences). */
export function withSyntax(doc: KrDocument, syntax: SyntaxModel): KrDocument {
  return { ...doc, syntax };
}
