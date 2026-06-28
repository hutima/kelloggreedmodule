import type {
  KrDocument,
  Relation,
  SyntacticRole,
  SyntaxModel,
  SyntaxNode,
  Token,
} from '@/domain/schema';

/** Read-only helpers over the syntax graph. Pure, no mutation. */

export function getNode(model: SyntaxModel, id: string): SyntaxNode | undefined {
  return model.nodes.find((n) => n.id === id);
}

export function getRelation(model: SyntaxModel, id: string): Relation | undefined {
  return model.relations.find((r) => r.id === id);
}

/** Relations whose head is `nodeId` (i.e. dependents of the node). */
export function childRelations(model: SyntaxModel, nodeId: string): Relation[] {
  return model.relations.filter((r) => r.headId === nodeId);
}

/** Relations whose dependent is `nodeId` (i.e. how the node attaches upward). */
export function parentRelations(model: SyntaxModel, nodeId: string): Relation[] {
  return model.relations.filter((r) => r.dependentId === nodeId);
}

export function childrenByRole(
  model: SyntaxModel,
  nodeId: string,
  role: SyntacticRole,
): SyntaxNode[] {
  return childRelations(model, nodeId)
    .filter((r) => r.type === role)
    .map((r) => getNode(model, r.dependentId))
    .filter((n): n is SyntaxNode => Boolean(n));
}

/** The tokens realizing a node, returned in surface order. */
export function nodeTokens(doc: KrDocument, node: SyntaxNode): Token[] {
  const byId = new Map(doc.tokens.map((t) => [t.id, t]));
  return node.tokenIds
    .map((id) => byId.get(id))
    .filter((t): t is Token => Boolean(t))
    .sort((a, b) => a.index - b.index);
}

/** The surface text of a node (tokens joined in surface order). */
export function nodeText(doc: KrDocument, node: SyntaxNode): string {
  if (node.tokenIds.length === 0) return node.label ?? '';
  return nodeTokens(doc, node)
    .map((t) => t.surface)
    .join(' ');
}

/**
 * Detects whether a node's tokens are discontinuous in the surface string
 * (non-contiguous indices), which the diagram may want to flag.
 */
export function isDiscontinuous(doc: KrDocument, node: SyntaxNode): boolean {
  const tokens = nodeTokens(doc, node);
  if (tokens.length < 2) return false;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i]!.index !== tokens[i - 1]!.index + 1) return true;
  }
  return false;
}

/** All descendant node ids of a node (depth-first), excluding the node itself. */
export function descendantIds(model: SyntaxModel, nodeId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([nodeId]);
  const stack = childRelations(model, nodeId).map((r) => r.dependentId);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const r of childRelations(model, id)) stack.push(r.dependentId);
  }
  return out;
}
