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

/**
 * If `rel` introduces a prepositional phrase, return the object node id so the
 * preposition can be written ON the diagonal (traditional Kellogg-Reed) and the
 * object laid out on its own horizontal baseline beneath it. Returns null for
 * anything that is not a `preposition + prepositionObject` shape.
 */
function prepObjectId(ctx: Ctx, rel: { type: SyntacticRole; dependentId: string }): string | null {
  if (rel.type !== 'prepositionalPhrase') return null;
  const objRel = childRelations(ctx.doc.syntax, rel.dependentId).find(
    (r) => r.type === 'prepositionObject',
  );
  return objRel ? objRel.dependentId : null;
}

/**
 * Closed-class / function words that are written ALONG a diagonal in the
 * traditional Kellogg-Reed style (articles, adjectives, adverbs, possessive
 * pronouns, particles, conjunctions, numerals). A NOUN used as a modifier
 * (e.g. an adnominal genitive, an appositive) instead gets its own horizontal
 * baseline, because it routinely carries further structure of its own.
 */
const DIAGONAL_POS = new Set([
  'adjective',
  'adverb',
  'article',
  'determiner',
  'particle',
  'conjunction',
  'numeral',
  'pronoun',
]);

function isDiagonalLeaf(ctx: Ctx, nodeId: string): boolean {
  const node = getNode(ctx.doc.syntax, nodeId);
  if (!node || node.kind !== 'word') return false;
  if (childRelations(ctx.doc.syntax, nodeId).length > 0) return false;
  const tok = node.tokenIds.length
    ? ctx.doc.tokens.find((t) => t.id === node.tokenIds[0])
    : undefined;
  return tok?.pos ? DIAGONAL_POS.has(tok.pos) : false;
}

/** The word-level `conjunct` members of a coordinated node (clauses excluded). */
function wordConjunctRels(ctx: Ctx, nodeId: string) {
  return childRelations(ctx.doc.syntax, nodeId).filter(
    (r) => r.type === 'conjunct' && !isClauseChild(ctx, r.dependentId),
  );
}

/** A word that heads a coordination of further words ("Paul and Timothy"). */
function isWordCoordination(ctx: Ctx, node: SyntaxNode): boolean {
  return node.kind === 'word' && wordConjunctRels(ctx, node.id).length > 0;
}

const DEG = 180 / Math.PI;

/**
 * Where along a leaf-modifier diagonal the word is centred. Pushing it past the
 * midpoint (toward the low end) keeps the word clear of the head's baseline —
 * which, for an appositive or coordinated head, runs horizontally right over the
 * diagonal's upper end. 0.5 = midpoint; >0.5 = nearer the bottom.
 */
const DIAG_TEXT_FRAC = 0.72;

/**
 * Geometry of a leaf-modifier diagonal carrying `text` (e.g. an article, a
 * possessive like ἡμῶν). The run is scaled to the word so a long modifier gets a
 * longer, less crowded slant, and the drop is grown to match so the word — set
 * low on the line (DIAG_TEXT_FRAC) — clears the head's baseline above it. Both
 * stay at least the constant minimums, so short words look exactly as before.
 */
function diagLeafGeom(text: string): { run: number; drop: number } {
  const w = measureText(text);
  // The word sits between DIAG_TEXT_FRAC±half along the line; size the line so
  // that band (plus headroom for the upper end) is at least the word's length.
  const len = Math.max(LAYOUT.diagRun * 2, w + LAYOUT.fontSize * 1.4);
  const angle = 57 / DEG; // consistent slant; steeper than a long shallow run
  return { run: len * Math.cos(angle), drop: len * Math.sin(angle) };
}

/** Text written along a diagonal, rotated to lie on the line from (x1,y1)→(x2,y2). */
function diagonalText(
  text: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  relationId?: string,
  nodeId?: string,
  frac = 0.5,
): TextElement {
  const angle = Math.atan2(y2 - y1, x2 - x1) * DEG;
  // Point `frac` of the way down the line, nudged just above it so the word
  // rests on the diagonal rather than straddling it.
  return {
    kind: 'text',
    id: eid(),
    x: x1 + (x2 - x1) * frac,
    y: y1 + (y2 - y1) * frac - 3,
    text,
    anchor: 'middle',
    rotate: angle,
    relationId,
    nodeId,
  };
}

/**
 * How far below the baseline (y = 0) a word written along the diagonal
 * (x1,y1)→(x2,y2) actually reaches. A long word on a steep diagonal overhangs
 * its endpoint, so the layout must reserve this much room or it runs into the
 * row below.
 */
function diagonalDepth(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  text: string,
  frac = 0.5,
): number {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const w = measureText(text);
  const midY = y1 + (y2 - y1) * frac - 3;
  const along = (w / 2) * Math.abs(Math.sin(angle)); // half the word, projected on y
  const across = LAYOUT.fontSize * 0.75 * Math.abs(Math.cos(angle)); // glyph ascent/descent
  return midY + along + across + 2;
}

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

export interface LayoutOptions {
  /** Row-spacing multiplier on vertical gaps (default 1). */
  verticalScale?: number;
}

export function layoutDocument(
  doc: KrDocument,
  hints: LayoutHints = {},
  options: LayoutOptions = {},
): DiagramLayout {
  uid = 0;
  const ctx: Ctx = { doc, hints, vScale: Math.max(0.5, options.verticalScale ?? 1) };
  const root = getNode(doc.syntax, doc.syntax.rootId);
  if (!root) return { width: 200, height: 80, elements: [] };

  const block = layoutNode(ctx, root.id, new Set());
  // Flag connectors for low-confidence (ambiguous) relations so both the canvas
  // and the export draw them in a distinct colour, inviting the user to relink.
  const tentative = new Set(
    doc.syntax.relations
      .filter((r) => r.provenance?.source === 'inferred' && r.provenance.confidence === 'low')
      .map((r) => r.id),
  );
  if (tentative.size) {
    for (const el of block.elements) {
      if (el.relationId && tentative.has(el.relationId)) el.tentative = true;
    }
  }
  const m = LAYOUT.margin;
  // Normalize by the true bounding box. Most content sits at/below the baseline,
  // but a coordination fork places its upper conjunct above it (negative y), so
  // a fixed offset is not enough — measure what was actually drawn and shift it
  // fully into view. `pad` leaves slack for text ascent/descent and for words
  // written along diagonals, which can overhang their line endpoints.
  const pad = LAYOUT.fontSize;
  const { minX, minY, maxX, maxY } = bounds(block.elements);
  const elements = translate(block, m + pad - minX, m + pad - minY);
  return {
    width: maxX - minX + (m + pad) * 2,
    height: maxY - minY + (m + pad) * 2,
    elements,
  };
}

/** Axis-aligned bounding box of a set of primitives (line endpoints + text anchors). */
function bounds(elements: DiagramElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  let seen = false;
  const see = (x: number, y: number) => {
    if (!seen) {
      minX = maxX = x;
      minY = maxY = y;
      seen = true;
      return;
    }
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const el of elements) {
    if (el.kind === 'line') {
      see(el.x1, el.y1);
      see(el.x2, el.y2);
    } else {
      see(el.x, el.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

interface Ctx {
  doc: KrDocument;
  hints: LayoutHints;
  /** Multiplier on vertical gaps (user-tunable row spacing). 1 = default. */
  vScale: number;
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
      : isWordCoordination(ctx, node)
        ? layoutCoordination(ctx, node, seen, false)
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
  excludeCoordination = false,
): Block {
  const text = nodeText(ctx.doc, node) || node.label || '∅';
  const wordW = measureText(text) + LAYOUT.wordPadX * 2;

  // Every dependent of a word hangs beneath it. Word/modifier dependents flow
  // horizontally in a row (adjectives, adverbs, prepositional phrases); clause
  // dependents (relative/complement clauses) are tall, so they stack vertically
  // on a shared stem instead — keeping the diagram narrow and untangled. When
  // this word heads a coordination, its conjunct/coordinator children are drawn
  // by the fork (layoutCoordination), so they are excluded here.
  const depRels = (collapsed ? [] : childRelations(ctx.doc.syntax, node.id)).filter(
    (r) => !excludeCoordination || (r.type !== 'conjunct' && r.type !== 'coordinator'),
  );
  const allWordRels = depRels.filter((r) => !isClauseChild(ctx, r.dependentId));
  // Appositives continue on the head's own baseline; everything else cascades
  // below as a modifier.
  const apposRels = allWordRels.filter((r) => r.type === 'apposition');
  // Light closed-class leaves (article, adjective, possessive) tuck in CLOSEST to
  // the head; heavy sub-baseline modifiers (a genitive NP, a prepositional
  // phrase) cascade out to the right after them. Without this an article ends up
  // stranded far to the right of its noun, past a long genitive chain, looking
  // detached (e.g. βασιλείαν … τὴν). Stable sort preserves order within a class.
  const isLeaf = (r: { type: SyntacticRole; dependentId: string }) =>
    r.type !== 'conjunct' && !prepObjectId(ctx, r) && isDiagonalLeaf(ctx, r.dependentId);
  const wordRels = allWordRels
    .filter((r) => r.type !== 'apposition')
    .sort((a, b) => Number(isLeaf(b)) - Number(isLeaf(a)));
  const clauseRels = depRels.filter((r) => isClauseChild(ctx, r.dependentId));

  const elements: DiagramElement[] = [];
  const depTop = LAYOUT.slantDrop * ctx.vScale;
  // The head word sits at the left of its baseline; modifiers cascade to the
  // right and hang below on diagonals, the way a Kellogg-Reed noun/verb carries
  // its modifiers. The baseline is extended rightward to reach them.
  const wordLeft = 0;
  const wordRight = wordW;
  elements.push(wordText(eid(), wordW / 2, -LAYOUT.textRise, text, 'middle', node));

  let cursor = wordW;
  let railRight = wordW;
  let belowBottom = 0; // absolute lowest y reached by any dependent

  // Appositives sit on the SAME baseline, immediately right of the head word.
  apposRels.forEach((rel) => {
    cursor += LAYOUT.wordPadX;
    const block = layoutNode(ctx, rel.dependentId, seen);
    elements.push(...translate(block, cursor, 0));
    belowBottom = Math.max(belowBottom, block.height);
    cursor += block.width;
    railRight = Math.max(railRight, cursor);
  });

  // A modifier hangs BELOW the head word, so its diagonal can start from the
  // middle of the word rather than after it — they share the baseline, so the
  // connection is unambiguous and the diagram stays narrower. (With appositives
  // present the baseline already extends right, so we start after them.)
  if (!apposRels.length) cursor = wordW / 2 - LAYOUT.dependentGap;

  wordRels.forEach((rel) => {
    cursor += LAYOUT.dependentGap;
    const objId = prepObjectId(ctx, rel);
    if (objId) {
      // Preposition written ALONG the diagonal; object on its baseline below.
      const block = layoutNode(ctx, objId, seen);
      const attachX = cursor;
      const objX = cursor + LAYOUT.diagRun;
      const endX = objX + block.wordLeft;
      elements.push(...translate(block, objX, depTop));
      elements.push(line(eid(), attachX, 0, endX, depTop, 'solid', 'slant', undefined, rel.id));
      const prep = nodeText(ctx.doc, getNode(ctx.doc.syntax, rel.dependentId)!) || '';
      elements.push(diagonalText(prep, attachX, 0, endX, depTop, rel.id, rel.dependentId));
      railRight = Math.max(railRight, attachX);
      belowBottom = Math.max(belowBottom, depTop + block.height, diagonalDepth(attachX, 0, endX, depTop, prep));
      cursor = objX + block.width;
    } else if (rel.type !== 'conjunct' && isDiagonalLeaf(ctx, rel.dependentId)) {
      // Closed-class modifier written ALONG its diagonal; no sub-baseline. The
      // run/drop scale to the word so a long possessive (ἡμῶν) hangs clear of
      // the head's baseline instead of clashing with it.
      const n2 = getNode(ctx.doc.syntax, rel.dependentId)!;
      const t = nodeText(ctx.doc, n2) || n2.label || '';
      const { run, drop } = diagLeafGeom(t);
      const attachX = cursor;
      const endX = cursor + run;
      elements.push(line(eid(), attachX, 0, endX, drop, 'solid', 'slant', undefined, rel.id));
      elements.push(diagonalText(t, attachX, 0, endX, drop, rel.id, rel.dependentId, DIAG_TEXT_FRAC));
      railRight = Math.max(railRight, attachX);
      belowBottom = Math.max(belowBottom, diagonalDepth(attachX, 0, endX, drop, t, DIAG_TEXT_FRAC));
      cursor = endX + measureText(t) * 0.6;
    } else {
      // A noun modifier / phrase keeps its own sub-baseline, hung on a stem.
      const block = layoutNode(ctx, rel.dependentId, seen);
      const attachX = cursor;
      const objX = cursor + LAYOUT.diagRun;
      elements.push(...translate(block, objX, depTop));
      elements.push(line(eid(), attachX, 0, objX + block.wordLeft, depTop, 'solid', 'stem', undefined, rel.id));
      if (rel.label && showLabel(ctx, rel.dependentId)) {
        elements.push(smallText(eid(), attachX + 4, depTop - 6, rel.label, 'start', rel.id));
      }
      railRight = Math.max(railRight, attachX);
      belowBottom = Math.max(belowBottom, depTop + block.height);
      cursor = objX + block.width;
    }
  });

  // The head's baseline, extended to carry appositives and modifier diagonals.
  elements.unshift(line(eid(), 0, 0, Math.max(wordW, railRight), 0, 'solid', 'baseline', node.id));

  const rowHeight = allWordRels.length ? belowBottom : 0;

  // Clause dependents stack vertically on a stem dropping from the head word.
  let bottom = rowHeight;
  let right = Math.max(cursor, wordW);
  if (clauseRels.length) {
    const spineX = wordW / 2;
    const topY = (rowHeight > 0 ? rowHeight : 0) + LAYOUT.adjunctDrop * ctx.vScale;
    const stack = stackClauses(ctx, clauseRels, seen, spineX, topY);
    elements.push(line(eid(), spineX, 0, spineX, topY, 'dotted', 'stem'));
    elements.push(...stack.elements);
    bottom = Math.max(bottom, stack.bottom);
    right = Math.max(right, stack.right);
  }

  return {
    width: right,
    height: allWordRels.length || clauseRels.length ? bottom : 0,
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
  let y = topY + LAYOUT.clauseFirstDrop * ctx.vScale;
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
    y += block.height + LAYOUT.clauseStackGap * ctx.vScale;
  });

  // The vertical stem itself, spanning from its top to the last clause.
  elements.unshift(line(eid(), spineX, topY, spineX, lastBaselineY, 'dotted', 'stem'));
  return { elements, right, bottom };
}

/**
 * Render a HEADLESS clause — one with no subject/predicate of its own, only
 * clause-valued members — as a Kellogg-Reed coordination spine: the member
 * clauses stack vertically, each joined to a shared vertical bar, with the
 * coordinator (καί / εἴτε / and …) written on the bar between them. This is how a
 * compound sentence ("ὃς ἐρύσατο … καὶ μετέστησεν") is drawn, and it avoids the
 * spurious empty "(subject)|(verb)" baseline a normal clause layout would print.
 *
 * The block's `wordLeft`/`wordRight` are the spine itself, so a parent connector
 * lands cleanly on the bar that ties the whole coordination together.
 */
function layoutClauseSpine(
  ctx: Ctx,
  clause: SyntaxNode,
  seen: Set<string>,
  rels: { id: string; type: SyntacticRole; dependentId: string; label?: string }[],
): Block {
  const memberRels = rels.filter((r) => isClauseChild(ctx, r.dependentId));
  const coordTexts = rels
    .filter((r) => !isClauseChild(ctx, r.dependentId))
    .map((r) => nodeText(ctx.doc, getNode(ctx.doc.syntax, r.dependentId)!) || '')
    .filter(Boolean);

  const spineX = 0;
  const blockX = spineX + LAYOUT.spineIndent;
  const elements: DiagramElement[] = [];
  const baselineYs: number[] = [];
  let y = 0;
  let right = blockX;
  let bottom = 0;

  memberRels.forEach((r, i) => {
    const block = layoutNode(ctx, r.dependentId, seen);
    elements.push(...translate(block, blockX, y));
    // A solid connector from the spine to this member's baseline — the join is
    // drawn explicitly, never left to be inferred from vertical position.
    elements.push(
      line(eid(), spineX, y, blockX + block.wordLeft, y, 'solid', 'connector', undefined, r.id),
    );
    if (r.label && showLabel(ctx, r.dependentId)) {
      elements.push(smallText(eid(), spineX + 6, y - 6, r.label, 'start', r.id));
    }
    baselineYs.push(y);
    right = Math.max(right, blockX + block.width);
    bottom = Math.max(bottom, y + block.height);
    if (i < memberRels.length - 1) y += block.height + LAYOUT.clauseStackGap * ctx.vScale;
  });

  const top = baselineYs[0] ?? 0;
  const last = baselineYs[baselineYs.length - 1] ?? 0;
  // The dashed coordination bar tying the members together.
  elements.unshift(line(eid(), spineX, top, spineX, last, 'dashed', 'coordination', clause.id));
  // Coordinator(s) ride the bar, upright, centred between the members.
  if (coordTexts.length && baselineYs.length >= 2) {
    elements.push({
      kind: 'text',
      id: eid(),
      x: spineX - 7,
      y: (top + last) / 2,
      text: coordTexts.join(' '),
      anchor: 'middle',
      small: true,
      rotate: -90,
    });
  }

  return { width: right, height: bottom, elements, wordLeft: spineX, wordRight: spineX };
}

// --- a coordinated set of words (the two-prong fork) --------------------------

/**
 * Render a word-level coordination ("Paul and Timothy", "overseers and
 * deacons") as the classic Kellogg-Reed fork: the conjuncts sit on parallel
 * horizontal baselines, joined at a single junction by prongs, with the
 * coordinator on a dashed bridge between them.
 *
 * `openLeft` controls which way the fork opens. A compound *subject* attaches
 * to the divider on its right, so its junction is on the right (openLeft);
 * a coordinated object / modifier attaches on its left, so the junction is on
 * the left and the conjuncts fan out to the right.
 */
function layoutCoordination(
  ctx: Ctx,
  node: SyntaxNode,
  seen: Set<string>,
  openLeft: boolean,
): Block {
  const conjunctRels = wordConjunctRels(ctx, node.id);
  const coordRel = childRelations(ctx.doc.syntax, node.id).find((r) => r.type === 'coordinator');
  const coordText = coordRel
    ? nodeText(ctx.doc, getNode(ctx.doc.syntax, coordRel.dependentId)!) || ''
    : '';

  // Member 0 is the head word with its own (non-coordination) modifiers; the
  // rest are the conjunct subtrees.
  const members: Block[] = [
    layoutHead(ctx, node, seen, false, true),
    ...conjunctRels.map((r) => layoutNode(ctx, r.dependentId, seen)),
  ];

  // Stack the members top-to-bottom, leaving room for each one's own depth.
  const baselines: number[] = [];
  let y = 0;
  members.forEach((m, i) => {
    baselines.push(y);
    if (i < members.length - 1) y += m.height + LAYOUT.coordMemberGap * ctx.vScale + LAYOUT.dividerUp;
  });
  const lastBaseline = baselines[baselines.length - 1]!;
  const centerY = lastBaseline / 2; // junction sits at the vertical middle
  const prong = LAYOUT.coordProngRun;
  const elements: DiagramElement[] = [];

  const lastMember = members[members.length - 1]!;
  const topY = baselines[0]! - centerY;
  const botY = lastBaseline - centerY;

  let width: number;
  let junctionX: number;
  if (openLeft) {
    // Junction on the right; conjuncts extend left. Align by full block width so
    // a member that carries right-cascading modifiers (e.g. an appositive with a
    // genitive) stays inside the fork instead of overflowing past the junction.
    const maxWidth = Math.max(...members.map((m) => m.width));
    junctionX = prong + maxWidth;
    width = junctionX;
    members.forEach((m, i) => {
      const mx = junctionX - prong - m.width;
      const by = baselines[i]! - centerY;
      elements.push(...translate(m, mx, by));
      elements.push(line(eid(), junctionX, 0, mx + m.width, by, 'solid', 'coordination'));
    });
  } else {
    // Junction on the left; conjuncts extend right.
    junctionX = 0;
    width = prong + Math.max(...members.map((m) => m.width));
    members.forEach((m, i) => {
      const by = baselines[i]! - centerY;
      elements.push(...translate(m, prong, by));
      elements.push(line(eid(), 0, 0, prong + m.wordLeft, by, 'solid', 'coordination'));
    });
  }

  // The coordinator's dashed line is the full-height bar at the WIDE end of the
  // fork, joining the two prongs exactly where they meet the conjunct baselines
  // (the way a hand-drawn Kellogg-Reed fork bridges the branches). The
  // coordinator rides CENTRED on that bar, rotated upright and set into the open
  // throat of the fork — away from the conjunct words — so it never overlaps them.
  const dashX = openLeft ? junctionX - prong : prong;
  elements.push(line(eid(), dashX, topY, dashX, botY, 'dashed', 'coordination', node.id));
  if (coordText) {
    elements.push({
      kind: 'text',
      id: eid(),
      x: dashX + (openLeft ? 8 : -8),
      y: (topY + botY) / 2,
      text: coordText,
      anchor: 'middle',
      small: true,
      rotate: -90,
      nodeId: coordRel?.dependentId,
    });
  }

  return {
    width,
    height: botY + lastMember.height,
    elements,
    wordLeft: junctionX,
    wordRight: junctionX,
  };
}

// --- a clause baseline --------------------------------------------------------

function layoutClause(ctx: Ctx, clause: SyntaxNode, seen: Set<string>): Block {
  const model = ctx.doc.syntax;
  const rels = childRelations(model, clause.id);

  const subjectRel = rels.find((r) => r.type === 'subject');
  const predicateRel = rels.find((r) => r.type === 'predicate' || r.type === 'copula');

  // A HEADLESS clause — no subject and no predicate of its own — is a pure
  // coordination/container of (clause) children: the compound-sentence wrapper
  // the Lowfat converter produces for "ἐρύσατο … καὶ μετέστησεν". Rendering it as
  // a baseline would print an empty "(subject)|(verb)" line; instead draw the
  // members stacked on a shared spine with the coordinator on it. Only do this
  // when there ARE clause members (else fall through to the implied baseline,
  // which legitimately shows pro-drop / an elided copula).
  if (!subjectRel && !predicateRel && rels.some((r) => isClauseChild(ctx, r.dependentId))) {
    return layoutClauseSpine(ctx, clause, seen, rels);
  }

  // The verb is rendered as a bare word; the CLAUSE owns the verb's complements
  // (baseline) and adjuncts (below), so they are not drawn twice.
  const verbNode = predicateRel ? getNode(model, predicateRel.dependentId) : undefined;
  const verbBlock = verbNode
    ? layoutHead(ctx, verbNode, seen, true)
    : impliedBlock('(verb)');

  // A subjectless NONFINITE clause — a bare participle/infinitive (an adverbial
  // participle like καρποφοροῦντες, an articular participle, an infinitive) — has
  // no real or pro-drop subject; printing "(subject)" + a divider just clutters
  // it. Render the predicate as the head of its own little baseline instead. A
  // subjectless FINITE clause keeps "(subject)" — that genuinely shows pro-drop.
  const verbPos = verbNode ? firstTokenPos(ctx, verbNode) : undefined;
  const omitSubject = !subjectRel && (verbPos === 'participle' || verbPos === 'infinitive');

  // A compound subject forks open to the right, so its junction meets the
  // subject|predicate divider; everywhere else a coordination forks to the left.
  const subjectNode = subjectRel ? getNode(model, subjectRel.dependentId) : undefined;
  const subjectBlock = !subjectRel
    ? impliedBlock('(subject)')
    : subjectNode && isWordCoordination(ctx, subjectNode)
      ? layoutCoordination(ctx, subjectNode, seen, true)
      : layoutNode(ctx, subjectRel.dependentId, seen);

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

  // subject + subject|predicate divider (crosses the baseline) — unless this is a
  // bare nonfinite predicate, which stands alone with no subject side.
  let divX = 0;
  if (!omitSubject) {
    placeBlock(subjectBlock);
    divX = x;
    elements.push(
      line(eid(), divX, -LAYOUT.dividerUp, divX, LAYOUT.dividerDown, 'solid', 'divider',
        undefined, subjectRel?.id),
    );
    x += 2;
  }
  // predicate
  const verbX0 = x;
  placeBlock(verbBlock);
  const verbMidX = verbX0 + (verbBlock.wordRight || verbBlock.width) / 2;

  // Adjuncts hang below the baseline on diagonals/stems. The verb's OWN
  // modifiers — an article substantivizing a participle (τοῖς οὖσιν…), an
  // adverb, an adverbial PP (σὺν ἐπισκόποις…) — belong directly beneath the
  // VERB, their KR home, rather than out in a right-hand row past the
  // complements where they would float free of their head. Clause-level word
  // adjuncts still cascade to the right of the baseline; clause-valued adjuncts
  // (subordinate/relative clauses) stack vertically on a dotted stem below.
  const belowTop = LAYOUT.slantDrop * ctx.vScale;
  let belowMaxBottom = belowTop;

  // Draw one hanging modifier whose diagonal/stem meets the baseline at
  // `attachX`; returns the rightmost x it reached and where the next sibling
  // should attach. Three shapes: a prepositional phrase (prep on the slant,
  // object on a baseline below), a closed-class leaf written along its slant,
  // or a noun phrase on its own stem-hung baseline.
  const drawHanging = (
    r: { id: string; type: SyntacticRole; dependentId: string; label?: string },
    attachX: number,
  ): { right: number; next: number } => {
    const objId = prepObjectId(ctx, r);
    if (objId) {
      const block = layoutNode(ctx, objId, seen);
      const objX = attachX + LAYOUT.diagRun;
      const endX = objX + block.wordLeft;
      elements.push(...translate(block, objX, belowTop));
      const prep = nodeText(ctx.doc, getNode(ctx.doc.syntax, r.dependentId)!) || '';
      elements.push(line(eid(), attachX, 0, endX, belowTop, 'solid', 'slant', undefined, r.id));
      elements.push(diagonalText(prep, attachX, 0, endX, belowTop, r.id, r.dependentId));
      belowMaxBottom = Math.max(belowMaxBottom, belowTop + block.height,
        diagonalDepth(attachX, 0, endX, belowTop, prep));
      const right = objX + block.width;
      return { right, next: right + LAYOUT.dependentGap };
    }
    if (r.type !== 'conjunct' && isDiagonalLeaf(ctx, r.dependentId)) {
      const node2 = getNode(ctx.doc.syntax, r.dependentId)!;
      const t = nodeText(ctx.doc, node2) || node2.label || '';
      const { run, drop } = diagLeafGeom(t);
      const endX = attachX + run;
      elements.push(line(eid(), attachX, 0, endX, drop, 'solid', 'slant', undefined, r.id));
      elements.push(diagonalText(t, attachX, 0, endX, drop, r.id, r.dependentId, DIAG_TEXT_FRAC));
      belowMaxBottom = Math.max(belowMaxBottom, diagonalDepth(attachX, 0, endX, drop, t, DIAG_TEXT_FRAC));
      const right = endX + measureText(t) * 0.6;
      return { right, next: right + LAYOUT.dependentGap };
    }
    const block = layoutNode(ctx, r.dependentId, seen);
    const objX = attachX + LAYOUT.diagRun;
    elements.push(...translate(block, objX, belowTop));
    elements.push(
      line(eid(), attachX, 0, objX + block.wordLeft, belowTop, 'solid', 'stem', undefined, r.id),
    );
    if (r.label && showLabel(ctx, r.dependentId)) {
      elements.push(smallText(eid(), attachX + 4, belowTop - 6, r.label, 'start', r.id));
    }
    belowMaxBottom = Math.max(belowMaxBottom, belowTop + block.height);
    const right = objX + block.width;
    return { right, next: right + LAYOUT.dependentGap };
  };

  // Verb modifiers, beneath the verb. Narrow leaves (the article) first so they
  // sit closest under the verb word; wider phrases (the σὺν PP) follow.
  const verbMods = verbRels
    .filter(
      (r) =>
        !isBaselineComplement(r) &&
        r.type !== 'conjunct' &&
        r.type !== 'coordinator' &&
        !isClauseChild(ctx, r.dependentId),
    )
    .sort((a, b) => Number(!isDiagonalLeaf(ctx, a.dependentId)) - Number(!isDiagonalLeaf(ctx, b.dependentId)));

  // Clause-level adjuncts (not owned by the verb).
  const clauseWordRels = rels.filter((r) => r !== subjectRel && r !== predicateRel);
  const wordAdjuncts = clauseWordRels.filter((r) => !isClauseChild(ctx, r.dependentId));
  const clauseAdjuncts = [
    ...clauseWordRels.filter((r) => isClauseChild(ctx, r.dependentId)),
    ...verbRels.filter((r) => !isBaselineComplement(r) && isClauseChild(ctx, r.dependentId)),
  ];

  let maxRight = x;
  // Draw the verb's modifiers FIRST, beneath the verb, and record how far right
  // their cascade reaches. The complements then start past that band: otherwise a
  // long adverbial PP hanging under the verb (ὑπὲρ τοῦ σώματος…) overlaps the
  // direct object's own genitive chain hanging below it on the baseline.
  let vModRight = x;
  let vCursor = verbMidX;
  verbMods.forEach((r) => {
    const { right, next } = drawHanging(r, vCursor);
    vCursor = next;
    vModRight = Math.max(vModRight, right);
  });

  // Clear the verb-modifier band before the first complement, bridging the gap
  // with baseline so the object still reads as sitting on the main line.
  if (complementBlocks.length && vModRight + LAYOUT.dependentGap > x) {
    const newX = vModRight + LAYOUT.dependentGap;
    elements.push(line(eid(), x, 0, newX, 0, 'solid', 'baseline'));
    x = newX;
  }

  // complements on the baseline, each with the appropriate separator
  complementBlocks.forEach(({ rel, block }) => {
    const sepX = x;
    if (rel.type === 'predicateNominative' || rel.type === 'predicateAdjective') {
      // line leaning back toward the verb
      elements.push(
        line(eid(), sepX + 10, 0, sepX, -LAYOUT.separatorUp, 'solid', 'separator', undefined, rel.id),
      );
    } else {
      // vertical tick standing on the baseline (object)
      elements.push(
        line(eid(), sepX, 0, sepX, -LAYOUT.separatorUp, 'solid', 'separator', undefined, rel.id),
      );
    }
    x += 6;
    placeBlock(block);
  });

  const baselineWidth = x;
  maxRight = Math.max(maxRight, baselineWidth, vModRight);

  // Clause-level word adjuncts cascade to the right of the whole baseline.
  let bx = baselineWidth + LAYOUT.dependentGap;
  let railRight = baselineWidth;
  wordAdjuncts.forEach((r) => {
    railRight = Math.max(railRight, bx);
    const { right, next } = drawHanging(r, bx);
    bx = next;
    maxRight = Math.max(maxRight, right);
  });
  // Extend the baseline to carry the right-hand adjunct attachment points.
  if (wordAdjuncts.length) {
    elements.push(line(eid(), baselineWidth, 0, railRight, 0, 'solid', 'baseline'));
  }

  let width = Math.max(baselineWidth, maxRight);
  let height = Math.max(
    baselineHeight,
    wordAdjuncts.length || verbMods.length ? belowMaxBottom : 0,
  );

  if (clauseAdjuncts.length) {
    const spineX = Math.max(0, divX);
    const stackTop = Math.max(baselineHeight, belowMaxBottom) + LAYOUT.adjunctDrop * ctx.vScale;
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

/** Part of speech of a node's first token, if any (verb / participle / …). */
function firstTokenPos(ctx: Ctx, node: SyntaxNode): string | undefined {
  const tid = node.tokenIds[0];
  return tid ? ctx.doc.tokens.find((t) => t.id === tid)?.pos : undefined;
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
