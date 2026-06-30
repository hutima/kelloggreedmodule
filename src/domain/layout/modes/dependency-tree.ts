import type { KrDocument, SyntacticRole } from '@/domain/schema';
import type { DiagramElement, DiagramLayout } from '../types';
import { LAYOUT, relationColor } from '../constants';
import { finalize, line, resetIds, text, width } from './builder';
import { repTokenId, rootTokens, SHORT_ROLE } from './dependency';

/**
 * DEPENDENCY TREE mode — the same head→dependent graph as the arc Dependency
 * view, drawn as a classic TOP-DOWN dependency tree (the shape used by the
 * Perseus / Ancient Greek Dependency Treebank): a `[ROOT]` at the top, each
 * sentence's main verb beneath it, and every dependent hanging below its head
 * with the relation label written on the connecting edge. Words read left to
 * right in surface order within each head's fan of children.
 *
 * Our `KrDocument` IS a typed dependency graph, so this is a direct, faithful
 * rendering — a clause node carries no token of its own, so it collapses into
 * its predicate verb (via `repTokenId`), exactly as the arc view does.
 */

const VROOT = '__root__';
const ROOT_COLOR = '#5b6470'; // slate — the clause family

const SLOT_GAP = 28; // horizontal padding around each node's word (Greek runs wide)

interface Edge {
  head: string;
  type: SyntacticRole;
  relId: string;
}

export function layoutDependencyTree(doc: KrDocument): DiagramLayout {
  resetIds();
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
  const ROW = Math.round(LAYOUT.fontSize * (hasGloss ? 5 : 3.6));

  // Each node's OWN horizontal footprint: its word (or gloss, or the [ROOT]
  // marker), the edge LABEL riding into it, whichever is widest, plus padding.
  // Reserving the label width keeps a narrow word from letting its edge label
  // overlap a sibling's (the clashing role chips on close branches).
  const chipW = (role: SyntacticRole | undefined): number =>
    role && SHORT_ROLE[role] ? width(SHORT_ROLE[role]!, true) + 16 : 0;
  const ownWidth = (tok: string): number => {
    if (tok === VROOT) return width('[ROOT]', true) + SLOT_GAP;
    const s = surface.get(tok) ?? '';
    const g = gloss.get(tok);
    // A token's incoming edge type (its parent's edge), or 'predicate' for a root.
    const role = parent.get(tok)?.type ?? 'predicate';
    return Math.max(width(s), g ? width(g, true) : 0, chipW(role)) + SLOT_GAP;
  };

  // Tidy layout in two passes. measure(): a subtree reserves at least the width
  // of its OWN word — not just its leaves — so a wide INTERNAL node (a head sitting
  // over a narrow child) can't overlap its neighbours. place(): lay each node's
  // children left-to-right within its reserved band and centre the node over them.
  const subW = new Map<string, number>();
  const measure = (tok: string, seen: Set<string>): number => {
    const kids = (children.get(tok) ?? []).filter((k) => !seen.has(k.tok));
    let w = ownWidth(tok);
    if (kids.length) {
      const next = new Set(seen).add(tok);
      w = Math.max(w, kids.reduce((a, k) => a + measure(k.tok, next), 0));
    }
    subW.set(tok, w);
    return w;
  };

  const xOf = new Map<string, number>();
  const yOf = new Map<string, number>();
  const place = (tok: string, left: number, depth: number, seen: Set<string>): void => {
    yOf.set(tok, depth * ROW);
    const kids = (children.get(tok) ?? []).filter((k) => !seen.has(k.tok));
    if (!kids.length) {
      xOf.set(tok, left + (subW.get(tok) ?? ownWidth(tok)) / 2);
      return;
    }
    const next = new Set(seen).add(tok);
    const childTotal = kids.reduce((a, k) => a + (subW.get(k.tok) ?? 0), 0);
    // Centre the children block within this node's (possibly wider) band.
    let cx = left + ((subW.get(tok) ?? childTotal) - childTotal) / 2;
    const childXs: number[] = [];
    for (const k of kids) {
      place(k.tok, cx, depth + 1, next);
      childXs.push(xOf.get(k.tok)!);
      cx += subW.get(k.tok) ?? 0;
    }
    xOf.set(tok, (Math.min(...childXs) + Math.max(...childXs)) / 2);
  };
  measure(VROOT, new Set([VROOT]));
  place(VROOT, 0, 0, new Set([VROOT]));

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
      // Start the edge below the parent's OWN gloss line (when it has one) so the
      // fan of edges doesn't cross the grey gloss text under the head word.
      const y1 = hy + (gloss.get(head) ? LAYOUT.fontSize + 8 : 8);
      const y2 = cy - LAYOUT.fontSize - 4;
      elements.push(line(hx, y1, cx, y2, 'connector', 'solid', { color, relationId: k.relId || undefined }));
      // Label sits directly ABOVE the child word (centred in the child's reserved
      // column) rather than at a point along the edge — so labels on close-fanned
      // branches never overlap, since each child column reserves the chip's width.
      const label = head === VROOT ? (isRoot.has(k.tok) ? 'pred' : '') : SHORT_ROLE[k.type] ?? k.type;
      if (label) {
        elements.push(
          text(cx, y2 - 4, label, {
            anchor: 'middle',
            small: true,
            italic: true,
            box: true,
            color,
            glossKey: k.type,
            relationId: k.relId || undefined,
          }),
        );
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
