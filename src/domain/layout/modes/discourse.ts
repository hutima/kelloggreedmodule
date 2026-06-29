import type { KrDocument, Token } from '@/domain/schema';
import { childRelations, getNode, nodeText, parentRelations } from '@/domain/model';
import type { DiagramElement, DiagramLayout } from '../types';
import { LAYOUT } from '../constants';
import { curve, finalize, line, resetIds, text, width } from './builder';

/**
 * DISCOURSE FLOW mode — a simplified argument map. Each clause is a block of its
 * Greek words (in surface order); dependent clauses sit beneath the clause they
 * relate to, joined by a labelled arrow. The relation is derived ONLY from
 * honest signals already in the data — the subordinator the converter recorded
 * on the link (ὅτι, ἵνα, γάρ…), the coordinating conjunction, or the clause type.
 * Nothing is over-inferred: when the signal is unclear the edge is left unlabeled.
 */

/** Bare (accent-stripped, lower-cased) subordinator/conjunction → discourse role. */
const LEX_RELATION: Record<string, string> = {
  οτι: 'ground',
  γαρ: 'ground',
  διοτι: 'ground',
  επει: 'ground',
  ινα: 'purpose',
  οπως: 'purpose',
  ωστε: 'result',
  διο: 'result',
  ουν: 'inference',
  αρα: 'inference',
  καθως: 'manner',
  ως: 'manner',
  ωσπερ: 'manner',
  ει: 'condition',
  εαν: 'condition',
  οτε: 'temporal',
  οταν: 'temporal',
  εως: 'temporal',
  αλλα: 'contrast',
  πλην: 'contrast',
  δε: 'development',
  και: 'continuation',
  τε: 'continuation',
  ουδε: 'continuation',
};

function bare(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ᷀-᷿]/g, '')
    .replace(/[.,;·:'’]/g, '')
    .trim()
    .toLowerCase();
}

const V_GAP = 30;
const INDENT_X = 46;
const PAD = 10;
const WORD_GAP = 8;

export function layoutDiscourse(doc: KrDocument): DiagramLayout {
  resetIds();
  const elements: DiagramElement[] = [];
  const tokenToNode = new Map<string, string>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);

  // Assign each token to its innermost clause (same grouping as Morphology mode).
  const clauseOfToken = new Map<string, string>();
  const seen = new Set<string>();
  const walk = (nodeId: string, current: string) => {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    const node = getNode(doc.syntax, nodeId);
    if (!node) return;
    const cl = node.kind === 'clause' ? nodeId : current;
    for (const t of node.tokenIds) clauseOfToken.set(t, cl);
    for (const r of childRelations(doc.syntax, nodeId)) walk(r.dependentId, cl);
  };
  walk(doc.syntax.rootId, doc.syntax.rootId);

  // Own tokens per clause, in surface order; only clauses that own words render.
  const ownTokens = new Map<string, Token[]>();
  for (const tok of [...doc.tokens].sort((a, b) => a.index - b.index)) {
    const cl = clauseOfToken.get(tok.id);
    if (!cl) continue;
    const list = ownTokens.get(cl) ?? [];
    list.push(tok);
    ownTokens.set(cl, list);
  }
  // A clause whose only own words are conjunctions/particles (the wrapper that
  // holds a bare coordinating καί) is not its own assertion — skip it as a block;
  // its conjunct clauses become top-level and thread together instead.
  const contentful = (toks: Token[]) => toks.some((t) => t.pos !== 'conjunction' && t.pos !== 'particle');
  const renderable = [...ownTokens.keys()].filter((id) => contentful(ownTokens.get(id) ?? []));
  renderable.sort(
    (a, b) =>
      Math.min(...ownTokens.get(a)!.map((t) => t.index)) -
      Math.min(...ownTokens.get(b)!.map((t) => t.index)),
  );

  const renderableSet = new Set(renderable);
  const isRenderable = (id: string) => renderableSet.has(id);
  /** Nearest ancestor clause that owns words (the block this one hangs from). */
  function parentBlock(clauseId: string): string | undefined {
    let cur: string | undefined = clauseId;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      const up = parentRelations(doc.syntax, cur)[0];
      if (!up) return undefined;
      const headClause = enclosingClause(up.headId);
      if (!headClause) return undefined;
      if (isRenderable(headClause) && headClause !== clauseId) return headClause;
      cur = headClause;
    }
    return undefined;
  }
  function enclosingClause(nodeId: string): string | undefined {
    let cur: string | undefined = nodeId;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      const node = getNode(doc.syntax, cur);
      if (node?.kind === 'clause') return cur;
      cur = parentRelations(doc.syntax, cur)[0]?.headId;
    }
    return undefined;
  }

  /** Honest discourse label for a clause's incoming edge, or '' (unlabeled). */
  function relationLabel(clauseId: string): string {
    const node = getNode(doc.syntax, clauseId);
    const up = parentRelations(doc.syntax, clauseId)[0];
    if (up?.label) {
      const lex = LEX_RELATION[bare(up.label)];
      if (lex) return lex;
    }
    if (node?.clauseType === 'relative') return 'explanation';
    if (node?.clauseType === 'complement' || up?.type === 'directObject') return 'content';
    if (up?.type === 'conjunct') return coordinatorRelation(clauseId);
    return ''; // adverbial without a subordinator etc. — don't guess
  }
  /** For a coordinate conjunct, read the coordinating conjunction lexeme. */
  function coordinatorRelation(clauseId: string): string {
    const up = parentRelations(doc.syntax, clauseId)[0];
    if (!up) return 'continuation';
    const coord = childRelations(doc.syntax, up.headId).find((r) => r.type === 'coordinator');
    const lex = coord ? LEX_RELATION[bare(nodeText(doc, getNode(doc.syntax, coord.dependentId)!) || '')] : undefined;
    return lex ?? 'continuation';
  }

  const depthOf = new Map<string, number>();
  const depth = (id: string): number => {
    if (depthOf.has(id)) return depthOf.get(id)!;
    const p = parentBlock(id);
    const d = p ? depth(p) + 1 : 0;
    depthOf.set(id, d);
    return d;
  };

  // Lay the clause blocks top-to-bottom in reading order, indented by depth.
  interface Box {
    left: number;
    right: number;
    top: number;
    bottom: number;
    midY: number;
  }
  const box = new Map<string, Box>();
  let y = 0;
  for (const cl of renderable) {
    const toks = ownTokens.get(cl)!;
    const x0 = depth(cl) * INDENT_X;
    // Words in a row inside the block.
    let wx = x0 + PAD;
    const wordY = y + PAD + LAYOUT.fontSize;
    for (const tok of toks) {
      const w = width(tok.surface);
      elements.push(text(wx, wordY, tok.surface, { anchor: 'start', nodeId: tokenToNode.get(tok.id) }));
      wx += w + WORD_GAP;
    }
    const boxRight = wx - WORD_GAP + PAD;
    const boxBottom = wordY + PAD;
    // Block outline.
    elements.push(line(x0, y, boxRight, y, 'connector', 'solid'));
    elements.push(line(x0, boxBottom, boxRight, boxBottom, 'connector', 'solid'));
    elements.push(line(x0, y, x0, boxBottom, 'connector', 'solid'));
    elements.push(line(boxRight, y, boxRight, boxBottom, 'connector', 'solid'));
    box.set(cl, { left: x0, right: boxRight, top: y, bottom: boxBottom, midY: (y + boxBottom) / 2 });
    y = boxBottom + V_GAP;
  }

  /**
   * Connect each block to the block it depends on with an ELBOW routed through
   * the indent channel (straight down a shared spine, then right into the child),
   * not a diagonal from box-centre to box-centre. Children of one parent share
   * the same vertical spine, so the arrows neither fan out from a single point
   * nor cross each other or the labels — the chief complaint with the old map.
   */
  const JOIN = Math.round(INDENT_X * 0.5); // how far left of a child its spine sits
  const elbow = (
    spineX: number,
    fromY: number,
    target: Box,
    style: 'solid' | 'dashed',
    label: string,
  ) => {
    const ty = target.midY;
    elements.push(
      curve(spineX, fromY, spineX, ty, target.left, ty, 'connector', style, { arrow: true }),
    );
    if (label) {
      elements.push(
        text(spineX + 4, ty - 5, label, {
          anchor: 'start',
          small: true,
          italic: true,
          muted: true,
          glossKey: label,
        }),
      );
    }
  };

  // Parent → child elbows (subordinate / embedded blocks).
  let prevTop: string | undefined;
  for (const cl of renderable) {
    const here = box.get(cl)!;
    const parent = parentBlock(cl);
    if (parent && box.has(parent)) {
      const p = box.get(parent)!;
      const spineX = here.left - JOIN;
      elbow(spineX, p.bottom, here, 'solid', relationLabel(cl));
    } else {
      // Top-level assertions thread top-down through a left gutter spine, so the
      // argument still reads as a single column without diagonal crossings.
      if (prevTop && box.has(prevTop)) {
        const p = box.get(prevTop)!;
        const spineX = Math.min(p.left, here.left) - JOIN;
        elbow(spineX, p.bottom, here, 'dashed', relationLabel(cl));
      }
      prevTop = cl;
    }
  }

  return finalize(elements);
}
