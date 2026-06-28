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
