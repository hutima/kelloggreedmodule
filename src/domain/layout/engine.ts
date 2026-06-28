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

  // Every dependent of a word hangs beneath it (modifiers, prepositional
  // objects, embedded clauses). Listing them all — rather than an allow-list of
  // roles — means new relation types render without touching the engine.
  const depRels = collapsed ? [] : childRelations(ctx.doc.syntax, node.id);

  const depBlocks = depRels.map((r) => ({
    rel: r,
    block: layoutNode(ctx, r.dependentId, seen),
  }));

  const depTotalW =
    depBlocks.reduce((s, d) => s + d.block.width, 0) +
    Math.max(0, depBlocks.length - 1) * LAYOUT.dependentGap;

  const width = Math.max(wordW, depTotalW);
  const center = width / 2;
  const wordLeft = center - wordW / 2;
  const wordRight = center + wordW / 2;

  const elements: DiagramElement[] = [];
  // The head word sits on its own short baseline so children can attach to it.
  elements.push(line(eid(), wordLeft, 0, wordRight, 0, 'solid', 'baseline', node.id));
  elements.push(
    wordText(eid(), center, -LAYOUT.textRise, text, 'middle', node),
  );

  // Lay dependents left-to-right beneath, each joined by a slant/stem.
  let cursor = center - depTotalW / 2;
  const depTop = LAYOUT.slantDrop;
  let maxDepHeight = 0;
  depBlocks.forEach(({ rel, block }, i) => {
    const dx = cursor;
    elements.push(...translate(block, dx, depTop));
    // Connector from head baseline to the dependent's word.
    const childCenter = dx + block.width / 2;
    const attachX = clampAttach(wordLeft, wordRight, center, i, depBlocks.length);
    const clauseChild = isClauseChild(ctx, rel.dependentId);
    const stem = clauseChild || STEM_ROLES.includes(rel.type);
    elements.push(
      line(
        eid(),
        attachX,
        0,
        stem ? childCenter : dx + block.wordLeft + LAYOUT.slantRun,
        depTop,
        clauseChild ? 'dotted' : 'solid',
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

  return {
    width,
    height: depBlocks.length ? depTop + maxDepHeight : 0,
    elements,
    wordLeft,
    wordRight,
  };
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

  // Complements live under the verb node but render on the baseline.
  const verbRels = predicateRel ? childRelations(model, predicateRel.dependentId) : [];
  const complementRels = verbRels.filter((r) => BASELINE_COMPLEMENTS.includes(r.type));
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

  // Adjuncts of the clause (PPs, adverbials, subordinate clauses) and of the
  // verb hang below the baseline, connected by stems from the verb region.
  const adjunctRels = [
    ...rels.filter((r) => r !== subjectRel && r !== predicateRel),
    ...verbRels.filter((r) => !BASELINE_COMPLEMENTS.includes(r.type)),
  ];

  const belowTop = baselineHeight + LAYOUT.adjunctDrop;
  let belowMaxBottom = belowTop;
  let bx = Math.max(0, divX);
  adjunctRels.forEach((r) => {
    const block = layoutNode(ctx, r.dependentId, seen);
    elements.push(...translate(block, bx, belowTop));
    const childCenter = bx + block.width / 2;
    elements.push(
      line(eid(), divX + 4, LAYOUT.dividerDown, childCenter, belowTop, 'dotted', 'stem',
        undefined, r.id),
    );
    if (r.label && showLabel(ctx, r.dependentId)) {
      elements.push(
        smallText(eid(), (divX + childCenter) / 2, belowTop - 6, r.label, 'middle', r.id),
      );
    }
    bx += block.width + LAYOUT.dependentGap * 1.5;
    belowMaxBottom = Math.max(belowMaxBottom, belowTop + block.height);
  });

  const width = Math.max(baselineWidth, bx);
  const height = Math.max(baselineHeight, adjunctRels.length ? belowMaxBottom : 0);
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
