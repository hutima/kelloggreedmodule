import type { KrDocument, SyntacticRole } from '@/domain/schema';
import { childRelations, getNode } from '@/domain/model';
import type { DiagramElement, DiagramLayout } from '../types';
import { LAYOUT } from '../constants';
import { curve, finalize, line, resetIds, text, width } from './builder';

/**
 * DEPENDENCY mode — each Greek token is a node on a single horizontal baseline in
 * SURFACE order; an arc joins every dependent to its head, arrow pointing at the
 * head, labelled with the syntactic relation. The gloss sits compactly under each
 * word; full morphology is on hover (the shared detail popover). Clause nodes,
 * which carry no token of their own, are represented by their predicate verb, so
 * the graph is purely word-to-word.
 */

const SHORT_ROLE: Partial<Record<SyntacticRole, string>> = {
  subject: 'subj',
  predicate: 'pred',
  copula: 'cop',
  directObject: 'obj',
  indirectObject: 'iobj',
  predicateNominative: 'pred-nom',
  predicateAdjective: 'pred-adj',
  objectComplement: 'o-comp',
  dativeComplement: 'dat',
  genitiveComplement: 'gen',
  agent: 'agent',
  adjectival: 'adj',
  adverbial: 'adv',
  determiner: 'det',
  genitive: 'gen',
  apposition: 'appos',
  prepositionalPhrase: 'pp',
  prepositionObject: 'p-obj',
  conjunction: 'conj',
  coordinator: 'coord',
  conjunct: 'conj',
  particle: 'ptcl',
  vocative: 'voc',
  interjection: 'intj',
  adjunct: 'adjunct',
  clause: 'cl',
  unknown: '',
};

/** The token that represents a node in the word-graph (a clause → its verb). */
function repTokenId(doc: KrDocument, nodeId: string, seen = new Set<string>()): string | undefined {
  if (seen.has(nodeId)) return undefined;
  seen.add(nodeId);
  const node = getNode(doc.syntax, nodeId);
  if (!node) return undefined;
  if (node.tokenIds.length) return node.tokenIds[0];
  const kids = childRelations(doc.syntax, nodeId);
  const pick = kids.find((r) => r.type === 'predicate' || r.type === 'copula') ?? kids[0];
  return pick ? repTokenId(doc, pick.dependentId, seen) : undefined;
}

export function layoutDependency(doc: KrDocument): DiagramLayout {
  resetIds();
  const elements: DiagramElement[] = [];
  const tokenToNode = new Map<string, string>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);

  const tokenY = 0;
  const glossY = tokenY + LAYOUT.fontSize + 4;
  const gap = 22;

  // Lay tokens left-to-right in surface order; record each token's centre x.
  const centerX = new Map<string, number>();
  const order = new Map<string, number>(); // token id → column index (for arc nesting)
  let cursor = 0;
  doc.tokens.forEach((tok, i) => {
    const w = Math.max(width(tok.surface), tok.gloss ? width(tok.gloss, true) : 0);
    const cx = cursor + w / 2;
    centerX.set(tok.id, cx);
    order.set(tok.id, i);
    const nodeId = tokenToNode.get(tok.id);
    elements.push(text(cx, tokenY, tok.surface, { anchor: 'middle', nodeId }));
    if (tok.gloss) {
      elements.push(text(cx, glossY, tok.gloss, { anchor: 'middle', small: true, muted: true, nodeId }));
    }
    cursor += w + gap;
  });

  // One arc per distinct head→dependent edge, above the row, arrow at the head.
  const arcTop = tokenY - LAYOUT.fontSize - 8;
  const seenEdge = new Set<string>();
  for (const rel of doc.syntax.relations) {
    if (rel.type === 'coordinator') continue; // the conjunction sits inline already
    const depTok = repTokenId(doc, rel.dependentId);
    const headTok = repTokenId(doc, rel.headId);
    if (!depTok || !headTok || depTok === headTok) continue;
    const dx = centerX.get(depTok);
    const hx = centerX.get(headTok);
    if (dx === undefined || hx === undefined) continue;
    const key = `${depTok}->${headTok}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    // Arc height grows with the span so nested dependencies don't overlap.
    const span = Math.abs((order.get(depTok) ?? 0) - (order.get(headTok) ?? 0));
    const h = Math.min(150, 26 + span * 16);
    const apexY = arcTop - h;
    const midX = (dx + hx) / 2;
    elements.push(
      curve(dx, arcTop, midX, apexY, hx, arcTop, 'connector', 'solid', {
        arrow: true,
        relationId: rel.id,
        tentative: rel.provenance?.source === 'inferred' && rel.provenance.confidence === 'low',
      }),
    );
    const label = SHORT_ROLE[rel.type] ?? rel.type;
    if (label) {
      elements.push(text(midX, apexY - 3, label, { anchor: 'middle', small: true, italic: true, relationId: rel.id }));
    }
  }

  // A faint baseline tying the token row together.
  if (doc.tokens.length) {
    elements.push(line(-gap / 2, tokenY + 4, cursor - gap + gap / 2, tokenY + 4, 'baseline', 'solid'));
  }

  return finalize(elements);
}
