import type { KrDocument, LayoutHints, SyntacticRole, SyntaxNode } from '@/domain/schema';
import { childRelations, getNode, nodeText } from '@/domain/model';
import { LAYOUT } from './constants';
import { measureText } from './measure';
import type { DiagramElement, DiagramLayout, LineElement, TextElement } from './types';

/**
 * LAYOUT ENGINE — maps the syntax model to pure geometry.
 *
 * It walks the syntax graph top-down from the root clause and never consults
 * surface token order for structure (only for rendering a node's own text). The
 * output is a flat list of primitives the SVG renderer draws verbatim.
 *
 * The recursion is built from two block-producing functions:
 *   - layoutHead   a word + its modifier dependents stacked beneath it
 *   - layoutClause a baseline (subject | predicate + complements) + adjuncts
 * Either may contain the other, so relative clauses, participial clauses, and
 * nested coordination all compose naturally.
 */

/** A laid-out subtree, baseline at local y = 0, occupying x ∈ [0, width]. */
interface Block {
  width: number;
  height: number; // extent below the baseline (y grows downward)
  elements: DiagramElement[];
  /** The head word's baseline span, used to attach the parent connector. */
  wordLeft: number;
  wordRight: number;
}

const BASELINE_COMPLEMENTS: SyntacticRole[] = [
  'directObject',
  'indirectObject',
  'predicateNominative',
  'predicateAdjective',
  'objectComplement',
  'dativeComplement',
  'genitiveComplement',
];

// Roles drawn with a (more vertical) stem rather than a modifier slant.
const STEM_ROLES: SyntacticRole[] = ['prepositionalPhrase', 'prepositionObject'];

function translate(block: Block, dx: number, dy: number): DiagramElement[] {
  return block.elements.map((el) => {
    if (el.kind === 'line') {
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    }
    return { ...el, x: el.x + dx, y: el.y + dy };
  });
}

let uid = 0;
const eid = () => `el_${uid++}`;

export function layoutDocument(doc: KrDocument, hints: LayoutHints = {}): DiagramLayout {
  uid = 0;
  const ctx: Ctx = { doc, hints };
  const root = getNode(doc.syntax, doc.syntax.rootId);
  if (!root) return { width: 200, height: 80, elements: [] };

  const block = layoutNode(ctx, root.id, new Set());
  const m = LAYOUT.margin;
  const elements = translate(block, m, m + LAYOUT.dividerUp);
  return {
    width: block.width + m * 2,
    height: block.height + m * 2 + LAYOUT.dividerUp + LAYOUT.textRise,
    elements,
  };
}

interface Ctx {
  doc: KrDocument;
  hints: LayoutHints;
}

function layoutNode(ctx: Ctx, nodeId: string, seen: Set<string>): Block {
  if (seen.has(nodeId)) return emptyBlock();
  seen.add(nodeId);
  const node = getNode(ctx.doc.syntax, nodeId);
  if (!node) return emptyBlock();
  const hint = ctx.hints[nodeId];
  const block =
    node.kind === 'clause'
      ? layoutClause(ctx, node, seen)
      : layoutHead(ctx, node, seen, hint?.collapsed === true);
  // Apply a user nudge by translating the block's drawing without changing the
  // space its parent reserved (a deliberate, predictable override).
  if (hint && (hint.offsetX || hint.offsetY)) {
    return { ...block, elements: translate(block, hint.offsetX ?? 0, hint.offsetY ?? 0) };
  }
  return block;
}

function emptyBlock(): Block {
  return { width: 0, height: 0, elements: [], wordLeft: 0, wordRight: 0 };
}

// --- a word and its modifiers -------------------------------------------------

function layoutHead(
  ctx: Ctx,
  node: SyntaxNode,
  seen: Set<string>,
  collapsed = false,
): Block {
  const text = nodeText(ctx.doc, node) || node.label || '∅';
  const wordW = measureText(text) + LAYOUT.wordPadX * 2;

  // Every dependent of a word hangs beneath it. Word/modifier dependents flow
  // horizontally in a row (adjectives, adverbs, prepositional phrases); clause
  // dependents (relative/complement clauses) are tall, so they stack vertically
  // on a shared stem instead — keeping the diagram narrow and untangled.
  const depRels = collapsed ? [] : childRelations(ctx.doc.syntax, node.id);
  const wordRels = depRels.filter((r) => !isClauseChild(ctx, r.dependentId));
  const clauseRels = depRels.filter((r) => isClauseChild(ctx, r.dependentId));

  const depBlocks = wordRels.map((r) => ({
    rel: r,
    block: layoutNode(ctx, r.dependentId, seen),
  }));

  const depTotalW =
    depBlocks.reduce((s, d) => s + d.block.width, 0) +
    Math.max(0, depBlocks.length - 1) * LAYOUT.dependentGap;

  const rowWidth = Math.max(wordW, depTotalW);
  const center = rowWidth / 2;
  const wordLeft = center - wordW / 2;
  const wordRight = center + wordW / 2;

  const elements: DiagramElement[] = [];
  // The head word sits on its own short baseline so children can attach to it.
  elements.push(line(eid(), wordLeft, 0, wordRight, 0, 'solid', 'baseline', node.id));
  elements.push(
    wordText(eid(), center, -LAYOUT.textRise, text, 'middle', node),
  );

  // Lay modifier dependents left-to-right beneath, each joined by a slant/stem.
  let cursor = center - depTotalW / 2;
  const depTop = LAYOUT.slantDrop;
  let maxDepHeight = 0;
  depBlocks.forEach(({ rel, block }, i) => {
    const dx = cursor;
    elements.push(...translate(block, dx, depTop));
    // Connector from head baseline to the dependent's word.
    const childCenter = dx + block.width / 2;
    const attachX = clampAttach(wordLeft, wordRight, center, i, depBlocks.length);
    const stem = STEM_ROLES.includes(rel.type);
    elements.push(
      line(
        eid(),
        attachX,
        0,
        stem ? childCenter : dx + block.wordLeft + LAYOUT.slantRun,
        depTop,
        'solid',
        stem ? 'stem' : 'slant',
        undefined,
        rel.id,
      ),
    );
    if (rel.label && showLabel(ctx, rel.dependentId)) {
      elements.push(
        smallText(eid(), attachX + 6, depTop / 2, rel.label, 'start', rel.id),
      );
    }
    cursor += block.width + LAYOUT.dependentGap;
    maxDepHeight = Math.max(maxDepHeight, block.height);
  });

  const rowHeight = depBlocks.length ? depTop + maxDepHeight : 0;

  // Clause dependents stack vertically on a stem dropping from the head.
  let bottom = rowHeight;
  let right = rowWidth;
  if (clauseRels.length) {
    const topY = (rowHeight > 0 ? rowHeight : 0) + LAYOUT.adjunctDrop;
    const stack = stackClauses(ctx, clauseRels, seen, center, topY);
    elements.push(line(eid(), center, 0, center, topY, 'dotted', 'stem'));
    elements.push(...stack.elements);
    bottom = Math.max(bottom, stack.bottom);
    right = Math.max(right, stack.right);
  }

  return {
    width: right,
    height: depBlocks.length || clauseRels.length ? bottom : 0,
    elements,
    wordLeft,
    wordRight,
  };
}

/**
 * Stack clause-valued dependents vertically on a shared vertical stem rooted at
 * (`spineX`, `topY`). Each clause is laid out fully and hung off the stem by a
 * short horizontal connector, so coordinated and subordinate clauses read top
 * to bottom rather than sprawling across the page. Returns the placed elements
 * plus the extent reached (`right`, `bottom`) in the caller's coordinate space.
 */
function stackClauses(
  ctx: Ctx,
  rels: { id: string; dependentId: string; label?: string }[],
  seen: Set<string>,
  spineX: number,
  topY: number,
): { elements: DiagramElement[]; right: number; bottom: number } {
  const elements: DiagramElement[] = [];
  let y = topY + LAYOUT.clauseFirstDrop;
  let right = spineX;
  let bottom = topY;
  let lastBaselineY = topY;
  const blockX = spineX + LAYOUT.spineIndent;

  rels.forEach((r) => {
    const block = layoutNode(ctx, r.dependentId, seen);
    elements.push(...translate(block, blockX, y));
    // Short connector from the stem to this clause's baseline.
    elements.push(
      line(eid(), spineX, y, blockX + block.wordLeft, y, 'dotted', 'stem', undefined, r.id),
    );
    if (r.label && showLabel(ctx, r.dependentId)) {
      elements.push(smallText(eid(), spineX + 6, y - 6, r.label, 'start', r.id));
    }
    lastBaselineY = y;
    right = Math.max(right, blockX + block.width);
    bottom = Math.max(bottom, y + block.height);
    y += block.height + LAYOUT.clauseStackGap;
  });

  // The vertical stem itself, spanning from its top to the last clause.
  elements.unshift(line(eid(), spineX, topY, spineX, lastBaselineY, 'dotted', 'stem'));
  return { elements, right, bottom };
}

function clampAttach(
  left: number,
  right: number,
  center: number,
  i: number,
  n: number,
): number {
  if (n <= 1) return center;
  const t = (i + 1) / (n + 1);
  return left + (right - left) * t;
}

// --- a clause baseline --------------------------------------------------------

function layoutClause(ctx: Ctx, clause: SyntaxNode, seen: Set<string>): Block {
  const model = ctx.doc.syntax;
  const rels = childRelations(model, clause.id);

  const subjectRel = rels.find((r) => r.type === 'subject');
  const predicateRel = rels.find((r) => r.type === 'predicate' || r.type === 'copula');

  const subjectBlock = subjectRel
    ? layoutNode(ctx, subjectRel.dependentId, seen)
    : impliedBlock('(subject)');
  // The verb is rendered as a bare word; the CLAUSE owns the verb's complements
  // (baseline) and adjuncts (below), so they are not drawn twice.
  const verbNode = predicateRel ? getNode(model, predicateRel.dependentId) : undefined;
  const verbBlock = verbNode
    ? layoutHead(ctx, verbNode, seen, true)
    : impliedBlock('(verb)');

  // Complements live under the verb node but render on the baseline — unless a
  // complement is itself a clause (e.g. a noun clause as direct object), which
  // is too tall for the baseline and instead drops below on a stem.
  const verbRels = predicateRel ? childRelations(model, predicateRel.dependentId) : [];
  const isBaselineComplement = (r: { type: SyntacticRole; dependentId: string }) =>
    BASELINE_COMPLEMENTS.includes(r.type) && !isClauseChild(ctx, r.dependentId);
  const complementRels = verbRels.filter(isBaselineComplement);
  const complementBlocks = complementRels.map((r) => ({
    rel: r,
    block: layoutNode(ctx, r.dependentId, seen),
  }));

  const elements: DiagramElement[] = [];
  let x = 0;
  let baselineHeight = 0;

  const placeBlock = (b: Block) => {
    elements.push(...translate(b, x, 0));
    baselineHeight = Math.max(baselineHeight, b.height);
    x += b.width;
  };

  // subject
  placeBlock(subjectBlock);
  // subject|predicate divider (crosses the baseline)
  const divX = x;
  elements.push(
    line(eid(), divX, -LAYOUT.dividerUp, divX, LAYOUT.dividerDown, 'solid', 'divider',
      undefined, subjectRel?.id),
  );
  x += 2;
  // predicate
  placeBlock(verbBlock);

  // complements on the baseline, each with the appropriate separator
  complementBlocks.forEach(({ rel, block }) => {
    const sepX = x;
    if (rel.type === 'predicateNominative' || rel.type === 'predicateAdjective') {
      // line leaning back toward the verb
      elements.push(
        line(eid(), sepX + 10, 0, sepX, -LAYOUT.separatorUp, 'solid', 'separator',
          undefined, rel.id),
      );
    } else {
      // vertical tick standing on the baseline (object)
      elements.push(
        line(eid(), sepX, 0, sepX, -LAYOUT.separatorUp, 'solid', 'separator',
          undefined, rel.id),
      );
    }
    x += 6;
    placeBlock(block);
  });

  const baselineWidth = x;

  // Adjuncts of the clause and of the verb hang below the baseline. Word-level
  // adjuncts (PPs, adverbials) flow in a horizontal row; clause-level adjuncts
  // (subordinate/complement/coordinate clauses) are tall and stack vertically
  // on a stem below that row, so nothing fans out across the page.
  const adjunctRels = [
    ...rels.filter((r) => r !== subjectRel && r !== predicateRel),
    ...verbRels.filter((r) => !isBaselineComplement(r)),
  ];
  const wordAdjuncts = adjunctRels.filter((r) => !isClauseChild(ctx, r.dependentId));
  const clauseAdjuncts = adjunctRels.filter((r) => isClauseChild(ctx, r.dependentId));

  const belowTop = baselineHeight + LAYOUT.adjunctDrop;
  let belowMaxBottom = belowTop;
  let rowRight = baselineWidth;
  // Verb adjuncts cascade to the right of the verb, each attaching at its OWN
  // point along the baseline with a short local connector — rather than fanning
  // out from a single point, which produces long crossing lines. The baseline
  // is extended rightward to carry those attachment points.
  let bx = baselineWidth + LAYOUT.dependentGap;
  let railRight = baselineWidth;
  wordAdjuncts.forEach((r) => {
    const block = layoutNode(ctx, r.dependentId, seen);
    elements.push(...translate(block, bx, belowTop));
    const stem = STEM_ROLES.includes(r.type);
    // Attach above the adjunct's own head, so the connector stays short. A PP
    // drops on a near-vertical stem; an adverbial leans on a slant.
    const attachX = bx + block.wordLeft;
    const headCenter = bx + (block.wordLeft + block.wordRight) / 2;
    elements.push(
      line(
        eid(),
        attachX,
        0,
        stem ? headCenter : attachX + LAYOUT.slantRun,
        belowTop,
        'solid',
        stem ? 'stem' : 'slant',
        undefined,
        r.id,
      ),
    );
    if (r.label && showLabel(ctx, r.dependentId)) {
      elements.push(
        smallText(eid(), attachX + 4, belowTop - 6, r.label, 'start', r.id),
      );
    }
    railRight = Math.max(railRight, attachX);
    bx += block.width + LAYOUT.dependentGap;
    rowRight = Math.max(rowRight, bx);
    belowMaxBottom = Math.max(belowMaxBottom, belowTop + block.height);
  });
  // Extend the baseline to carry the adjunct attachment points.
  if (wordAdjuncts.length) {
    elements.push(line(eid(), baselineWidth, 0, railRight, 0, 'solid', 'baseline'));
  }

  let width = Math.max(baselineWidth, rowRight);
  let height = Math.max(baselineHeight, wordAdjuncts.length ? belowMaxBottom : 0);

  if (clauseAdjuncts.length) {
    const spineX = Math.max(0, divX);
    const stackTop = (wordAdjuncts.length ? belowMaxBottom : baselineHeight) + LAYOUT.adjunctDrop;
    elements.push(line(eid(), divX, LAYOUT.dividerDown, spineX, stackTop, 'dotted', 'stem'));
    const stack = stackClauses(ctx, clauseAdjuncts, seen, spineX, stackTop);
    elements.push(...stack.elements);
    width = Math.max(width, stack.right);
    height = Math.max(height, stack.bottom);
  }

  return { width, height, elements, wordLeft: 0, wordRight: baselineWidth };
}

// --- helpers ------------------------------------------------------------------

function isClauseChild(ctx: Ctx, nodeId: string): boolean {
  return getNode(ctx.doc.syntax, nodeId)?.kind === 'clause';
}

/**
 * Show a connector label only when it adds information — i.e. the dependent is
 * a clause or an implied/empty element. For a normal word the label would just
 * duplicate the word already drawn (e.g. a preposition), so it is suppressed.
 */
function showLabel(ctx: Ctx, nodeId: string): boolean {
  const node = getNode(ctx.doc.syntax, nodeId);
  if (!node) return true;
  return node.kind === 'clause' || Boolean(node.implied) || nodeText(ctx.doc, node) === '';
}

function impliedBlock(label: string): Block {
  const w = measureText(label) + LAYOUT.wordPadX * 2;
  return {
    width: w,
    height: 0,
    wordLeft: 0,
    wordRight: w,
    elements: [
      line(eid(), 0, 0, w, 0, 'solid', 'baseline'),
      {
        kind: 'text',
        id: eid(),
        x: w / 2,
        y: -LAYOUT.textRise,
        text: label,
        anchor: 'middle',
        italic: true,
        muted: true,
      },
    ],
  };
}

function line(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: LineElement['style'],
  role: LineElement['role'],
  nodeId?: string,
  relationId?: string,
): LineElement {
  return { kind: 'line', id, x1, y1, x2, y2, style, role, nodeId, relationId };
}

function wordText(
  id: string,
  x: number,
  y: number,
  text: string,
  anchor: TextElement['anchor'],
  node: SyntaxNode,
): TextElement {
  return {
    kind: 'text',
    id,
    x,
    y,
    text,
    anchor,
    muted: node.implied,
    nodeId: node.id,
  };
}

function smallText(
  id: string,
  x: number,
  y: number,
  text: string,
  anchor: TextElement['anchor'],
  relationId?: string,
): TextElement {
  return { kind: 'text', id, x, y, text, anchor, small: true, italic: true, relationId };
}
