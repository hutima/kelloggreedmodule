import type { KrDocument, SyntacticRole, SyntaxNode } from '@/domain/schema';
import { childRelations, getNode, nodeText } from '@/domain/model';
import type { DiagramElement, DiagramLayout } from '../types';
import { LAYOUT } from '../constants';
import { nodeTone } from '../tone';
import { finalize, line, resetIds, text, width } from './builder';

/**
 * PHRASE / BLOCK mode — an indented outline of the clause + phrase hierarchy.
 * The main clause is at the top-left; every dependent constituent is one row,
 * indented beneath the word or clause it depends on, in GREEK order. Each row
 * carries a function label (subject, verb, prep. phrase, relative clause…) and
 * its Greek text; vertical guide lines show the nesting. No semantic relations
 * are invented — only labels the syntax actually provides are shown.
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

const ROW_H = Math.round(LAYOUT.fontSize * 2.1);
const INDENT = 30;

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
  if (node.kind === 'clause') {
    const base = CLAUSE_LABEL[node.clauseType ?? 'unknown'];
    // A clause attached adjectivally/adverbially keeps its grammatical role too.
    if (relType === 'adjectival' && node.clauseType !== 'relative') return `${base}`;
    return base;
  }
  return relType ? ROLE_LABEL[relType] ?? relType : '';
}

export function layoutPhraseBlock(
  doc: KrDocument,
  opts: { colorMode?: boolean } = {},
): DiagramLayout {
  resetIds();
  const elements: DiagramElement[] = [];
  const root = getNode(doc.syntax, doc.syntax.rootId);
  if (!root) return finalize(elements);

  let rowY = 0;
  // parent node id → y of each child row (for the guide lines).
  const childYs = new Map<string, number[]>();
  const rowOf = new Map<string, number>();
  const depthOf = new Map<string, number>();

  const walk = (nodeId: string, depth: number, relType: SyntacticRole | undefined, parentId: string | undefined, seen: Set<string>) => {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    const node = getNode(doc.syntax, nodeId);
    if (!node) return;
    const x = depth * INDENT;
    const y = rowY;
    rowOf.set(nodeId, y);
    depthOf.set(nodeId, depth);
    if (parentId) {
      const list = childYs.get(parentId) ?? [];
      list.push(y);
      childYs.set(parentId, list);
    }

    const label = labelFor(node, relType);
    const greek = nodeText(doc, node) || (node.implied ? node.label ?? '' : '');
    let cx = x;
    if (label) {
      elements.push(text(cx, y, label, { anchor: 'start', small: true, italic: true, muted: true }));
      cx += width(label, true) + 10;
    }
    if (greek) {
      const tone = opts.colorMode ? nodeTone(doc, node) : undefined;
      elements.push(text(cx, y, greek, { anchor: 'start', nodeId, muted: node.implied, tone }));
    }
    rowY += ROW_H;

    const kids = childRelations(doc.syntax, nodeId)
      .map((r) => ({ r, mi: minIndex(doc, r.dependentId, new Set()) }))
      .sort((a, b) => a.mi - b.mi);
    for (const { r } of kids) walk(r.dependentId, depth + 1, r.type, nodeId, seen);
  };

  walk(root.id, 0, undefined, undefined, new Set());

  // Guide lines: a vertical down each parent's column, with a stub to each child.
  for (const [parentId, ys] of childYs) {
    const py = rowOf.get(parentId)!;
    const gx = (depthOf.get(parentId) ?? 0) * INDENT + INDENT * 0.4;
    const lastY = ys[ys.length - 1]!;
    elements.push(line(gx, py + 6, gx, lastY, 'stem', 'solid'));
    for (const cy of ys) elements.push(line(gx, cy, (depthOf.get(parentId) ?? 0) * INDENT + INDENT, cy, 'stem', 'solid'));
  }

  return finalize(elements);
}
