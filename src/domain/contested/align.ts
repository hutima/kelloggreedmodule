import type { AlternateDiff, KrDocument, SyntaxNode } from '@/domain/schema';

/**
 * DIFFERENCE TAGGING FOR FULL-DOC VARIANTS.
 *
 * A curated alternate reading is a patch on the base, so it shares the base's
 * ids and `diffBaseAndAlternate` can diff by id. An imported variant is a full
 * standalone parse with its OWN ids, so we first ALIGN its lexemes to the base by
 * surface (the variant need not cover the whole sentence — only the overlap is
 * analysed), then flag a word as changed when its role or its head attaches
 * differently across the two parses. The resulting AlternateDiff lists BOTH the
 * base ids and the variant ids of the changed words, so the existing side-by-side
 * highlighting lights up the right elements in each frame with no other change.
 */

/** Normalize a surface for matching: NFC, lower-case, strip edge punctuation. */
function norm(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** token id → the (first) node that owns it. */
function tokenToNode(doc: KrDocument): Map<string, SyntaxNode> {
  const m = new Map<string, SyntaxNode>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) if (!m.has(t)) m.set(t, n);
  return m;
}

/** The (first) token owned by the HEAD of `nodeId`'s incoming relation, if any. */
function headTokenOf(doc: KrDocument, nodeId: string | undefined): string | undefined {
  if (!nodeId) return undefined;
  const rel = doc.syntax.relations.find((r) => r.dependentId === nodeId);
  if (!rel) return undefined;
  const head = doc.syntax.nodes.find((n) => n.id === rel.headId);
  return head?.tokenIds[0];
}

/** Order-preserving alignment of two token lists by surface (via an LCS). */
function alignTokens(base: KrDocument, variant: KrDocument) {
  const A = base.tokens;
  const B = variant.tokens;
  const a = A.map((t) => norm(t.surface));
  const b = B.map((t) => norm(t.surface));
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const pairs: [string, string][] = [];
  const baseMatched = new Set<number>();
  const varMatched = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([A[i]!.id, B[j]!.id]);
      baseMatched.add(i);
      varMatched.add(j);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return {
    pairs,
    baseUnaligned: A.filter((_, k) => !baseMatched.has(k)).map((t) => t.id),
    variantUnaligned: B.filter((_, k) => !varMatched.has(k)).map((t) => t.id),
  };
}

export interface AlignedDiffResult {
  diff: AlternateDiff;
  /** True when enough of the sentence aligned to trust the analysis. */
  matched: boolean;
  /** Fraction of the larger token list that aligned. */
  coverage: number;
}

/**
 * Compute a surface-aligned difference between the base parse and a full-doc
 * variant. If `diffWords` (LLM-supplied surfaces that change) are given, they take
 * precedence over the structural auto-detection. Returns `matched: false` when too
 * little of the sentence aligns to analyse — the caller shows the variant anyway,
 * just without highlighting.
 */
export function alignedDiff(
  base: KrDocument,
  variant: KrDocument,
  diffWords?: string[],
): AlignedDiffResult {
  const { pairs, baseUnaligned, variantUnaligned } = alignTokens(base, variant);
  const total = Math.max(base.tokens.length, variant.tokens.length) || 1;
  const coverage = pairs.length / total;
  const matched = coverage >= 0.5 && pairs.length >= 2;

  const changedTokenIds = new Set<string>();
  const changeNotes: string[] = [];

  if (diffWords && diffWords.length) {
    const wanted = new Set(diffWords.map(norm));
    for (const t of base.tokens) if (wanted.has(norm(t.surface))) changedTokenIds.add(t.id);
    for (const t of variant.tokens) if (wanted.has(norm(t.surface))) changedTokenIds.add(t.id);
  } else if (matched) {
    const baseNodes = tokenToNode(base);
    const varNodes = tokenToNode(variant);
    const v2b = new Map(pairs.map(([bId, vId]) => [vId, bId] as const));
    for (const [bId, vId] of pairs) {
      const bNode = baseNodes.get(bId);
      const vNode = varNodes.get(vId);
      const bHead = headTokenOf(base, bNode?.id);
      const vHead = headTokenOf(variant, vNode?.id);
      const mappedVHead = vHead ? v2b.get(vHead) : undefined;
      if (bNode?.role !== vNode?.role || bHead !== mappedVHead) {
        changedTokenIds.add(bId);
        changedTokenIds.add(vId);
        const surface = base.tokens.find((t) => t.id === bId)?.surface;
        if (surface) changeNotes.push(surface);
      }
    }
  }
  // Insertions / deletions (a word present in only one parse) are always changes.
  for (const id of [...baseUnaligned, ...variantUnaligned]) changedTokenIds.add(id);

  const changedNodeIds = new Set<string>();
  for (const doc of [base, variant]) {
    for (const n of doc.syntax.nodes) {
      if (n.tokenIds.some((t) => changedTokenIds.has(t))) changedNodeIds.add(n.id);
    }
  }
  const changedRelationIds = new Set<string>();
  for (const doc of [base, variant]) {
    for (const r of doc.syntax.relations) {
      if (changedNodeIds.has(r.dependentId) || changedNodeIds.has(r.headId)) {
        changedRelationIds.add(r.id);
      }
    }
  }

  const summary: string[] = [];
  if (!matched) summary.push('Could not align this reading to the base — shown without difference analysis.');
  else if (changeNotes.length) summary.push(`Attaches differently: ${unique(changeNotes).join(', ')}.`);
  else if (changedTokenIds.size) summary.push('The wording or segmentation differs from the base.');
  else summary.push('No structural difference detected in the overlapping words.');

  return {
    matched,
    coverage,
    diff: {
      changedTokenIds: [...changedTokenIds],
      changedNodeIds: [...changedNodeIds],
      changedRelationIds: [...changedRelationIds],
      addedNodeIds: [],
      removedNodeIds: [],
      addedRelationIds: [],
      removedRelationIds: [],
      semanticOnly: false,
      textualVariant: false,
      summary,
    },
  };
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}
