import type { SyntaxNode, Token } from '@/domain/schema';

/**
 * Deterministic node id for the word-node wrapping a token. Using a stable id
 * derived from the token means many inferences can reference "the node for this
 * token" without coordinating, and `addNode` stays idempotent (upsert). Accept
 * any subset of inferences in any order — no dangling references result.
 */
export function wordNodeId(tokenId: string): string {
  return `node_w_${tokenId}`;
}

export function buildWordNode(token: Token, partial?: Partial<SyntaxNode>): SyntaxNode {
  return {
    id: wordNodeId(token.id),
    kind: 'word',
    tokenIds: [token.id],
    label: token.surface,
    // Inferred nodes are provisional until accepted, when the apply layer flips
    // them to `confirmed`.
    provenance: { source: 'inferred', confidence: 'medium' },
    ...partial,
  };
}

/** Surface-order token immediately after `token`, if any. */
export function nextToken(tokens: Token[], token: Token): Token | undefined {
  return tokens.find((t) => t.index === token.index + 1);
}

export function prevToken(tokens: Token[], token: Token): Token | undefined {
  return tokens.find((t) => t.index === token.index - 1);
}
