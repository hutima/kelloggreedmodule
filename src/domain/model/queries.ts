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
