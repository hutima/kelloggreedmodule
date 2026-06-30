import type { KrDocument, PartOfSpeech, SyntacticRole, SyntaxNode } from '@/domain/schema';
import { childRelations, getNode } from '@/domain/model';
import type { DiagramElement, DiagramLayout } from '../types';
import { LAYOUT, relationColor } from '../constants';
import { finalize, line, resetIds, text, width } from './builder';
import { SHORT_ROLE } from './dependency';

/**
 * CONSTITUENCY (phrase-structure) tree — the classic "S → NP VP" diagram, drawn
 * top-down with category nodes (S, NP, VP, PP…) as the internal branches and the
 * words only at the leaves, each under its part-of-speech tag.
 *
 * This is NOT the dependency tree: that one links word→word with no phrasal
 * nodes. We ESTIMATE the constituency from the one shared syntax graph by
 * combining the two paradigms the app already has —
 *   • the dependency grouping gives the spans (a head + its dependent subtree is
 *     a constituent), and
 *   • the Kellogg-Reed role semantics give the split + labels (subject/predicate
 *     ⇒ S → NP VP; objects hang under the verb ⇒ inside VP).
 * When the passage came from a source constituency tree (Nestle1904 Lowfat), the
 * authoritative `<wg>` category stamped on the head token (`morphology.extra.cat`)
 * OVERRIDES the POS estimate, so GNT trees match the published analysis.
 *
 * Presentation-only (read-only), like the Dependency Tree. Greek free word order
 * means a constituent's words can be discontinuous; siblings are ordered by their
 * subtree's earliest surface word, which keeps the common cases left-to-right.
 */

const ROOT_COLOR = '#5b6470';
const SLOT_GAP = 26;

/** Part of speech → terminal (leaf) tag. */
const POS_TAG: Partial<Record<PartOfSpeech, string>> = {
  noun: 'N',
  propernoun: 'N',
  pronoun: 'Pron',
  verb: 'V',
  participle: 'V',
  infinitive: 'V',
  adjective: 'Adj',
  adverb: 'Adv',
  article: 'Det',
  determiner: 'Det',
  preposition: 'P',
  conjunction: 'Conj',
  particle: 'Prt',
  interjection: 'Intj',
  numeral: 'Num',
  unknown: '–',
};

/** Part of speech → phrase category a head of that POS projects (the estimate). */
const POS_PHRASE: Partial<Record<PartOfSpeech, string>> = {
  noun: 'NP',
  propernoun: 'NP',
  pronoun: 'NP',
  verb: 'VP',
  participle: 'VP',
  infinitive: 'VP',
  preposition: 'PP',
  adjective: 'AdjP',
  adverb: 'AdvP',
  conjunction: 'ConjP',
  numeral: 'NP',
  article: 'DP',
  determiner: 'DP',
  particle: 'PrtP',
};

const CLAUSE_CAT: Record<NonNullable<SyntaxNode['clauseType']>, string> = {
  independent: 'S',
  coordinate: 'S',
  relative: 'S(rel)',
  complement: 'S(comp)',
  adverbial: 'S(adv)',
  participial: 'S(ptcp)',
  infinitival: 'S(inf)',
  discourse: '',
  unknown: 'S',
};

interface ConsNode {
  /** Category (S/NP/VP/PP/N/V/Det…) — '' for a bare container. */
  cat: string;
  /** Terminal surface (only for leaves). */
  word?: string;
  gloss?: string;
  nodeId?: string;
  implied?: boolean;
  /** Incoming relation type (for the branch label + colour); undefined at the root. */
  role?: SyntacticRole;
  /** Earliest surface index in the subtree, for ordering siblings. */
  order: number;
  children: ConsNode[];
}

export function layoutConstituency(doc: KrDocument): DiagramLayout {
  resetIds();

  const tokenById = new Map(doc.tokens.map((t) => [t.id, t]));
  const order = new Map(doc.tokens.map((t) => [t.id, t.index]));

  const subtreeOrder = (nodeId: string, seen: Set<string>): number => {
    if (seen.has(nodeId)) return Infinity;
    seen.add(nodeId);
    const n = getNode(doc.syntax, nodeId);
    if (!n) return Infinity;
    let m = n.tokenIds.length ? Math.min(...n.tokenIds.map((t) => order.get(t) ?? Infinity)) : Infinity;
    for (const r of childRelations(doc.syntax, nodeId)) m = Math.min(m, subtreeOrder(r.dependentId, seen));
    return m;
  };

  const phraseCat = (node: SyntaxNode): string => {
    const tok = node.tokenIds.length ? tokenById.get(node.tokenIds[0]!) : undefined;
    const fromSource = tok?.morphology?.extra?.cat; // gold-standard Lowfat <wg>
    if (fromSource) return fromSource;
    return (tok?.pos && POS_PHRASE[tok.pos]) || 'XP';
  };
  const posTag = (node: SyntaxNode): string => {
    const tok = node.tokenIds.length ? tokenById.get(node.tokenIds[0]!) : undefined;
    return (tok?.pos && POS_TAG[tok.pos]) || '–';
  };
  const surfaceOf = (node: SyntaxNode): string =>
    node.tokenIds
      .map((t) => tokenById.get(t))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .sort((a, b) => a.index - b.index)
      .map((t) => t.surface)
      .join(' ');
  const glossOf = (node: SyntaxNode): string | undefined =>
    node.tokenIds.length ? tokenById.get(node.tokenIds[0]!)?.gloss : undefined;

  const build = (nodeId: string, role: SyntacticRole | undefined, seen: Set<string>): ConsNode | undefined => {
    if (seen.has(nodeId)) return undefined;
    const next = new Set(seen).add(nodeId);
    const node = getNode(doc.syntax, nodeId);
    if (!node) return undefined;
    const ord = subtreeOrder(nodeId, new Set());
    const kids = childRelations(doc.syntax, nodeId)
      .map((r) => ({ child: build(r.dependentId, r.type, next), o: subtreeOrder(r.dependentId, new Set()) }))
      .filter((k): k is { child: ConsNode; o: number } => Boolean(k.child))
      .sort((a, b) => a.o - b.o);

    if (node.kind === 'clause') {
      // A clause is an S node; its members ARE its children (subject, VP, …).
      return { cat: CLAUSE_CAT[node.clauseType ?? 'unknown'], role, order: ord, nodeId, children: kids.map((k) => k.child) };
    }

    // A word leaf: its part-of-speech terminal (with the word + gloss beneath).
    const terminal: ConsNode = node.implied
      ? { cat: '∅', word: node.label ?? '(…)', implied: true, nodeId, order: ord, children: [] }
      : { cat: posTag(node), word: surfaceOf(node), gloss: glossOf(node), nodeId, order: ord, children: [] };

    // No dependents → the bare terminal IS the constituent (a lone N, V, …).
    if (!kids.length) return { ...terminal, role };

    // Dependents → a phrase (NP/VP/PP…) over the head terminal + the dependents,
    // laid out in surface order.
    const headChild: ConsNode = { ...terminal, role: undefined };
    const children = [...kids.map((k) => k.child), headChild].sort((a, b) => a.order - b.order);
    return { cat: phraseCat(node), role, order: ord, nodeId, children };
  };

  const tree = build(doc.syntax.rootId, undefined, new Set());
  if (!tree) return finalize([]);

  // ---- top-down tidy layout (measure widths, then place left-to-right) -------
  const ROW = Math.round(LAYOUT.fontSize * 3.1); // category → child gap
  const WORD_DROP = Math.round(LAYOUT.fontSize * 1.7); // POS tag → its word
  const hasGloss = doc.tokens.some((t) => t.gloss);

  const ownWidth = (n: ConsNode): number => {
    const label = n.word ? Math.max(width(n.word), width(n.cat, true), n.gloss ? width(n.gloss, true) : 0) : width(n.cat);
    return label + SLOT_GAP;
  };
  const subW = new Map<ConsNode, number>();
  const measure = (n: ConsNode): number => {
    let w = ownWidth(n);
    if (n.children.length) w = Math.max(w, n.children.reduce((a, c) => a + measure(c), 0));
    subW.set(n, w);
    return w;
  };
  measure(tree);

  const elements: DiagramElement[] = [];
  // depth → y; a terminal also draws its word a fixed drop below its POS tag.
  const place = (n: ConsNode, left: number, depth: number): { x: number; y: number } => {
    const y = depth * ROW;
    let x: number;
    if (n.children.length) {
      let cx = left + (subW.get(n)! - n.children.reduce((a, c) => a + subW.get(c)!, 0)) / 2;
      const pts: { x: number; y: number }[] = [];
      for (const c of n.children) {
        const p = place(c, cx, depth + 1);
        pts.push(p);
        cx += subW.get(c)!;
      }
      x = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
      // Branches from this category down to each child.
      for (let i = 0; i < n.children.length; i++) {
        const c = n.children[i]!;
        const p = pts[i]!;
        const color = c.role ? relationColor(c.role) : ROOT_COLOR;
        elements.push(line(x, y + 6, p.x, p.y - LAYOUT.fontSize, 'connector', 'solid', { color }));
        // The grammatical role rides the branch (the dependency paradigm made
        // visible) — why this constituent attaches as it does. Skip the head.
        const lbl = c.role ? SHORT_ROLE[c.role] : undefined;
        if (lbl) {
          elements.push(
            text(x + (p.x - x) * 0.5, y + 6 + (p.y - LAYOUT.fontSize - (y + 6)) * 0.5, lbl, {
              anchor: 'middle', small: true, italic: true, box: true, color, glossKey: c.role,
            }),
          );
        }
      }
    } else {
      x = left + subW.get(n)! / 2;
    }

    if (n.word) {
      // Terminal: POS tag, then the word just below it (dotted leaf), gloss under.
      // The POS tag is tappable for a plain-English definition (glossary popover).
      if (n.cat) {
        elements.push(text(x, y, n.cat, { anchor: 'middle', small: true, italic: true, muted: true, glossKey: posGlossKey(n.cat) }));
      }
      const wy = y + WORD_DROP;
      elements.push(line(x, y + 4, x, wy - LAYOUT.fontSize, 'stem', 'dotted', { color: ROOT_COLOR }));
      elements.push(text(x, wy, n.word, { anchor: 'middle', nodeId: n.nodeId, muted: n.implied, italic: n.implied }));
      if (n.gloss && hasGloss && n.gloss !== n.word) {
        elements.push(text(x, wy + LAYOUT.fontSize + 2, n.gloss, { anchor: 'middle', small: true, muted: true, nodeId: n.nodeId }));
      }
    } else if (n.cat) {
      // Internal category node (S, NP, VP…) — tappable for what the symbol means,
      // and still highlights its constituent on hover via its head node id.
      elements.push(text(x, y, n.cat, { anchor: 'middle', nodeId: n.nodeId, color: ROOT_COLOR, glossKey: phraseGlossKey(n.cat) }));
    }
    return { x, y };
  };
  place(tree, 0, 0);

  return finalize(elements);
}

/** Glossary key for a category symbol — all clause variants share the "S" entry. */
function phraseGlossKey(cat: string): string {
  return `phrase:${cat.startsWith('S') ? 'S' : cat}`;
}
/** Glossary key for a part-of-speech leaf tag. */
function posGlossKey(tag: string): string {
  return `pos:${tag}`;
}
