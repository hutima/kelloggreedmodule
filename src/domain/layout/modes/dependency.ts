import type { KrDocument, SyntacticRole } from '@/domain/schema';
import { childRelations, getNode } from '@/domain/model';
import type { DiagramElement, DiagramLayout } from '../types';
import { LAYOUT, relationColor } from '../constants';
import { curve, finalize, line, resetIds, text, width } from './builder';

/**
 * DEPENDENCY mode — a Universal-Dependencies-style graph. Each token is a node on
 * a single horizontal baseline in SURFACE order; a labelled arc joins every head
 * to its dependent, the arrowhead landing ON the dependent word. The gloss sits
 * under each word; full morphology is on hover (the shared detail popover).
 *
 * Two things make the picture readable where a naïve arc-per-edge overlaps:
 *   • Arcs are stacked into LEVELS so that two arcs whose spans overlap never sit
 *     at the same height — nested dependencies nest visually instead of colliding.
 *   • Each arc and its label CHIP share a colour drawn from the relation's meaning
 *     family, so it is obvious which label belongs to which arc. The label text is
 *     always shown, so colour is never the only cue. Tap a label for its meaning.
 *
 * Clause nodes carry no token of their own, so they are represented by their
 * predicate verb; a `root` chip points down at each sentence's main verb.
 */

export const SHORT_ROLE: Partial<Record<SyntacticRole, string>> = {
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

const ROOT_COLOR = '#5b6470'; // slate — matches the clause family

/** The token that represents a node in the word-graph (a clause → its verb). */
export function repTokenId(doc: KrDocument, nodeId: string, seen = new Set<string>()): string | undefined {
  if (seen.has(nodeId)) return undefined;
  seen.add(nodeId);
  const node = getNode(doc.syntax, nodeId);
  if (!node) return undefined;
  if (node.tokenIds.length) return node.tokenIds[0];
  const kids = childRelations(doc.syntax, nodeId);
  const pick = kids.find((r) => r.type === 'predicate' || r.type === 'copula') ?? kids[0];
  return pick ? repTokenId(doc, pick.dependentId, seen) : undefined;
}

/** Main-verb token(s) of the top-level clause(s) — the sentence root(s). */
export function rootTokens(doc: KrDocument): string[] {
  const root = getNode(doc.syntax, doc.syntax.rootId);
  if (!root) return [];
  // A "discourse" wrapper holds several sentences; each gets its own root marker.
  const heads =
    root.clauseType === 'discourse'
      ? childRelations(doc.syntax, root.id).map((r) => r.dependentId)
      : [root.id];
  const out: string[] = [];
  for (const h of heads) {
    const t = repTokenId(doc, h);
    if (t) out.push(t);
  }
  return out;
}

const GAP = 26; // horizontal gap between words
const LEVEL_STEP = 30; // vertical distance between stacked arc levels

interface Arc {
  rel: { id: string; type: SyntacticRole; provenance?: { source?: string; confidence?: string } };
  depTok: string;
  headTok: string;
  a: number; // left column
  b: number; // right column
}

/**
 * Assign each arc the lowest level on which its horizontal span does not overlap
 * any arc already placed there. Spans are compared as open intervals, so arcs
 * that merely touch at a shared word may share a level, while genuinely nested or
 * crossing arcs are pushed to distinct heights.
 */
function assignLevels(arcs: Arc[]): Map<Arc, number> {
  const order = [...arcs].sort((x, y) => x.b - x.a - (y.b - y.a) || x.a - y.a);
  const levels: Array<Array<[number, number]>> = [];
  const out = new Map<Arc, number>();
  for (const arc of order) {
    let lvl = 0;
    for (;;) {
      const here = levels[lvl] ?? (levels[lvl] = []);
      const clash = here.some(([a2, b2]) => arc.a < b2 && a2 < arc.b);
      if (!clash) {
        here.push([arc.a, arc.b]);
        out.set(arc, lvl);
        break;
      }
      lvl++;
    }
  }
  return out;
}

export function layoutDependency(doc: KrDocument): DiagramLayout {
  resetIds();
  const elements: DiagramElement[] = [];
  const tokenToNode = new Map<string, string>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);

  const tokenY = 0;
  const glossY = tokenY + LAYOUT.fontSize + 4;
  const arcBaseY = tokenY - LAYOUT.fontSize - 6; // arcs start/end just above the words

  // Lay tokens left-to-right in surface order; record each token's centre x.
  const centerX = new Map<string, number>();
  const order = new Map<string, number>(); // token id → column index
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
    cursor += w + GAP;
  });

  // Collect one arc per distinct head→dependent edge.
  const arcs: Arc[] = [];
  const seenEdge = new Set<string>();
  for (const rel of doc.syntax.relations) {
    if (rel.type === 'coordinator') continue; // the conjunction sits inline already
    const depTok = repTokenId(doc, rel.dependentId);
    const headTok = repTokenId(doc, rel.headId);
    if (!depTok || !headTok || depTok === headTok) continue;
    if (!centerX.has(depTok) || !centerX.has(headTok)) continue;
    const key = `${headTok}->${depTok}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    const oa = order.get(depTok) ?? 0;
    const ob = order.get(headTok) ?? 0;
    arcs.push({ rel, depTok, headTok, a: Math.min(oa, ob), b: Math.max(oa, ob) });
  }

  const level = assignLevels(arcs);
  let maxLevel = 0;

  // Arc labels are collected, then decluttered (below) so chips on close or
  // same-level arcs don't pile up — the baseline is one-dimensional, so the only
  // free room is vertical.
  interface ArcLabel {
    x: number;
    y: number;
    w: number;
    text: string;
    color: string;
    glossKey: SyntacticRole;
    relId: string;
  }
  const arcLabels: ArcLabel[] = [];

  for (const arc of arcs) {
    const lvl = level.get(arc) ?? 0;
    maxLevel = Math.max(maxLevel, lvl);
    const hx = centerX.get(arc.headTok)!;
    const dx = centerX.get(arc.depTok)!;
    const h = LEVEL_STEP * (lvl + 1);
    const apexY = arcBaseY - h; // visual apex of the arc
    const cy = arcBaseY - 2 * h; // quadratic control so the curve peaks at apexY
    const midX = (hx + dx) / 2;
    const color = relationColor(arc.rel.type);
    const tentative =
      arc.rel.provenance?.source === 'inferred' && arc.rel.provenance?.confidence === 'low';
    // Head → dependent; the arrowhead lands on the dependent word.
    elements.push(
      curve(hx, arcBaseY, midX, cy, dx, arcBaseY, 'connector', 'solid', {
        arrow: true,
        relationId: arc.rel.id,
        color: tentative ? undefined : color,
        tentative,
      }),
    );
    const label = SHORT_ROLE[arc.rel.type] ?? arc.rel.type;
    if (label) {
      arcLabels.push({
        x: midX,
        y: apexY + 4,
        w: width(label, true) + 14,
        text: label,
        color,
        glossKey: arc.rel.type,
        relId: arc.rel.id,
      });
    }
  }

  // Declutter the arc labels: a chip is nudged UPWARD until it clears every chip
  // already placed, so labels on overlapping or same-level arcs separate instead
  // of stacking on the same spot. Taller arcs (placed higher first) anchor the
  // free space; nested/lower chips rise as needed.
  const LABEL_H = LAYOUT.fontSize + 6;
  const placedLabels: Array<{ x1: number; x2: number; y: number }> = [];
  for (const L of [...arcLabels].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let y = L.y;
    const half = L.w / 2;
    const hits = () =>
      placedLabels.some((p) => Math.abs(p.y - y) < LABEL_H && L.x - half < p.x2 && p.x1 < L.x + half);
    for (let guard = 0; hits() && guard < 16; guard++) y -= LABEL_H * 0.6;
    placedLabels.push({ x1: L.x - half, x2: L.x + half, y });
    elements.push(
      text(L.x, y, L.text, {
        anchor: 'middle',
        small: true,
        italic: true,
        box: true,
        color: L.color,
        glossKey: L.glossKey,
        relationId: L.relId,
      }),
    );
  }

  // A `root` chip pointing down at each sentence's main verb. Lift it clear of the
  // tallest arc AND of any label that got nudged up by the declutter pass.
  const highestLabel = placedLabels.reduce((m, p) => Math.min(m, p.y), Infinity);
  const rootY = Math.min(arcBaseY - LEVEL_STEP * (maxLevel + 2), highestLabel - LABEL_H);
  for (const tok of rootTokens(doc)) {
    const vx = centerX.get(tok);
    if (vx === undefined) continue;
    elements.push(
      curve(vx, rootY + 10, vx, (rootY + arcBaseY) / 2, vx, arcBaseY, 'connector', 'solid', {
        arrow: true,
        color: ROOT_COLOR,
      }),
    );
    elements.push(
      text(vx, rootY, 'root', {
        anchor: 'middle',
        small: true,
        italic: true,
        box: true,
        color: ROOT_COLOR,
        glossKey: 'root',
      }),
    );
  }

  // A faint baseline tying the token row together.
  if (doc.tokens.length) {
    elements.push(line(-GAP / 2, tokenY + 4, cursor - GAP + GAP / 2, tokenY + 4, 'baseline', 'solid'));
  }

  return finalize(elements);
}
