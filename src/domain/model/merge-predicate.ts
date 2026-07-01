import type { KrDocument, Relation, SyntaxNode } from '@/domain/schema';

/**
 * Collapse a coordination of finite clauses that SHARE one subject into a single
 * clause with a COMPOUND PREDICATE.
 *
 * Greek (and English) routinely state the subject once and coordinate the verbs:
 * "ὁ Θεὸς ὑπερύψωσεν αὐτὸν καὶ ἐχαρίσατο αὐτῷ τὸ ὄνομα" — God exalted him AND
 * gave him the name. Source analyses often model this as two coordinate CLAUSES,
 * the second subjectless (pro-drop), which draws a phantom "(subject)". The
 * Reed-Kellogg reading is one subject feeding a forked predicate.
 *
 * This pure pass rewrites that case (conservatively): a headless clause whose
 * members are coordinate clauses where the FIRST has a subject + finite verb and
 * EVERY other has a finite verb but NO subject. Each member's verb keeps its own
 * complements (they hang off the verb, not the clause), so the fork's arms carry
 * their own objects. Anything not matching the pattern is left untouched.
 */
export function mergeSharedSubjectPredicate(doc: KrDocument): KrDocument {
  let nodes: SyntaxNode[] = doc.syntax.nodes;
  let relations: Relation[] = doc.syntax.relations;
  let changed = false;

  const tokenIndex = new Map(doc.tokens.map((t) => [t.id, t.index]));
  const posOf = (nodeId: string): string | undefined => {
    const n = nodes.find((x) => x.id === nodeId);
    const tid = n?.tokenIds[0];
    return tid ? doc.tokens.find((t) => t.id === tid)?.pos : undefined;
  };
  const minIndex = (nodeId: string): number => {
    const n = nodes.find((x) => x.id === nodeId);
    const idxs = (n?.tokenIds ?? []).map((t) => tokenIndex.get(t) ?? Infinity);
    return idxs.length ? Math.min(...idxs) : Infinity;
  };

  type Member = { cid: string; subj?: Relation; pred?: Relation; ckids: Relation[] };
  const membersOf = (kids: Relation[]): Member[] =>
    kids
      .filter((r) => r.type === 'conjunct' && nodes.find((n) => n.id === r.dependentId)?.kind === 'clause')
      .map((r) => {
        const ckids = relations.filter((x) => x.headId === r.dependentId);
        return {
          cid: r.dependentId,
          subj: ckids.find((x) => x.type === 'subject'),
          pred: ckids.find((x) => x.type === 'predicate' || x.type === 'copula'),
          ckids,
        };
      })
      .sort((a, b) => minIndex(a.cid) - minIndex(b.cid));

  const matches = (members: Member[]): boolean => {
    if (members.length < 2) return false;
    const [first, ...rest] = members;
    if (!first!.subj || !first!.pred || posOf(first!.pred.dependentId) !== 'verb') return false;
    if (!rest.every((m) => m.pred && !m.subj && posOf(m.pred.dependentId) === 'verb')) return false;
    // Each member clause may carry ONLY its subject/predicate as clause-level
    // children (its objects hang off the verb); else merging would orphan them.
    return members.every((m) => m.ckids.every((x) => x === m.subj || x === m.pred));
  };

  // Fixpoint: merge one matching coordination per pass, then re-scan (a merged
  // clause can itself be a member of an outer coordination).
  for (let guard = 0; guard < 50; guard++) {
    const target = nodes.find((clause) => {
      if (clause.kind !== 'clause') return false;
      const kids = relations.filter((r) => r.headId === clause.id);
      if (kids.some((r) => r.type === 'subject' || r.type === 'predicate' || r.type === 'copula'))
        return false; // not headless
      // A conjunct carrying a connector LABEL is a SUBORDINATE clause (ὅτι/ἵνα/ὡς…)
      // that the wrapper logic modelled as coordination — not a shared-subject
      // compound predicate. Merging it would fork subordinate-related verbs onto one
      // baseline and silently drop the connector, so leave those coordinations alone.
      if (kids.some((r) => r.type === 'conjunct' && r.label)) return false;
      return matches(membersOf(kids));
    });
    if (!target) break;

    const kids = relations.filter((r) => r.headId === target.id);
    const members = membersOf(kids);
    const coordRels = kids.filter((r) => r.type === 'coordinator');
    const [first, ...rest] = members;
    const v0 = first!.pred!.dependentId;
    const memberClauseIds = new Set(members.map((m) => m.cid));
    const restPredIds = new Set(rest.map((m) => m.pred!.id));

    relations = relations
      // Drop the C → member-clause conjunct links (the member clauses dissolve).
      .filter((r) => !(r.headId === target.id && r.type === 'conjunct' && memberClauseIds.has(r.dependentId)))
      .map((r) => {
        if (r.id === first!.subj!.id || r.id === first!.pred!.id) return { ...r, headId: target.id };
        if (restPredIds.has(r.id)) return { ...r, type: 'conjunct' as const, headId: v0 };
        if (coordRels.includes(r)) return { ...r, headId: v0 }; // coordinator rides the verb fork
        return r;
      });
    nodes = nodes
      .filter((n) => !memberClauseIds.has(n.id))
      .map((n) => (n.id === target.id ? { ...n, clauseType: 'independent' as const } : n));
    changed = true;
  }

  if (!changed) return doc;
  return { ...doc, syntax: { ...doc.syntax, nodes, relations } };
}
