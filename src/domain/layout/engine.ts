import type { KrDocument, LayoutHints, Relation, SyntacticRole, SyntaxNode } from '@/domain/schema';
import { childRelations, getNode, nodeText } from '@/domain/model';
import { LAYOUT } from './constants';
import { measureText, SMALL_FONT } from './measure';
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
  /** For a clause block: the x of its predicate verb, so coordinated clauses can
   *  be joined verb-to-verb (the compound-sentence convention). */
  verbX?: number;
}

// Complements that sit ON the main line with a separator. The INDIRECT object is
// deliberately NOT here: in Reed-Kellogg it hangs BELOW the verb on a slanted
// line (a stem to its own short baseline), distinct from the direct object's
// upright tick on the baseline.
const BASELINE_COMPLEMENTS: SyntacticRole[] = [
  'directObject',
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
  const objRel = childRelations(ctx.doc.syntax, rel.dependentId).find(
    (r) => r.type === 'prepositionObject',
  );
  if (!objRel) return null;
  // A preposition governing an object always rides the diagonal — whether it is
  // tagged `prepositionalPhrase` (a PP modifying a noun) or attached to the verb
  // as an `adverbial` (an adverbial PP, e.g. ἐν ἀγάπῃ → ἐν on the slant, ἀγάπῃ on
  // the horizontal below).
  const node = getNode(ctx.doc.syntax, rel.dependentId);
  const tok = node?.tokenIds.length ? ctx.doc.tokens.find((t) => t.id === node.tokenIds[0]) : undefined;
  if (rel.type === 'prepositionalPhrase' || tok?.pos === 'preposition') return objRel.dependentId;
  return null;
}

/** The object node a preposition node governs (its `prepositionObject`), if any. */
function prepObjectOf(ctx: Ctx, prepNodeId: string): string | null {
  return (
    childRelations(ctx.doc.syntax, prepNodeId).find((r) => r.type === 'prepositionObject')
      ?.dependentId ?? null
  );
}

/**
 * The conjunct PP members of a coordinated preposition node — e.g. ἐπὶ τῆς γῆς,
 * a conjunct of ἐν τοῖς οὐρανοῖς in "ἐν τοῖς οὐρανοῖς καὶ ἐπὶ τῆς γῆς". Only
 * conjuncts that are themselves prepositions (carry their own object) qualify;
 * an empty list means this is a plain (uncoordinated) PP.
 */
function ppConjunctRels(ctx: Ctx, prepNodeId: string) {
  return wordConjunctRels(ctx, prepNodeId).filter((r) => !!prepObjectOf(ctx, r.dependentId));
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

/** POS of a word node, if it carries one token. */
function wordPos(ctx: Ctx, nodeId: string): string | undefined {
  const node = getNode(ctx.doc.syntax, nodeId);
  if (!node || node.kind !== 'word' || !node.tokenIds.length) return undefined;
  return ctx.doc.tokens.find((t) => t.id === node.tokenIds[0])?.pos;
}

/**
 * A coordination whose head and conjuncts are all diagonal modifiers
 * (adjectives / adverbs): "tall and distinguished", "little and old". Drawn as
 * parallel slants joined by a dashed coordinator bar, rather than the horizontal
 * two-prong fork used for coordinated nouns.
 */
function isDiagonalCoordination(ctx: Ctx, nodeId: string): boolean {
  const node = getNode(ctx.doc.syntax, nodeId);
  if (!node || node.kind !== 'word') return false;
  const conj = wordConjunctRels(ctx, nodeId);
  if (!conj.length) return false;
  const pos = wordPos(ctx, nodeId);
  if (!pos || !DIAGONAL_POS.has(pos)) return false;
  return conj.every((r) => {
    const cp = wordPos(ctx, r.dependentId);
    return !!cp && DIAGONAL_POS.has(cp);
  });
}

/** Draw a coordination of adjective/adverb modifiers as parallel slants. */
function drawDiagonalCoordination(
  ctx: Ctx,
  nodeId: string,
  attachX: number,
  out: DiagramElement[],
): { bottom: number; right: number } {
  const node = getNode(ctx.doc.syntax, nodeId)!;
  const conjunctRels = wordConjunctRels(ctx, nodeId);
  const coordRel = childRelations(ctx.doc.syntax, nodeId).find((r) => r.type === 'coordinator');
  const coordText = coordRel
    ? nodeText(ctx.doc, getNode(ctx.doc.syntax, coordRel.dependentId)!) || ''
    : '';
  const members = [node, ...conjunctRels.map((r) => getNode(ctx.doc.syntax, r.dependentId)!)];

  let bottom = 0;
  let right = attachX;
  const starts: number[] = [];
  let cx = attachX;
  for (const m of members) {
    starts.push(cx);
    const ext = drawDiagonalModifier(ctx, m, cx, 0, undefined, out);
    bottom = Math.max(bottom, ext.bottom);
    right = Math.max(right, ext.right);
    cx += LAYOUT.dependentGap * 1.4;
  }
  // The dashed coordinator bar bridges the first two parallel slants midway down,
  // the conjunction (and / καί) riding it between them.
  if (coordText && starts.length >= 2) {
    const angle = 57 / DEG;
    const d = diagLeafGeom('x').drop * 0.5;
    const dx = d / Math.tan(angle);
    const x0 = starts[0]! + dx;
    const x1 = starts[1]! + dx;
    out.push(line(eid(), x0, d, x1, d, 'dashed', 'coordination', node.id));
    out.push(smallText(eid(), (x0 + x1) / 2, d - 4, coordText, 'middle', coordRel?.id));
  }
  return { bottom, right };
}

/**
 * An infinitive (a bare infinitive word, or a clause whose predicate is one).
 * Diagrammed like a prepositional phrase: an (empty, in Greek) diagonal leading
 * down to a horizontal baseline that carries the infinitive and its complements —
 * the marker "to" rides the diagonal in English; a Greek infinitive is one word
 * sitting on the horizontal.
 */
function isInfinitival(ctx: Ctx, nodeId: string): boolean {
  const node = getNode(ctx.doc.syntax, nodeId);
  if (!node) return false;
  if (node.kind === 'word') return wordPos(ctx, nodeId) === 'infinitive';
  if (node.kind !== 'clause') return false;
  const pred = childRelations(ctx.doc.syntax, nodeId).find(
    (r) => r.type === 'predicate' || r.type === 'copula',
  );
  return pred ? wordPos(ctx, pred.dependentId) === 'infinitive' : false;
}

/**
 * Draw a dependent INFINITIVE phrase hanging from `attachX`: an empty diagonal
 * down to the infinitive's own horizontal baseline (the prepositional-phrase
 * shape, minus the preposition). Returns the rightmost x reached and the bottom.
 */
function drawInfinitive(
  ctx: Ctx,
  rel: { id: string; dependentId: string },
  attachX: number,
  topY: number,
  seen: Set<string>,
  out: DiagramElement[],
): { right: number; bottom: number } {
  const block = layoutNode(ctx, rel.dependentId, seen);
  const oTop = topY + blockAscent(block);
  const objX = attachX + LAYOUT.diagRun;
  const endX = objX + block.wordLeft;
  out.push(...translate(block, objX, oTop));
  out.push(line(eid(), attachX, 0, endX, oTop, 'solid', 'slant', undefined, rel.id));
  return { right: objX + block.width, bottom: Math.max(oTop + block.height, oTop) };
}

/**
 * Draw ONE prepositional phrase hanging from (`attachX`, 0): the preposition
 * written along a standard-angle slant down to its object's own horizontal
 * baseline. Returns the rightmost x reached, the lowest y, and the slant's
 * bottom (`oTop`, the object baseline) so callers can align a coordinator bar.
 */
function drawPp(
  ctx: Ctx,
  prepNodeId: string,
  objId: string,
  relId: string,
  attachX: number,
  topY: number,
  seen: Set<string>,
  out: DiagramElement[],
): { right: number; bottom: number; oTop: number } {
  const block = layoutNode(ctx, objId, seen);
  // Drop the slant deeper by the object's ascent so a COORDINATED object (whose
  // upper conjunct rises above its baseline) doesn't land back on the head line.
  const oTop = topY + blockAscent(block);
  const endX = attachX + slantRun(oTop);
  const objX = endX - block.wordLeft;
  out.push(...translate(block, objX, oTop));
  out.push(line(eid(), attachX, 0, endX, oTop, 'solid', 'slant', undefined, relId));
  const prep = nodeText(ctx.doc, getNode(ctx.doc.syntax, prepNodeId)!) || '';
  out.push(diagonalText(prep, attachX, 0, endX, oTop, relId, prepNodeId));
  return {
    right: objX + block.width,
    bottom: Math.max(oTop + block.height, diagonalDepth(attachX, 0, endX, oTop, prep)),
    oTop,
  };
}

/**
 * Draw a COORDINATION of prepositional phrases hanging from (`attachX`, 0) —
 * "ἐν τοῖς οὐρανοῖς καὶ ἐπὶ τῆς γῆς". Each conjunct PP is drawn like a lone PP
 * (preposition on its slant, object on a baseline below), set side by side, and
 * the first two slants are bridged by a dashed coordinator bar carrying the
 * conjunction (καί) — the Kellogg-Reed mark that the phrases are coordinate, not
 * nested. Without this the engine's PP fast-path would draw only the head PP's
 * object and silently drop the conjunct phrases.
 */
function drawPpCoordination(
  ctx: Ctx,
  headRel: { id: string; dependentId: string },
  headObjId: string,
  conjRels: { id: string; dependentId: string }[],
  attachX: number,
  topY: number,
  seen: Set<string>,
  out: DiagramElement[],
): { right: number; bottom: number } {
  const members = [
    { prepNodeId: headRel.dependentId, objId: headObjId, relId: headRel.id },
    ...conjRels.map((r) => ({
      prepNodeId: r.dependentId,
      objId: prepObjectOf(ctx, r.dependentId)!,
      relId: r.id,
    })),
  ];
  let cursor = attachX;
  let right = attachX;
  let bottom = topY;
  let minOTop = Infinity;
  const slants: number[] = [];
  for (const m of members) {
    slants.push(cursor);
    const ext = drawPp(ctx, m.prepNodeId, m.objId, m.relId, cursor, topY, seen, out);
    right = Math.max(right, ext.right);
    bottom = Math.max(bottom, ext.bottom);
    minOTop = Math.min(minOTop, ext.oTop);
    cursor = ext.right + LAYOUT.dependentGap;
  }
  const coordRel = childRelations(ctx.doc.syntax, headRel.dependentId).find(
    (r) => r.type === 'coordinator',
  );
  const coordText = coordRel
    ? nodeText(ctx.doc, getNode(ctx.doc.syntax, coordRel.dependentId)!) || ''
    : '';
  if (coordText && slants.length >= 2) {
    // Bridge the first two slants partway down, where both are still on the slant
    // (above their object baselines); the conjunction rides the bar.
    const d = minOTop * 0.55;
    const dx = slantRun(d);
    const x0 = slants[0]! + dx;
    const x1 = slants[1]! + dx;
    out.push(line(eid(), x0, d, x1, d, 'dashed', 'coordination', headRel.dependentId));
    out.push(smallText(eid(), (x0 + x1) / 2, d - 4, coordText, 'middle', coordRel?.id));
  }
  return { right, bottom };
}

/**
 * A closed-class modifier (article, adjective, adverb…) that is drawn ALONG a
 * diagonal — extended from `isDiagonalLeaf` to allow it to carry its OWN diagonal
 * modifiers (an adverb modifying an adjective: "very friendly"; an adverb
 * modifying an adverb: "quite often"). Those sub-modifiers hang as further
 * diagonals off the word, so a stack of qualifiers reads down a zig-zag of
 * slants rather than dropping onto a horizontal sub-baseline.
 */
function isDiagonalModifier(ctx: Ctx, nodeId: string): boolean {
  const pos = wordPos(ctx, nodeId);
  if (!pos || !DIAGONAL_POS.has(pos)) return false;
  return childRelations(ctx.doc.syntax, nodeId).every(
    (r) => r.type !== 'conjunct' && r.type !== 'coordinator' && isDiagonalModifier(ctx, r.dependentId),
  );
}

/**
 * Draw a diagonal modifier and, recursively, its own diagonal modifiers as
 * further slants hanging off its word. Returns the geometry's lowest/rightmost
 * extent so the caller can reserve room. Lines/text are pushed into `out`.
 */
function drawDiagonalModifier(
  ctx: Ctx,
  node: SyntaxNode,
  attachX: number,
  attachY: number,
  relId: string | undefined,
  out: DiagramElement[],
): { bottom: number; right: number } {
  const t = nodeText(ctx.doc, node) || node.label || '';
  const { run, drop } = diagLeafGeom(t);
  const endX = attachX + run;
  const endY = attachY + drop;
  out.push(line(eid(), attachX, attachY, endX, endY, 'solid', 'slant', undefined, relId));
  out.push(diagonalText(t, attachX, attachY, endX, endY, relId, node.id, DIAG_TEXT_FRAC));
  let bottom = diagonalDepth(attachX, attachY, endX, endY, t, DIAG_TEXT_FRAC);
  let right = endX + measureText(t) * 0.6;
  // Sub-modifiers hang off the word: a short right-angle jog off the parent slant
  // and then a parallel slant of the same angle, so each qualifier reads as its
  // own line ("very" under "friendly") rather than one long collinear streak.
  let cx = endX;
  for (const r of childRelations(ctx.doc.syntax, node.id)) {
    // Conjunct/coordinator children belong to the coordination drawing, not to
    // this word's own sub-modifier stack.
    if (r.type === 'conjunct' || r.type === 'coordinator') continue;
    const child = getNode(ctx.doc.syntax, r.dependentId);
    if (!child) continue;
    const jog = LAYOUT.diagRun * 0.5;
    out.push(line(eid(), cx, endY, cx + jog, endY, 'solid', 'slant', undefined, r.id));
    const sub = drawDiagonalModifier(ctx, child, cx + jog, endY, r.id, out);
    bottom = Math.max(bottom, sub.bottom);
    right = Math.max(right, sub.right);
    cx = cx + jog + LAYOUT.dependentGap;
  }
  return { bottom, right };
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
/**
 * The ONE slant angle every downward modifier diagonal uses, so all of them read
 * as parallel (an article, a possessive, a prepositional phrase's stem). Length
 * varies with the modifier; the angle never does.
 */
const SLANT_ANGLE = 57 / DEG;

/** Horizontal run of a standard-angle slant that drops by `drop`. */
function slantRun(drop: number): number {
  return drop / Math.tan(SLANT_ANGLE);
}

function diagLeafGeom(text: string): { run: number; drop: number } {
  const w = measureText(text);
  // The word sits between DIAG_TEXT_FRAC±half along the line; size the line so
  // that band (plus headroom for the upper end) is at least the word's length.
  const len = Math.max(LAYOUT.diagRun * 2, w + LAYOUT.fontSize * 1.4);
  return { run: len * Math.cos(SLANT_ANGLE), drop: len * Math.sin(SLANT_ANGLE) };
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

/**
 * How far a block's drawing rises ABOVE its baseline (y = 0). Most blocks sit at
 * or below the baseline, but a coordination fork lifts its upper conjunct into
 * negative y; stacking must reserve that room or the block pokes into the row
 * above. Returns ≥ 0.
 */
function blockAscent(block: Block): number {
  let minY = 0;
  for (const el of block.elements) {
    if (el.kind === 'line') minY = Math.min(minY, el.y1, el.y2);
    else if (el.kind === 'curve') minY = Math.min(minY, el.y1, el.cy, el.y2);
    else minY = Math.min(minY, el.y - (el.small ? LAYOUT.smallFontSize : LAYOUT.fontSize));
  }
  return Math.max(0, -minY);
}

function translate(block: Block, dx: number, dy: number): DiagramElement[] {
  return block.elements.map((el) => {
    if (el.kind === 'line') {
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    }
    if (el.kind === 'curve') {
      return {
        ...el,
        x1: el.x1 + dx, y1: el.y1 + dy,
        cx: el.cx + dx, cy: el.cy + dy,
        x2: el.x2 + dx, y2: el.y2 + dy,
      };
    }
    return { ...el, x: el.x + dx, y: el.y + dy };
  });
}

let uid = 0;
const eid = () => `el_${uid++}`;

export interface LayoutOptions {
  /** Row-spacing multiplier on vertical gaps (default 1). */
  verticalScale?: number;
  /**
   * Mirror the finished diagram horizontally so it reads RIGHT-TO-LEFT (Hebrew):
   * subject on the right, the baseline running leftward, modifiers slanting the
   * mirrored way. Defaults to true for `language: 'hbo'` documents. The geometry
   * is computed left-to-right exactly as for Greek/English and only the final
   * placement is flipped, so all the layout logic stays direction-agnostic.
   */
  rtl?: boolean;
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
  const width = maxX - minX + (m + pad) * 2;
  const height = maxY - minY + (m + pad) * 2;
  const placed = translate(block, m + pad - minX, m + pad - minY);
  const rtl = options.rtl ?? doc.language === 'hbo';
  return { width, height, elements: rtl ? mirrorX(placed, width) : placed };
}

/**
 * Mirror primitives horizontally about `width/2` for a right-to-left diagram.
 * Positions flip (x → width − x) and slants reverse (rotation negated), but the
 * GLYPHS are NOT mirrored — a Hebrew word is already shaped right-to-left by the
 * text engine, so only the diagram's layout direction changes. Text anchors swap
 * start↔end so left/right-aligned labels stay on their intended side.
 */
function mirrorX(elements: DiagramElement[], width: number): DiagramElement[] {
  return elements.map((el) => {
    if (el.kind === 'line') {
      return { ...el, x1: width - el.x1, x2: width - el.x2 };
    }
    if (el.kind === 'curve') {
      return { ...el, x1: width - el.x1, cx: width - el.cx, x2: width - el.x2 };
    }
    return {
      ...el,
      x: width - el.x,
      anchor: el.anchor === 'start' ? 'end' : el.anchor === 'end' ? 'start' : 'middle',
      rotate: el.rotate ? -el.rotate : el.rotate,
    };
  });
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
    } else if (el.kind === 'curve') {
      see(el.x1, el.y1);
      see(el.cx, el.cy);
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
  excludeApposition = false,
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
  // An infinitive phrase hangs as a modifier (empty diagonal + horizontal), not
  // as a stacked clause, so it is grouped with the word-level dependents.
  const allWordRels = depRels.filter(
    (r) => !isClauseChild(ctx, r.dependentId) || isInfinitival(ctx, r.dependentId),
  );
  // Appositives continue on the head's own baseline; everything else cascades
  // below as a modifier. (A coordination may instead hoist its summary apposition
  // onto a platform off the fork, so it can ask to exclude them here.)
  const apposRels = excludeApposition ? [] : allWordRels.filter((r) => r.type === 'apposition');
  // Light closed-class leaves (article, adjective, possessive) tuck in CLOSEST to
  // the head; heavy sub-baseline modifiers (a genitive NP, a prepositional
  // phrase) cascade out to the right after them. Without this an article ends up
  // stranded far to the right of its noun, past a long genitive chain, looking
  // detached (e.g. βασιλείαν … τὴν). Stable sort preserves order within a class.
  const isLeaf = (r: { type: SyntacticRole; dependentId: string }) =>
    r.type !== 'conjunct' && !prepObjectId(ctx, r) && isDiagonalModifier(ctx, r.dependentId);
  const wordRels = allWordRels
    .filter((r) => r.type !== 'apposition')
    .sort((a, b) => Number(isLeaf(b)) - Number(isLeaf(a)));
  const clauseRels = depRels.filter(
    (r) => isClauseChild(ctx, r.dependentId) && !isInfinitival(ctx, r.dependentId),
  );

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
    const ppConj = objId ? ppConjunctRels(ctx, rel.dependentId) : [];
    if (isInfinitival(ctx, rel.dependentId)) {
      // Infinitive phrase: empty diagonal to its own horizontal baseline.
      const ext = drawInfinitive(ctx, rel, cursor, depTop, seen, elements);
      railRight = Math.max(railRight, cursor);
      belowBottom = Math.max(belowBottom, ext.bottom);
      cursor = ext.right;
    } else if (objId && ppConj.length) {
      // Coordinated prepositional phrases ("ἐν τοῖς οὐρανοῖς καὶ ἐπὶ τῆς γῆς"):
      // every conjunct PP drawn side by side, joined by the coordinator.
      const ext = drawPpCoordination(ctx, rel, objId, ppConj, cursor, depTop, seen, elements);
      cursor = ext.right;
      railRight = Math.max(railRight, cursor);
      belowBottom = Math.max(belowBottom, ext.bottom);
    } else if (objId) {
      // Preposition written ALONG the diagonal; object on its baseline below. Drop
      // deeper by the object's ascent so a coordinated object clears the head line.
      // Extend the head's baseline over the PP's object (not merely to the
      // diagonal's attach point), so the object reads as hanging UNDER the head
      // instead of floating off the baseline's right end (e.g. ἀδελφοῖς … ἐν Χριστῷ).
      const ext = drawPp(ctx, rel.dependentId, objId, rel.id, cursor, depTop, seen, elements);
      cursor = ext.right;
      railRight = Math.max(railRight, cursor);
      belowBottom = Math.max(belowBottom, ext.bottom);
    } else if (rel.type !== 'conjunct' && isDiagonalCoordination(ctx, rel.dependentId)) {
      // Coordinated adjectives/adverbs ("tall and distinguished") as parallel slants.
      const ext = drawDiagonalCoordination(ctx, rel.dependentId, cursor, elements);
      railRight = Math.max(railRight, cursor);
      belowBottom = Math.max(belowBottom, ext.bottom);
      cursor = ext.right;
    } else if (rel.type !== 'conjunct' && isDiagonalModifier(ctx, rel.dependentId)) {
      // Closed-class modifier written ALONG its diagonal; no sub-baseline. It may
      // carry its own qualifier ("very friendly") as a further slant. The
      // run/drop scale to the word so a long possessive (ἡμῶν) hangs clear of
      // the head's baseline instead of clashing with it.
      const n2 = getNode(ctx.doc.syntax, rel.dependentId)!;
      const attachX = cursor;
      const ext = drawDiagonalModifier(ctx, n2, attachX, 0, rel.id, elements);
      railRight = Math.max(railRight, attachX);
      belowBottom = Math.max(belowBottom, ext.bottom);
      cursor = ext.right;
    } else {
      // A noun modifier / phrase keeps its own sub-baseline, hung on a stem.
      const block = layoutNode(ctx, rel.dependentId, seen);
      const oTop = depTop + blockAscent(block);
      const attachX = cursor;
      const objX = cursor + LAYOUT.diagRun;
      elements.push(...translate(block, objX, oTop));
      elements.push(line(eid(), attachX, 0, objX + block.wordLeft, oTop, 'solid', 'stem', undefined, rel.id));
      if (rel.label && showLabel(ctx, rel.dependentId)) {
        elements.push(smallText(eid(), attachX + 4, oTop - 6, rel.label, 'start', rel.id));
      }
      railRight = Math.max(railRight, attachX);
      belowBottom = Math.max(belowBottom, oTop + block.height);
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
    elements.push(line(eid(), spineX, 0, spineX, topY, 'dashed', 'stem'));
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
  // `cursorTop` is the highest y the next block may occupy; each block reserves
  // its own ASCENT above its baseline (a coordination fork raises its upper
  // conjunct above the baseline) so a tall member can't poke up into the row
  // above it.
  let cursorTop = topY + LAYOUT.clauseFirstDrop * ctx.vScale;
  let right = spineX;
  let bottom = topY;
  let lastBaselineY = topY;

  rels.forEach((r) => {
    const block = layoutNode(ctx, r.dependentId, seen);
    // A subordinator label (ὅτι, ἵνα, καθὼς…) rides the connector; lengthen it so
    // the label fits between the stem and the clause word instead of colliding.
    const labelled = r.label && showLabel(ctx, r.dependentId);
    const indent = labelled
      ? Math.max(LAYOUT.spineIndent, measureText(r.label!, SMALL_FONT) + 14)
      : LAYOUT.spineIndent;
    const blockX = spineX + indent;
    const y = cursorTop + blockAscent(block);
    elements.push(...translate(block, blockX, y));
    // Short connector from the stem to this clause's baseline.
    elements.push(
      line(eid(), spineX, y, blockX + block.wordLeft, y, 'dashed', 'stem', undefined, r.id),
    );
    if (labelled) {
      elements.push(smallText(eid(), (spineX + blockX) / 2, y - 6, r.label!, 'middle', r.id));
    }
    lastBaselineY = y;
    right = Math.max(right, blockX + block.width);
    bottom = Math.max(bottom, y + block.height);
    cursorTop = y + block.height + LAYOUT.clauseStackGap * ctx.vScale;
  });

  // The vertical stem itself, spanning from its top to the last clause.
  elements.unshift(line(eid(), spineX, topY, spineX, lastBaselineY, 'dashed', 'stem'));
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
  const nonClause = rels.filter((r) => !isClauseChild(ctx, r.dependentId));
  // Only a genuine coordinator (καί / δέ / τε…) rides the dashed bar between the
  // conjuncts. A word that is NOT a conjunct and NOT the coordinator — a
  // sentence-initial particle such as γε, or a stray introductory word — would
  // otherwise be swept onto the bar and written sideways, far from where it
  // stands (this was the missing initial γε in Phil 3:8). Those lead the spine on
  // their own stub instead (below), staying visible and selectable.
  const coordTexts = nonClause
    .filter((r) => r.type === 'coordinator')
    .map((r) => nodeText(ctx.doc, getNode(ctx.doc.syntax, r.dependentId)!) || '')
    .filter(Boolean);
  const leadRels = nonClause.filter((r) => r.type !== 'coordinator');

  // Lay every member out, then align their VERBS in one column so the dashed
  // connector runs verb-to-verb (the compound-sentence convention) rather than
  // joining the clauses at their left edge.
  const laid = memberRels.map((r) => ({ r, block: layoutNode(ctx, r.dependentId, seen) }));
  const vxOf = (b: Block) => b.verbX ?? b.wordLeft;
  const verbAlignX = laid.length ? Math.max(...laid.map(({ block }) => vxOf(block))) : 0;

  const elements: DiagramElement[] = [];
  const verbYs: number[] = [];
  let cursorTop = 0;
  let right = 0;
  let bottom = 0;

  for (const { r, block } of laid) {
    const blockX = verbAlignX - vxOf(block); // ≥ 0; verbs line up at verbAlignX
    const y = cursorTop + blockAscent(block);
    elements.push(...translate(block, blockX, y));
    // A subordinator that introduces a conjunct (Οὐχ ὅτι … / ἵνα …) sits on its
    // OWN short horizontal stub above the conjunct, unconnected to the spine —
    // the Kellogg-Reed home for an introductory "that".
    if (r.label && showLabel(ctx, r.dependentId)) {
      const stubW = measureText(r.label!, SMALL_FONT) + 12;
      const stubX = blockX;
      const stubY = y - LAYOUT.fontSize - 14;
      elements.push(smallText(eid(), stubX + stubW / 2, stubY - 4, r.label!, 'middle', r.id));
      elements.push(line(eid(), stubX, stubY, stubX + stubW, stubY, 'solid', 'baseline'));
    }
    verbYs.push(y);
    right = Math.max(right, blockX + block.width);
    bottom = Math.max(bottom, y + block.height);
    cursorTop = y + block.height + LAYOUT.clauseStackGap * ctx.vScale;
  }

  const top = verbYs[0] ?? 0;
  const last = verbYs[verbYs.length - 1] ?? 0;
  // The dashed bar runs verb-to-verb, tying the clauses together. It may pass
  // behind the verb-aligned words, but the paper-coloured halo under each word
  // (see the renderer) keeps them legible, so the bar stays a single clean line.
  elements.unshift(line(eid(), verbAlignX, top, verbAlignX, last, 'dashed', 'coordination', clause.id));
  // One coordinator per JOIN: the conjunction between clauses k and k+1 rides the
  // dashed bar in the gap between them (so three clauses joined by "καὶ … καὶ"
  // get a καὶ in each gap, not "καὶ καὶ" stacked in the first). It is centred on
  // the midpoint of the two VERB baselines — the bar runs down the clear verb
  // column (modifiers hang off to the right), so the join reads visually centred
  // between the two main lines rather than sinking toward the lower clause.
  for (let k = 0; k < laid.length - 1 && k < coordTexts.length; k++) {
    const midY = (verbYs[k]! + verbYs[k + 1]!) / 2;
    elements.push({
      kind: 'text', id: eid(), x: verbAlignX, y: midY, text: coordTexts[k]!,
      anchor: 'middle', small: true, rotate: -90,
    });
  }

  // Introductory words (a sentence-initial particle, a stray conjunction) lead
  // the construction on a short horizontal stub above the top of the spine,
  // joined to the bar — visible and selectable, the Kellogg-Reed home for a word
  // that introduces the whole compound rather than joining two of its members.
  if (leadRels.length) {
    const GAPW = 10;
    const blocks = leadRels.map((r) => layoutNode(ctx, r.dependentId, seen));
    const totalW = blocks.reduce((s, b) => s + b.width, 0) + GAPW * Math.max(0, blocks.length - 1);
    const leadY = top - LAYOUT.fontSize - 14;
    let x = Math.max(0, verbAlignX - GAPW - totalW);
    const leadStart = x;
    for (const b of blocks) {
      elements.push(...translate(b, x, leadY));
      right = Math.max(right, x + b.width);
      x += b.width + GAPW;
    }
    const lineY = leadY + 4;
    elements.push(line(eid(), leadStart, lineY, verbAlignX, lineY, 'solid', 'baseline'));
    elements.push(line(eid(), verbAlignX, lineY, verbAlignX, top, 'dashed', 'stem'));
  }

  // Expose the TOP of the spine bar as the block's connection point, at
  // (verbAlignX, 0): a spine hung off a parent stem (e.g. παυόμεθα's participial
  // object in Col 1:9) must reach the bar, not the empty top-left corner. Shift
  // the whole spine up so the first verb baseline sits at y = 0; the content
  // above it is then reserved by blockAscent like any other block.
  const shifted = translate({ width: right, height: bottom, elements, wordLeft: 0, wordRight: 0 }, 0, -top);
  return {
    width: right,
    height: bottom - top,
    elements: shifted,
    wordLeft: verbAlignX,
    wordRight: verbAlignX,
    verbX: verbAlignX,
  };
}

/**
 * A discourse container: several independent sentences shown one above another,
 * each its own full diagram with its verse reference floated above it. The
 * sentences are NOT connected — this is a reading aid, a passage on one canvas.
 */
function layoutDiscourse(
  ctx: Ctx,
  _clause: SyntaxNode,
  seen: Set<string>,
  rels: { id: string; type: SyntacticRole; dependentId: string }[],
): Block {
  const memberRels = rels.filter((r) => isClauseChild(ctx, r.dependentId));
  const elements: DiagramElement[] = [];
  let cursorTop = 0;
  let right = 0;
  let bottom = 0;

  for (const r of memberRels) {
    const node = getNode(ctx.doc.syntax, r.dependentId);
    const block = layoutNode(ctx, r.dependentId, seen);
    const ascent = blockAscent(block);
    const labelGap = LAYOUT.fontSize + 6;
    const y = cursorTop + ascent + labelGap;
    if (node?.label) {
      elements.push(smallText(eid(), 0, y - ascent - 8, node.label, 'start', undefined));
    }
    elements.push(...translate(block, 0, y));
    right = Math.max(right, block.width);
    bottom = Math.max(bottom, y + block.height);
    cursorTop = y + block.height + LAYOUT.clauseStackGap * 2.4 * ctx.vScale;
  }

  return { width: right, height: bottom, elements, wordLeft: 0, wordRight: right };
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

  // An apposition to the WHOLE group ("τὰ τρία ταῦτα" summarising πίστις, ἐλπίς,
  // ἀγάπη) is hoisted onto a platform off the fork's bar, so it is excluded from
  // the head conjunct's own inline modifiers below.
  const apposRels = childRelations(ctx.doc.syntax, node.id).filter((r) => r.type === 'apposition');

  // Member 0 is the head word with its own (non-coordination) modifiers; the
  // rest are the conjunct subtrees.
  const members: Block[] = [
    layoutHead(ctx, node, seen, false, true, apposRels.length > 0),
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
      // A member is right-aligned by its FULL width, so when it carries
      // right-cascading modifiers (e.g. "Θεὸς … τοῦ Κυρίου ἡμῶν Ἰησοῦ Χριστοῦ")
      // the head word sits far left of the block edge where the prong attaches,
      // leaving the word visually detached from the fork. Extend the member's
      // baseline along the gap so the head connects to its prong.
      if (m.wordRight < m.width - 0.5) {
        elements.push(line(eid(), mx + m.wordRight, by, mx + m.width, by, 'solid', 'baseline'));
      }
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

  // A summary apposition hangs on its own platform off the bar that joins the
  // conjuncts, centred below the fork ("τὰ τρία ταῦτα" under faith/hope/love).
  // It stays WITHIN the fork's width so the block's connection point (the
  // junction) is unchanged — the parent's subject|predicate divider still
  // attaches at the junction, keeping the fork tied to its verb.
  let bottom = botY + lastMember.height;
  for (const ar of apposRels) {
    const ab = layoutNode(ctx, ar.dependentId, seen);
    if (!ab.elements.length) continue;
    const platTop = bottom + LAYOUT.adjunctDrop * ctx.vScale;
    const platY = platTop + blockAscent(ab);
    const span = ab.wordLeft + (ab.wordRight || ab.width);
    const baseStart = Math.max(0, Math.min(dashX - span / 2, width - ab.width));
    elements.push(...translate(ab, baseStart, platY));
    // Stem from the joining bar down to the platform baseline.
    elements.push(line(eid(), dashX, botY, dashX, platY, 'solid', 'stem', undefined, ar.id));
    bottom = platY + ab.height;
  }

  return {
    width,
    height: bottom,
    elements,
    wordLeft: junctionX,
    wordRight: junctionX,
  };
}

/**
 * A COMPOUND PREDICATE sharing one object ("proofreads and edits her essays"):
 * the baseline forks into the coordinated verbs and rejoins to a single point,
 * after which the shared complement continues on the line. Drawn as a fork with
 * a junction at BOTH ends (unlike layoutCoordination's single junction), so it
 * sits inline on the main baseline between the divider and the object.
 *
 * Returned block: baseline at y = 0 entering at the left junction and leaving at
 * the right junction (wordLeft = 0, wordRight = width); members straddle the line.
 */
function layoutCompoundPredicate(ctx: Ctx, verbNode: SyntaxNode, seen: Set<string>): Block {
  const conjunctRels = wordConjunctRels(ctx, verbNode.id);
  const coordRel = childRelations(ctx.doc.syntax, verbNode.id).find((r) => r.type === 'coordinator');
  const coordText = coordRel
    ? nodeText(ctx.doc, getNode(ctx.doc.syntax, coordRel.dependentId)!) || ''
    : '';

  // Bare verb words (their shared complements are drawn by the clause after the
  // fork; per-verb adverbials are uncommon and omitted from the fork members).
  const memberNodes = [verbNode, ...conjunctRels.map((r) => getNode(ctx.doc.syntax, r.dependentId)!)];
  const members = memberNodes.map((n) => layoutHead(ctx, n, seen, true));

  const gap = LAYOUT.coordMemberGap * ctx.vScale + LAYOUT.dividerUp;
  const ys: number[] = [];
  let yy = 0;
  members.forEach((m, i) => {
    ys.push(yy);
    if (i < members.length - 1) yy += m.height + gap;
  });
  const centerY = yy / 2;
  const prong = LAYOUT.coordProngRun;
  const maxW = Math.max(...members.map((m) => m.width));
  const leftX = 0;
  const rightX = prong + maxW + prong;
  const elements: DiagramElement[] = [];

  // Left-align every member and run each baseline to the SAME length (maxW), so
  // the left corners (where each diagonal prong meets its horizontal) line up in
  // one column — the coordinator's dashed bar drops cleanly through them.
  members.forEach((m, i) => {
    const by = ys[i]! - centerY;
    elements.push(...translate(m, prong, by));
    if (m.width < maxW) {
      elements.push(line(eid(), prong + m.width, by, prong + maxW, by, 'solid', 'baseline'));
    }
    elements.push(line(eid(), leftX, 0, prong, by, 'solid', 'coordination')); // left prong
    elements.push(line(eid(), prong + maxW, by, rightX, 0, 'solid', 'coordination')); // right prong
  });

  // Coordinator on the dashed bar joining the left corners, the conjunction
  // riding it in the throat of the fork (just left of the corner column).
  const topY = ys[0]! - centerY;
  const botY = ys[ys.length - 1]! - centerY;
  elements.push(line(eid(), prong, topY, prong, botY, 'dashed', 'coordination', verbNode.id));
  if (coordText) {
    elements.push({
      kind: 'text', id: eid(), x: prong - 7, y: (topY + botY) / 2, text: coordText,
      anchor: 'middle', small: true, rotate: -90, nodeId: coordRel?.dependentId,
    });
  }

  const lastBottom = botY + members[members.length - 1]!.height;
  return { width: rightX, height: lastBottom, elements, wordLeft: 0, wordRight: rightX };
}

// --- a clause baseline --------------------------------------------------------

function layoutClause(ctx: Ctx, clause: SyntaxNode, seen: Set<string>): Block {
  const model = ctx.doc.syntax;
  const rels = childRelations(model, clause.id);

  // A passage: independent sentences stacked, each labelled with its verse, not
  // tied together as a coordination.
  if (clause.clauseType === 'discourse') return layoutDiscourse(ctx, clause, seen, rels);

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

  // Complements live under the verb node but render on the baseline. A WORD
  // complement sits directly on the line; a CLAUSE complement (a noun clause as
  // direct object / subject / predicate nominative) is written on a PEDESTAL
  // standing in that slot above the line — the traditional Kellogg-Reed
  // treatment. A very tall embedded clause would tower over everything, so it
  // falls back to hanging below on a dotted stem instead.
  const verbRels = predicateRel ? childRelations(model, predicateRel.dependentId) : [];
  const isCoreSlot = (r: { type: SyntacticRole }) => BASELINE_COMPLEMENTS.includes(r.type);
  const isBaselineComplement = (r: { type: SyntacticRole; dependentId: string }) =>
    isCoreSlot(r) && !isClauseChild(ctx, r.dependentId);
  const complementRels = verbRels.filter(isBaselineComplement);
  const complementBlocks = complementRels.map((r) => ({
    rel: r,
    block: layoutNode(ctx, r.dependentId, seen),
  }));

  // Compact clause complements → pedestals; the rest defer to the stem below.
  // Probe each with a CLONED `seen` so measuring doesn't consume the node (it is
  // laid out for real at its draw site — the pedestal here, or stackClauses below).
  const pedestalRels: Relation[] = [];
  const pedestalled = new Set<string>();
  for (const r of verbRels) {
    if (!isCoreSlot(r) || !isClauseChild(ctx, r.dependentId)) continue;
    if (isInfinitival(ctx, r.dependentId)) continue; // infinitives hang on a diagonal
    const probe = layoutNode(ctx, r.dependentId, new Set(seen));
    if (probe.height + blockAscent(probe) <= LAYOUT.pedestalMaxHeight) {
      pedestalRels.push(r);
      pedestalled.add(r.id);
    }
  }

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
  // predicate — a compound predicate (proofreads AND edits) forks and rejoins so
  // the shared object continues from a single point past the fork.
  const verbIsCoord = !!verbNode && isWordCoordination(ctx, verbNode);
  const predBlock = verbIsCoord ? layoutCompoundPredicate(ctx, verbNode!, seen) : verbBlock;
  const verbX0 = x;
  placeBlock(predBlock);
  const verbMidX = verbX0 + (predBlock.wordRight || predBlock.width) / 2;

  // Adjuncts hang below the baseline on diagonals/stems. The verb's OWN
  // modifiers — an article substantivizing a participle (τοῖς οὖσιν…), an
  // adverb, an adverbial PP (σὺν ἐπισκόποις…) — belong directly beneath the
  // VERB, their KR home, rather than out in a right-hand row past the
  // complements where they would float free of their head. Clause-level word
  // adjuncts still cascade to the right of the baseline; clause-valued adjuncts
  // (subordinate/relative clauses) stack vertically on a dotted stem below.
  // The shared modifiers of a COMPOUND predicate hang below the whole fork: its
  // lower conjunct dips below the baseline, so a slant starting at the usual drop
  // would land its object right on top of that conjunct. Clear the fork's depth.
  const belowTop =
    (verbIsCoord ? predBlock.height + LAYOUT.slantDrop : LAYOUT.slantDrop) * ctx.vScale;
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
    if (isInfinitival(ctx, r.dependentId)) {
      // Infinitive phrase: empty diagonal down to its own horizontal baseline.
      const ext = drawInfinitive(ctx, r, attachX, belowTop, seen, elements);
      belowMaxBottom = Math.max(belowMaxBottom, ext.bottom);
      return { right: ext.right, next: ext.right + LAYOUT.dependentGap };
    }
    const objId = prepObjectId(ctx, r);
    const ppConj = objId ? ppConjunctRels(ctx, r.dependentId) : [];
    if (objId && ppConj.length) {
      // Coordinated adverbial PPs hanging from the verb ("ἐν … καὶ ἐπὶ …"): draw
      // every conjunct PP, joined by the coordinator, not just the first.
      const ext = drawPpCoordination(ctx, r, objId, ppConj, attachX, belowTop, seen, elements);
      belowMaxBottom = Math.max(belowMaxBottom, ext.bottom);
      return { right: ext.right, next: ext.right + LAYOUT.dependentGap };
    }
    if (objId) {
      // Preposition on the slant, object on a baseline below. The slant drops
      // deeper by the object's ascent so a COORDINATED object (ἀπὸ Θεοῦ … καὶ
      // Κυρίου …) whose upper conjunct rises above its baseline doesn't land back
      // on the main line.
      const ext = drawPp(ctx, r.dependentId, objId, r.id, attachX, belowTop, seen, elements);
      belowMaxBottom = Math.max(belowMaxBottom, ext.bottom);
      return { right: ext.right, next: ext.right + LAYOUT.dependentGap };
    }
    if (r.type !== 'conjunct' && isDiagonalCoordination(ctx, r.dependentId)) {
      const ext = drawDiagonalCoordination(ctx, r.dependentId, attachX, elements);
      belowMaxBottom = Math.max(belowMaxBottom, ext.bottom);
      return { right: ext.right, next: ext.right + LAYOUT.dependentGap };
    }
    if (r.type !== 'conjunct' && isDiagonalModifier(ctx, r.dependentId)) {
      const node2 = getNode(ctx.doc.syntax, r.dependentId)!;
      const ext = drawDiagonalModifier(ctx, node2, attachX, 0, r.id, elements);
      belowMaxBottom = Math.max(belowMaxBottom, ext.bottom);
      return { right: ext.right, next: ext.right + LAYOUT.dependentGap };
    }
    const block = layoutNode(ctx, r.dependentId, seen);
    const oTop = belowTop + blockAscent(block);
    const objX = attachX + LAYOUT.diagRun;
    elements.push(...translate(block, objX, oTop));
    elements.push(
      line(eid(), attachX, 0, objX + block.wordLeft, oTop, 'solid', 'stem', undefined, r.id),
    );
    if (r.label && showLabel(ctx, r.dependentId)) {
      elements.push(smallText(eid(), attachX + 4, oTop - 6, r.label, 'start', r.id));
    }
    belowMaxBottom = Math.max(belowMaxBottom, oTop + block.height);
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
        (!isClauseChild(ctx, r.dependentId) || isInfinitival(ctx, r.dependentId)),
    )
    .sort((a, b) => Number(!isDiagonalLeaf(ctx, a.dependentId)) - Number(!isDiagonalLeaf(ctx, b.dependentId)));

  // Clause-level adjuncts (not owned by the verb). A vocative (direct address)
  // and an interjection are NOT part of the clause's grammar — they float on
  // their own line above the diagram, unconnected — so they are handled apart.
  const clauseWordRels = rels.filter((r) => r !== subjectRel && r !== predicateRel);
  const floatingRels = clauseWordRels.filter(
    (r) => (r.type === 'vocative' || r.type === 'interjection') && !isClauseChild(ctx, r.dependentId),
  );
  const wordAdjuncts = clauseWordRels.filter(
    (r) =>
      (!isClauseChild(ctx, r.dependentId) || isInfinitival(ctx, r.dependentId)) &&
      r.type !== 'vocative' &&
      r.type !== 'interjection',
  );
  const clauseAdjuncts = [
    ...clauseWordRels.filter((r) => isClauseChild(ctx, r.dependentId) && !isInfinitival(ctx, r.dependentId)),
    // Clause complements that were pedestalled are drawn above the line, not here;
    // infinitives hang on their own diagonal among the verb modifiers.
    ...verbRels.filter(
      (r) =>
        !isBaselineComplement(r) &&
        isClauseChild(ctx, r.dependentId) &&
        !pedestalled.has(r.id) &&
        !isInfinitival(ctx, r.dependentId),
    ),
  ];

  let maxRight = x;
  // Draw the verb's modifiers FIRST, beneath the verb, and record how far right
  // their cascade reaches. The complements then start past that band: otherwise a
  // long adverbial PP hanging under the verb (ὑπὲρ τοῦ σώματος…) overlaps the
  // direct object's own genitive chain hanging below it on the baseline.
  let vModRight = x;
  // Hang the first modifier from the middle of the verb, but never so far left
  // that its diagonal text runs back over a SHORT verb (a one-word implied
  // copula like "(ἐστίν)"): keep the attach point past the verb word's right edge.
  let vCursor = Math.max(verbMidX, verbX0 + (predBlock.wordRight || predBlock.width) - LAYOUT.wordPadX);
  verbMods.forEach((r) => {
    const { right, next } = drawHanging(r, vCursor);
    vCursor = next;
    vModRight = Math.max(vModRight, right);
  });

  // Extend the baseline under the whole verb-modifier cascade so every modifier
  // visibly hangs from the MAIN LINE rather than from empty space (which reads as
  // "connected by vertical position"). When complements follow, they start past
  // the band so a long adverbial PP can't collide with the object's own
  // modifiers; the bridging baseline keeps the object reading as on the line.
  const hasBaselineSlot = complementBlocks.length > 0 || pedestalRels.length > 0;
  if (vModRight > x) {
    const newX = hasBaselineSlot ? vModRight + LAYOUT.dependentGap : vModRight;
    elements.push(line(eid(), x, 0, newX, 0, 'solid', 'baseline'));
    if (hasBaselineSlot) x = newX;
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

  // Noun-clause complements on pedestals, standing in their slot above the line.
  // (Their above-baseline extent is reserved by blockAscent wherever this clause
  // is later placed, since the pedestal elements live at negative y.)
  pedestalRels.forEach((rel) => {
    const block = layoutNode(ctx, rel.dependentId, seen);
    // If the clause was already laid out elsewhere (shared reference → `seen`
    // dedup returns an empty block), skip it: drawing a pedestal foot + riser for
    // empty content leaves an orphan "Y" with no baseline on top.
    if (!block.elements.length) return;
    // Object separator tick (the direct-object stem), then the pedestal foot a
    // little to its right.
    const sepX = x;
    elements.push(line(eid(), sepX, 0, sepX, -LAYOUT.separatorUp, 'solid', 'separator', undefined, rel.id));
    x += 6;
    const baseStart = x;
    // Embedded clause sits fully above the line; its baseline is high enough that
    // its own below-baseline modifiers clear the foot.
    const baseY = -(block.height + LAYOUT.pedestalFootRise + LAYOUT.pedestalGap);
    elements.push(...translate(block, baseStart, baseY));
    // Connect at the centre of the embedded clause's own baseline span.
    const connectX = baseStart + (block.wordLeft + (block.wordRight || block.width)) / 2;
    const apexY = -LAYOUT.pedestalFootRise;
    // The horizontal stretch of main line from the object stem out to the foot,
    // so the pedestal reads as THIS verb's direct object rather than a detached
    // "Y" floating off to the side.
    elements.push(line(eid(), sepX, 0, connectX, 0, 'solid', 'baseline', undefined, rel.id));
    // The little forked foot standing on the main line.
    elements.push(line(eid(), connectX - LAYOUT.pedestalFootHalf, 0, connectX, apexY, 'solid', 'stem'));
    elements.push(line(eid(), connectX + LAYOUT.pedestalFootHalf, 0, connectX, apexY, 'solid', 'stem'));
    // The riser up to the embedded clause's baseline.
    elements.push(line(eid(), connectX, apexY, connectX, baseY, 'solid', 'stem', undefined, rel.id));
    // The connecting word (that / ὅτι / ἵνα) rides the riser.
    if (rel.label && showLabel(ctx, rel.dependentId)) {
      elements.push(smallText(eid(), connectX + 5, (apexY + baseY) / 2, rel.label, 'start', rel.id));
    }
    x = baseStart + block.width;
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
    // A subordinate / adverbial clause modifies the VERB, so its dashed connector
    // drops from the verb (the subordinator rides it), not from the subject |
    // predicate divider — the Kellogg-Reed convention and what makes an adverbial
    // participle clause in Greek read as hanging off its governing verb.
    const originX = Math.max(0, verbMidX);
    const stackTop = Math.max(baselineHeight, belowMaxBottom) + LAYOUT.adjunctDrop * ctx.vScale;
    elements.push(line(eid(), originX, 0, originX, stackTop, 'dashed', 'stem'));
    const stack = stackClauses(ctx, clauseAdjuncts, seen, originX, stackTop);
    elements.push(...stack.elements);
    width = Math.max(width, stack.right);
    height = Math.max(height, stack.bottom);
  }

  // Direct address / interjection: each rides its own short line floating ABOVE
  // the clause, unconnected — it is outside the sentence's grammar.
  if (floatingRels.length) {
    let fy = -LAYOUT.dividerUp - LAYOUT.slantDrop;
    for (const r of floatingRels) {
      const block = layoutNode(ctx, r.dependentId, seen);
      elements.push(...translate(block, 0, fy));
      width = Math.max(width, block.width);
      fy -= block.height + LAYOUT.slantDrop;
    }
  }

  return { width, height, elements, wordLeft: 0, wordRight: baselineWidth, verbX: verbMidX };
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
