import type { KrDocument, SyntacticRole } from '@/domain/schema';
import type { DiagramElement, DiagramLayout } from '../types';
import { LAYOUT, relationColor } from '../constants';
import { finalize, line, resetIds, text, width } from './builder';
import { repTokenId, rootTokens, SHORT_ROLE } from './dependency';
import { tidyTree, columnCentres, type TreeOrientation } from './tree-layout';

/**
 * DEPENDENCY TREE mode — the same head→dependent graph as the arc Dependency
 * view, drawn as a classic dependency tree (the shape used by the Perseus /
 * Ancient Greek Dependency Treebank): a `[ROOT]`, each sentence's main verb beside
 * it, and every dependent hanging off its head with the relation label written on
 * the connecting edge. Words read in surface order within each head's fan.
 *
 * The tree grows LEFT-TO-RIGHT by default (`orientation: 'horizontal'`): the root
 * sits on the left and each level steps rightward, so sibling sentences stack down
 * the page — which reads far better when several passages are loaded at once than
 * a single very wide top-down row. `orientation: 'vertical'` restores the original
 * top-down Perseus shape.
 *
 * Our `KrDocument` IS a typed dependency graph, so this is a direct, faithful
 * rendering — a clause node carries no token of its own, so it collapses into its
 * predicate verb (via `repTokenId`), exactly as the arc view does.
 */

const VROOT = '__root__';
const ROOT_COLOR = '#5b6470'; // slate — the clause family

const SLOT_GAP = 28; // padding around each node's word along the cross axis (Greek runs wide)
const COL_PAD = 30; // clear space left of each depth column (room for the edge labels)

interface Edge {
  head: string;
  type: SyntacticRole;
  relId: string;
}

export function layoutDependencyTree(
  doc: KrDocument,
  orientation: TreeOrientation = 'horizontal',
): DiagramLayout {
  resetIds();
  const horiz = orientation === 'horizontal';
  const elements: DiagramElement[] = [];

  const surface = new Map(doc.tokens.map((t) => [t.id, t.surface]));
  const gloss = new Map(doc.tokens.map((t) => [t.id, t.gloss]));
  const order = new Map(doc.tokens.map((t) => [t.id, t.index]));
  const nodeOfTok = new Map<string, string>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) nodeOfTok.set(t, n.id);

  // Token-level parent/children, collapsing clauses to their representative verb.
  const parent = new Map<string, Edge>();
  const children = new Map<string, Array<{ tok: string; type: SyntacticRole; relId: string }>>();
  const addChild = (head: string, tok: string, type: SyntacticRole, relId: string) =>
    (children.get(head) ?? children.set(head, []).get(head)!).push({ tok, type, relId });

  for (const rel of doc.syntax.relations) {
    const depTok = repTokenId(doc, rel.dependentId);
    const headTok = repTokenId(doc, rel.headId);
    if (!depTok || !headTok || depTok === headTok) continue;
    if (!surface.has(depTok) || !surface.has(headTok)) continue;
    if (parent.has(depTok)) continue; // first head wins — a tree, not a DAG
    parent.set(depTok, { head: headTok, type: rel.type, relId: rel.id });
    addChild(headTok, depTok, rel.type, rel.id);
  }

  // Top-level children of the virtual ROOT: each sentence's main verb, plus any
  // token that ended up with no head (a disconnected fragment), so nothing is
  // dropped. Mark the genuine sentence roots so they read as the predicate.
  const isRoot = new Set(rootTokens(doc).filter((t) => surface.has(t)));
  for (const t of doc.tokens) {
    if (!parent.has(t.id) && (isRoot.has(t.id) || (children.get(t.id)?.length ?? 0) > 0)) {
      addChild(VROOT, t.id, 'predicate', '');
    }
  }
  // Nothing connected at all → fall back to laying the words out as bare roots.
  if (!(children.get(VROOT)?.length)) {
    for (const t of doc.tokens) if (!parent.has(t.id)) addChild(VROOT, t.id, 'unknown', '');
  }

  for (const list of children.values()) {
    list.sort((a, b) => (order.get(a.tok) ?? 0) - (order.get(b.tok) ?? 0));
  }

  // Each node needs room for its word AND, when present, an English gloss line
  // beneath it; without the extra height a parent's gloss collides with its
  // children's edge labels. Stay compact when nothing is glossed.
  const hasGloss = doc.tokens.some((t) => t.gloss);
  const ROW = Math.round(LAYOUT.fontSize * (hasGloss ? 5 : 3.6)); // vertical: depth pitch
  const ROW_H = Math.round(LAYOUT.fontSize * (hasGloss ? 3.4 : 2.1)); // horizontal: cross slot

  const chipW = (role: SyntacticRole | undefined): number =>
    role && SHORT_ROLE[role] ? width(SHORT_ROLE[role]!, true) + 16 : 0;
  // A node's OWN text extent (its word, or gloss, or the [ROOT] marker, widest).
  const textW = (tok: string): number => {
    if (tok === VROOT) return width('[ROOT]', true);
    const g = gloss.get(tok);
    return Math.max(width(surface.get(tok) ?? ''), g ? width(g, true) : 0);
  };
  // Cross-axis footprint when VERTICAL: word/label width + padding (Greek runs
  // wide), so a wide internal node can't overlap its neighbours.
  const ownWidth = (tok: string): number => {
    const role = parent.get(tok)?.type ?? 'predicate'; // its incoming edge type
    return Math.max(textW(tok), chipW(role)) + SLOT_GAP;
  };

  // The chip label that rides the edge INTO a token: its parent edge's role, or
  // 'pred' for a genuine sentence root (whose VROOT edge has no `parent` entry).
  const incomingLabel = (tok: string): string => {
    const p = parent.get(tok);
    if (p) return SHORT_ROLE[p.type] ?? p.type;
    return isRoot.has(tok) ? 'pred' : '';
  };
  const incomingChipW = (tok: string): number => {
    const l = incomingLabel(tok);
    return l ? width(l, true) + 16 : 0;
  };

  const kidsOf = (tok: string): string[] => (children.get(tok) ?? []).map((k) => k.tok);
  // Vertical reserves word WIDTH along the (horizontal) cross axis; horizontal
  // reserves a fixed line-height SLOT along the (vertical) cross axis.
  const { cross, depth, byDepth } = tidyTree(VROOT, kidsOf, horiz ? () => ROW_H : ownWidth);

  const xOf = new Map<string, number>();
  const yOf = new Map<string, number>();
  if (horiz) {
    // Step rightward by depth; each column is as wide as its widest word, with a
    // gap big enough for the role chips riding into it.
    const colWidth = byDepth.map((list) => Math.max(0, ...list.map(textW)));
    const centres = columnCentres(colWidth, (d) =>
      d === 0 ? COL_PAD : Math.max(0, ...byDepth[d]!.map(incomingChipW)) + COL_PAD,
    );
    for (const [tok, d] of depth) {
      xOf.set(tok, centres[d]!);
      yOf.set(tok, cross.get(tok)!);
    }
  } else {
    for (const [tok, d] of depth) {
      xOf.set(tok, cross.get(tok)!);
      yOf.set(tok, d * ROW);
    }
  }

  // Edges first (so the words/labels draw on top), then nodes.
  for (const [head, kids] of children) {
    const hx = xOf.get(head);
    const hy = yOf.get(head);
    if (hx === undefined || hy === undefined) continue;
    for (const k of kids) {
      const cx = xOf.get(k.tok);
      const cy = yOf.get(k.tok);
      if (cx === undefined || cy === undefined) continue;
      const color = head === VROOT ? ROOT_COLOR : relationColor(k.type);
      const label = head === VROOT ? (isRoot.has(k.tok) ? 'pred' : '') : SHORT_ROLE[k.type] ?? k.type;
      if (horiz) {
        // Step rightward. The edge stops at the role chip's LEFT edge (so no line
        // runs under the bubble), and the chip sits centred in the gap just before
        // the child word — its text centred in the box (the renderer only pads
        // symmetrically for a 'middle' anchor).
        const x1 = hx + textW(head) / 2 + 6;
        const wordLeft = cx - textW(k.tok) / 2;
        let x2 = wordLeft - 5;
        if (label) {
          const bw = width(label, true) + 10; // matches the renderer's chip padding
          const chipCx = wordLeft - 5 - bw / 2;
          x2 = chipCx - bw / 2;
          elements.push(
            text(chipCx, cy, label, {
              anchor: 'middle', small: true, italic: true, box: true, color, glossKey: k.type,
              relationId: k.relId || undefined,
            }),
          );
        }
        elements.push(line(x1, hy, x2, cy, 'connector', 'solid', { color, relationId: k.relId || undefined }));
      } else {
        // Top-down: edge drops from below the parent's gloss to above the child.
        const y1 = hy + (gloss.get(head) ? LAYOUT.fontSize + 8 : 8);
        const y2 = cy - LAYOUT.fontSize - 4;
        elements.push(line(hx, y1, cx, y2, 'connector', 'solid', { color, relationId: k.relId || undefined }));
        // Label sits directly ABOVE the child word (centred in the child's reserved
        // column) rather than at a point along the edge — so labels on close-fanned
        // branches never overlap, since each child column reserves the chip's width.
        if (label) {
          elements.push(
            text(cx, y2 - 4, label, {
              anchor: 'middle', small: true, italic: true, box: true, color, glossKey: k.type,
              relationId: k.relId || undefined,
            }),
          );
        }
      }
    }
  }

  // The [ROOT] marker.
  if (xOf.has(VROOT)) {
    elements.push(
      text(xOf.get(VROOT)!, yOf.get(VROOT)!, '[ROOT]', {
        anchor: 'middle',
        small: true,
        italic: true,
        box: true,
        color: ROOT_COLOR,
        glossKey: 'root',
      }),
    );
  }

  // Word nodes (+ gloss beneath), tagged with their node id for selection.
  for (const [tok, x] of xOf) {
    if (tok === VROOT) continue;
    const y = yOf.get(tok)!;
    const nodeId = nodeOfTok.get(tok);
    elements.push(text(x, y, surface.get(tok) ?? '', { anchor: 'middle', nodeId }));
    const g = gloss.get(tok);
    if (g) elements.push(text(x, y + LAYOUT.fontSize + 2, g, { anchor: 'middle', small: true, muted: true, nodeId }));
  }

  return finalize(elements);
}
