import type { KrDocument, SyntacticRole, SyntaxNode } from '@/domain/schema';
import { childRelations, getNode, nodeText } from './queries';

/**
 * Build the clause + phrase hierarchy as a nested OUTLINE — the data behind the
 * Phrase/Block view's collapsible tree. Each node carries a human function label
 * (subject, verb, prep. phrase, relative clause…), its own words, and its
 * children in GREEK surface order. Pure and presentation-free; the same labels
 * the SVG Phrase/Block layout prints, so the two views agree.
 */

const ROLE_LABEL: Partial<Record<SyntacticRole, string>> = {
  subject: 'subject',
  predicate: 'verb',
  copula: 'linking verb',
  directObject: 'object',
  indirectObject: 'indirect object',
  predicateNominative: 'predicate nominative',
  predicateAdjective: 'predicate adjective',
  objectComplement: 'object complement',
  dativeComplement: 'dative complement',
  genitiveComplement: 'genitive complement',
  agent: 'agent',
  adjectival: 'adjectival',
  adverbial: 'adverbial',
  determiner: 'article',
  genitive: 'genitive',
  apposition: 'apposition',
  prepositionalPhrase: 'prep. phrase',
  prepositionObject: 'object of prep.',
  conjunction: 'conjunction',
  coordinator: 'conjunction',
  conjunct: 'coordinate',
  particle: 'particle',
  vocative: 'vocative',
  interjection: 'interjection',
  adjunct: 'adjunct',
};

const CLAUSE_LABEL: Record<NonNullable<SyntaxNode['clauseType']>, string> = {
  independent: 'main clause',
  relative: 'relative clause',
  adverbial: 'adverbial clause',
  complement: 'complement clause',
  infinitival: 'infinitival clause',
  participial: 'participial clause',
  coordinate: 'coordinate clauses',
  discourse: 'passage',
  unknown: 'clause',
};

export interface OutlineNode {
  /** Syntax node id (for selection / hover sync). */
  id: string;
  kind: SyntaxNode['kind'];
  /** Function label, e.g. "subject" or "relative clause". */
  label: string;
  /** The node's own words (Greek), or its display label if implied. */
  text: string;
  implied: boolean;
  /** A low-confidence (ambiguous) incoming relation. */
  tentative: boolean;
  children: OutlineNode[];
}

/** Lowest surface position anywhere in a node's subtree (for Greek ordering). */
function minIndex(doc: KrDocument, nodeId: string, seen: Set<string>): number {
  if (seen.has(nodeId)) return Infinity;
  seen.add(nodeId);
  const node = getNode(doc.syntax, nodeId);
  if (!node) return Infinity;
  let m = Infinity;
  for (const tid of node.tokenIds) {
    const t = doc.tokens.find((x) => x.id === tid);
    if (t) m = Math.min(m, t.index);
  }
  for (const r of childRelations(doc.syntax, nodeId)) m = Math.min(m, minIndex(doc, r.dependentId, seen));
  return m;
}

function labelFor(node: SyntaxNode, relType: SyntacticRole | undefined): string {
  if (node.kind === 'clause') return CLAUSE_LABEL[node.clauseType ?? 'unknown'];
  return relType ? ROLE_LABEL[relType] ?? relType : '';
}

export function buildOutline(doc: KrDocument): OutlineNode | undefined {
  const root = getNode(doc.syntax, doc.syntax.rootId);
  if (!root) return undefined;

  const walk = (
    nodeId: string,
    relType: SyntacticRole | undefined,
    tentative: boolean,
    seen: Set<string>,
  ): OutlineNode | undefined => {
    if (seen.has(nodeId)) return undefined;
    seen.add(nodeId);
    const node = getNode(doc.syntax, nodeId);
    if (!node) return undefined;
    const kids = childRelations(doc.syntax, nodeId)
      .map((r) => ({ r, mi: minIndex(doc, r.dependentId, new Set()) }))
      .sort((a, b) => a.mi - b.mi)
      .map(({ r }) =>
        walk(
          r.dependentId,
          r.type,
          r.provenance?.source === 'inferred' && r.provenance.confidence === 'low',
          seen,
        ),
      )
      .filter((n): n is OutlineNode => Boolean(n));
    return {
      id: node.id,
      kind: node.kind,
      label: labelFor(node, relType),
      text: nodeText(doc, node) || (node.implied ? node.label ?? '' : ''),
      implied: Boolean(node.implied),
      tentative,
      children: kids,
    };
  };

  return walk(root.id, undefined, false, new Set());
}
