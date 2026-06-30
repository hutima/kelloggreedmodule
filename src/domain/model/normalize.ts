import type { KrDocument, Relation, SyntaxNode } from '@/domain/schema';

/**
 * Normalize a syntax graph so the diagram never draws a word twice.
 *
 * Weak auto-tagging — and hand/LLM-authored imports — can produce a graph where
 * the SAME token is realized by more than one node (a phrase node plus its child
 * words), or where one node hangs under more than one head (e.g. the copula
 * tagged as both subject and predicate). Either makes a word render in two
 * places. This pass enforces two tree invariants without touching the base GNT
 * parse (it is applied only to typed / imported documents):
 *
 *   1. each token is realized by AT MOST ONE node — kept on the most specific
 *      node (a `word` before a `phrase`/`clause`, then the one with fewer tokens),
 *      and stripped from the rest;
 *   2. each node has AT MOST ONE parent relation — the highest-priority role wins
 *      (a predicate/subject beats an adjunct), and exact-duplicate relations are
 *      collapsed.
 */

const PARENT_PRIORITY: Record<string, number> = {
  predicate: 100,
  copula: 96,
  subject: 92,
  directObject: 84,
  indirectObject: 82,
  predicateNominative: 80,
  predicateAdjective: 79,
  objectComplement: 74,
  dativeComplement: 72,
  genitiveComplement: 70,
  agent: 66,
  prepositionObject: 60,
  prepositionalPhrase: 56,
  conjunct: 50,
  coordinator: 48,
  adjectival: 42,
  adverbial: 40,
  determiner: 38,
  genitive: 36,
  apposition: 34,
  particle: 24,
  vocative: 22,
  interjection: 20,
  conjunction: 18,
  adjunct: 10,
  unknown: 4,
  clause: 1,
};
const prio = (type: string): number => PARENT_PRIORITY[type] ?? 0;

/** Rank a node for token ownership: word (0) before phrase (1) before clause (2). */
function kindRank(n: SyntaxNode): number {
  return n.kind === 'word' ? 0 : n.kind === 'phrase' ? 1 : 2;
}

export function normalizeSyntax(doc: KrDocument): KrDocument {
  const nodes: SyntaxNode[] = doc.syntax.nodes.map((n) => ({ ...n, tokenIds: [...n.tokenIds] }));

  // 1. One owner per token.
  const owner = new Map<string, SyntaxNode>();
  for (const n of nodes) {
    for (const tid of n.tokenIds) {
      const cur = owner.get(tid);
      if (!cur) {
        owner.set(tid, n);
        continue;
      }
      const replace =
        kindRank(n) < kindRank(cur) ||
        (kindRank(n) === kindRank(cur) && n.tokenIds.length < cur.tokenIds.length);
      if (replace) owner.set(tid, n);
    }
  }
  for (const n of nodes) n.tokenIds = n.tokenIds.filter((tid) => owner.get(tid)?.id === n.id);

  // 2. One parent per dependent, exact duplicates collapsed. Pick the winning
  //    relation per dependent (highest role priority), then emit relations in
  //    their original order, keeping only winners and only one per triple.
  const winner = new Map<string, Relation>();
  for (const r of doc.syntax.relations) {
    const cur = winner.get(r.dependentId);
    if (!cur || prio(r.type) > prio(cur.type)) winner.set(r.dependentId, r);
  }
  const winners = new Set<Relation>(winner.values());
  const emitted = new Set<string>();
  let relations = doc.syntax.relations.filter((r) => {
    if (!winners.has(r)) return false;
    const key = `${r.type}|${r.headId}|${r.dependentId}`;
    if (emitted.has(key)) return false;
    emitted.add(key);
    return true;
  });

  // 3. Splice out redundant EMPTY wrapper nodes — a phrase/word node that, after
  //    token de-duplication, realizes no token and is not an intentional implied
  //    element (an over-specified import wrapping its real word nodes in a phrase
  //    that holds the same tokens). Reparent its children to its own parent so the
  //    structure is preserved without an empty "∅" box.
  const parentOf = new Map<string, string>();
  for (const r of relations) parentOf.set(r.dependentId, r.headId);
  const splice = nodes.filter(
    (n) =>
      n.id !== doc.syntax.rootId &&
      n.kind !== 'clause' &&
      n.tokenIds.length === 0 &&
      !n.implied &&
      !n.label &&
      relations.some((r) => r.headId === n.id), // only when it actually wraps children
  );
  if (splice.length) {
    const spliceIds = new Set(splice.map((n) => n.id));
    relations = relations
      .filter((r) => !spliceIds.has(r.dependentId)) // drop the wrapper's own up-link
      .map((r) =>
        spliceIds.has(r.headId)
          ? { ...r, headId: parentOf.get(r.headId) ?? doc.syntax.rootId }
          : r,
      );
    const keptNodes = nodes.filter((n) => !spliceIds.has(n.id));
    return { ...doc, syntax: { ...doc.syntax, nodes: keptNodes, relations } };
  }

  return { ...doc, syntax: { ...doc.syntax, nodes, relations } };
}
