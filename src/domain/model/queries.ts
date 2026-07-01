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

/** Roles that hang directly off the enclosing CLAUSE (the baseline owner). */
const CLAUSE_HEADED_ROLES: SyntacticRole[] = ['subject', 'predicate', 'copula'];
/**
 * Verbal complements — they belong UNDER THE VERB in the diagram (the layout
 * engine gathers a clause's objects/complements from the verb node's children,
 * never from the clause directly). A word re-roled to one of these must move to
 * the verb or it is silently dropped from the baseline.
 */
const VERB_HEADED_ROLES: SyntacticRole[] = [
  'directObject',
  'indirectObject',
  'predicateNominative',
  'predicateAdjective',
  'objectComplement',
  'dativeComplement',
  'genitiveComplement',
  'agent',
];

/** The clause node enclosing `nodeId` (walking up parent relations), if any. */
export function clauseAncestor(model: SyntaxModel, nodeId: string): SyntaxNode | undefined {
  const seen = new Set<string>();
  let current: string | undefined = nodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const parent: Relation | undefined = parentRelations(model, current)[0];
    if (!parent) break;
    const head = getNode(model, parent.headId);
    if (head?.kind === 'clause') return head;
    current = parent.headId;
  }
  return undefined;
}

/** The (preferably non-implied) verb/predicate node of a clause, if any. */
export function clauseVerb(model: SyntaxModel, clauseId: string): SyntaxNode | undefined {
  const preds = childRelations(model, clauseId).filter(
    (r) => r.type === 'predicate' || r.type === 'copula',
  );
  const chosen = preds.find((r) => !getNode(model, r.dependentId)?.implied) ?? preds[0];
  return chosen ? getNode(model, chosen.dependentId) : undefined;
}

/**
 * Where a node should attach so the diagram actually renders it in `role`'s slot:
 * clause-level roles (subject/predicate/copula) hang off the enclosing clause;
 * verbal complements (direct/indirect object, predicate nominative…) hang off
 * that clause's verb. For any other role (modifiers, etc.) the attachment is not
 * structurally fixed, so the current head is kept. Returns `undefined` only when
 * the node has no parent and no clause context to attach to.
 */
export function headForRole(
  model: SyntaxModel,
  nodeId: string,
  role: SyntacticRole,
): string | undefined {
  const current = parentRelations(model, nodeId)[0]?.headId;
  if (CLAUSE_HEADED_ROLES.includes(role)) {
    return clauseAncestor(model, nodeId)?.id ?? current;
  }
  if (VERB_HEADED_ROLES.includes(role)) {
    const clause = clauseAncestor(model, nodeId);
    if (!clause) return current;
    const verb = clauseVerb(model, clause.id);
    return verb && verb.id !== nodeId ? verb.id : clause.id;
  }
  return current;
}

/**
 * Where a node should attach so it joins `clauseId` in `role`'s slot — the
 * clause-relative counterpart of {@link headForRole} (which infers the clause
 * from the node's CURRENT position). Used when the user explicitly assigns a word
 * to a chosen clause: subject/predicate/copula and ordinary members hang off the
 * clause itself; verbal complements (object, predicate nominative…) hang off that
 * clause's verb so the Kellogg-Reed baseline draws them, falling back to the
 * clause when it has no verb yet.
 */
export function headForRoleInClause(
  model: SyntaxModel,
  clauseId: string,
  role: SyntacticRole,
): string {
  if (VERB_HEADED_ROLES.includes(role)) {
    const verb = clauseVerb(model, clauseId);
    if (verb && verb.id !== clauseId) return verb.id;
  }
  return clauseId;
}

/**
 * Pairs of (implied subject node ↔ its clause's verb node). A pro-drop / elided
 * subject is inferred FROM the verb's morphology, so the two come from the same
 * word; the UI greys both together when either is hovered. Returns an undirected
 * adjacency map (each id maps to the set of its partners).
 */
export function impliedSubjectVerbPairs(model: SyntaxModel): Map<string, Set<string>> {
  const pairs = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    (pairs.get(a) ?? pairs.set(a, new Set()).get(a)!).add(b);
    (pairs.get(b) ?? pairs.set(b, new Set()).get(b)!).add(a);
  };
  for (const r of model.relations) {
    if (r.type !== 'subject' || !getNode(model, r.dependentId)?.implied) continue;
    const verbRel = model.relations.find(
      (x) => x.headId === r.headId && (x.type === 'predicate' || x.type === 'copula'),
    );
    if (verbRel) link(r.dependentId, verbRel.dependentId);
  }
  return pairs;
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

/**
 * Tidy a macula gloss for display: the source data joins a multi-word gloss for a
 * single token with dots ("I.know", "of.appearance", "[are].a.woman"), which read
 * as spaces. Collapses the dots (and any doubled spaces) without touching the
 * bracketed "[supplied]" markers.
 */
export function tidyGloss(gloss: string | undefined): string {
  return (gloss ?? '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Fallback English glosses for Greek FUNCTION WORDS the base data often leaves
 * unglossed (subordinating conjunctions, relative pronouns). Without these, a
 * subordinator/relative — whether shown as a word or written on a connecting line
 * as a clause's label — stays Greek in English-gloss mode. Keyed by the ACCENTED
 * surface so a relative (ὅς, ὅ, ᾧ …) is never confused with the look-alike article
 * (ὁ, τό, ᾧ) that differs only by accent/breathing.
 */
export const GRC_FUNCTION_GLOSS: Record<string, string> = {
  // subordinating conjunctions
  ὅτι: 'that',
  ἵνα: 'so that',
  ὡς: 'as',
  ὅπως: 'so that',
  ὥστε: 'so that',
  ὅτε: 'when',
  ὅταν: 'when',
  ἐάν: 'if',
  εἰ: 'if',
  καθώς: 'as',
  ἐπεί: 'since',
  ἐπειδή: 'since',
  διότι: 'because',
  ἕως: 'until',
  πρίν: 'before',
  // relative pronoun (ὅς family) — "who / which"
  ὅς: 'who', ὅ: 'which', ἥ: 'who', οἵ: 'who', αἵ: 'who', ἅ: 'which',
  οὗ: 'whose', ἧς: 'whose', ὧν: 'whose', ᾧ: 'to whom', ᾗ: 'to whom',
  οἷς: 'to whom', αἷς: 'to whom', ὅν: 'whom', ἥν: 'whom', οὕς: 'whom', ἅς: 'whom',
};

/** Gloss the (possibly multi-word) connector label of a relation for gloss mode. */
function glossGreekLabel(label: string): string {
  return label
    .split(/\s+/)
    .map((w) => GRC_FUNCTION_GLOSS[w] ?? w)
    .join(' ');
}

/**
 * A display-only copy of the document with each token's surface replaced by its
 * (tidied) English gloss, falling back to the original surface when there's no
 * gloss. Ids, syntax, and layout are untouched — so the STRUCTURE is still the
 * Greek/Hebrew parse; only the words shown change, letting non-Greek readers
 * follow it. The elided-copula label is shown in English ("(is)") too, so an
 * English gloss never leaves a stray Greek "(ἐστίν)" behind.
 */
export function glossDoc(doc: KrDocument): KrDocument {
  return {
    ...doc,
    // The displayed words are now English, so report the language as English too —
    // this is what lets a pro-drop clause's IMPLIED SUBJECT read in English
    // ("(you)" for a 2nd-person imperative) instead of the Greek "(ὑμεῖς)", the
    // same way the elided copula label is glossed below. Scoped to Greek so a
    // Hebrew passage keeps its right-to-left layout (the only other thing the
    // layout reads `language` for); a Hebrew implied subject stays "(subject)".
    language: doc.language === 'grc' ? 'en' : doc.language,
    tokens: doc.tokens.map((t) => ({
      ...t,
      // Prefer the data's gloss; fall back to a function-word gloss (ἵνα, ὅς …)
      // so unglossed subordinators/relatives don't stay Greek; else the surface.
      surface: tidyGloss(t.gloss) || GRC_FUNCTION_GLOSS[t.surface] || t.surface,
    })),
    syntax: {
      ...doc.syntax,
      nodes: doc.syntax.nodes.map((n) =>
        n.label === '(ἐστίν)' ? { ...n, label: '(is)' } : n,
      ),
      // Connector labels (the subordinator written on a clause's link) are Greek
      // surfaces; gloss them too so the diagram reads fully English.
      relations: doc.syntax.relations.map((r) =>
        r.label ? { ...r, label: glossGreekLabel(r.label) } : r,
      ),
    },
  };
}

/** All descendant node ids of a node (depth-first), excluding the node itself. */
/**
 * Tokens that no syntax node realizes — words the parser (or an import) left
 * unplaced. The editor surfaces these in an "unassigned words" bank so a word the
 * auto-tagger missed (a small function word, an unknown form) can still be put on
 * the diagram by hand. Returned in surface order.
 */
export function unassignedTokens(doc: KrDocument): Token[] {
  const placed = new Set<string>();
  for (const n of doc.syntax.nodes) for (const id of n.tokenIds) placed.add(id);
  return doc.tokens.filter((t) => !placed.has(t.id)).sort((a, b) => a.index - b.index);
}

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
