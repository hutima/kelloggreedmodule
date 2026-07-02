import type {
  KrDocument,
  PartOfSpeech,
  SourceConstituencyNode,
  SourceConstituencyTree,
  SyntacticRole,
  SyntaxNode,
} from '@/domain/schema';
import { childRelations, getNode } from '@/domain/model';
import type { DiagramElement, DiagramLayout } from '../types';
import { LAYOUT, relationColor } from '../constants';
import { finalize, line, resetIds, text, width } from './builder';
import { SHORT_ROLE } from './dependency';
import { tidyTree, columnCentres, type TreeOrientation } from './tree-layout';

/**
 * CONSTITUENCY (phrase-structure) tree — the classic "S → NP VP" diagram, with
 * category nodes (S, NP, VP, PP…) as the internal branches and the words only at
 * the leaves, each under its part-of-speech tag. It grows LEFT-TO-RIGHT by default
 * (`orientation: 'horizontal'`) so sibling sentences stack down the page rather
 * than across one very wide row; `orientation: 'vertical'` restores the classic
 * top-down shape.
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

/** Which tree the mode draws: the SOURCE `<wg>` hierarchy (when the document
 *  carries one), the RECONSTRUCTED estimate from the app syntax graph, or
 *  `auto` — source when available, reconstructed otherwise. */
export type ConstituencyVariant = 'auto' | 'source' | 'reconstructed';

/** Human label for a source id in the caption. Kept local — the layout layer
 *  must not import io/. Falls back to the raw id for unknown sources. */
const SOURCE_LABEL: Record<string, string> = {
  'macula-greek-sblgnt-lowfat': 'SBLGNT Lowfat',
  'macula-greek-nestle1904-lowfat': 'Nestle 1904 Lowfat',
  'macula-hebrew-wlc-lowfat': 'WLC Lowfat',
  opentext: 'OpenText',
};

/** Source `<w class>` → terminal tag (the source's own word classes). */
const SOURCE_LEAF_TAG: Record<string, string> = {
  noun: 'N', verb: 'V', det: 'Det', adj: 'Adj', adv: 'Adv', prep: 'P',
  conj: 'Conj', pron: 'Pron', ptcl: 'Prt', num: 'Num', intj: 'Intj',
  cj: 'Conj', art: 'Det', om: 'Det',
};
/** Source `<wg class>` → phrase category symbol. */
const SOURCE_WG_CAT: Record<string, string> = {
  np: 'NP', vp: 'VP', pp: 'PP', adjp: 'AdjP', advp: 'AdvP', cl: 'S', discourse: '',
};
/** Source role → the closest app role, ONLY for branch colouring — the chip
 *  text shows the RAW source role, never a translated claim. */
const SOURCE_ROLE_COLOR: Record<string, SyntacticRole> = {
  s: 'subject', v: 'predicate', vc: 'copula', o: 'directObject', o2: 'objectComplement',
  io: 'indirectObject', p: 'predicateNominative', adv: 'adverbial',
};

const ROOT_COLOR = '#5b6470';
const SLOT_GAP = 28;
const CHIP_PAD = 16; // padding added to a role-chip's text width when reserving space
const COL_PAD = 30; // horizontal: clear space left of each depth column (room for chips)

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
  /** RAW source role (source tree only) — shown verbatim on the chip. */
  rawRole?: string;
  /** Source `head="true"` marking (source tree only) — shown on the chip even
   *  when the node also carries a role, so Nestle1904's explicit head marking
   *  is never masked. */
  srcHead?: boolean;
  /** Source phrase rule (DetNP, QuanPp, NpaNp…) — shown beside the category. */
  rule?: string;
  /** Source articular marking — shown beside the category. */
  articular?: boolean;
  /** Earliest surface index in the subtree, for ordering siblings. */
  order: number;
  children: ConsNode[];
}

/** Build the ConsNode tree straight from the PRESERVED source `<wg>`
 *  hierarchy — a faithful rendering of what the source published (child order,
 *  categories, raw roles, head marking), with leaves resolved to the document's
 *  tokens and hover-linked to the app syntax node realizing each word. */
function buildSourceTree(doc: KrDocument, tree: SourceConstituencyTree): ConsNode | undefined {
  const tokenById = new Map(doc.tokens.map((t) => [t.id, t]));
  const tokenToNode = new Map<string, string>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);

  const walk = (n: SourceConstituencyNode): ConsNode | undefined => {
    // A bare `cl` wrapper role is noise (the S category already says it), but
    // every other raw role — and any `head="true"` marking — is shown verbatim.
    const raw = n.role && n.role !== 'cl' ? n.role : undefined;
    if (n.kind === 'word') {
      const tok = n.tokenIds?.length ? tokenById.get(n.tokenIds[0]!) : undefined;
      if (!tok) return undefined;
      return {
        cat: SOURCE_LEAF_TAG[n.cat ?? ''] ?? '–',
        word: tok.surface,
        gloss: tok.gloss,
        nodeId: tokenToNode.get(tok.id),
        rawRole: raw,
        srcHead: n.head,
        order: tok.index,
        children: [],
      };
    }
    const kids = n.children.map(walk).filter((k): k is ConsNode => Boolean(k));
    if (!kids.length) return undefined;
    // Collapse a single-child wrapper that says NOTHING (no class, role, rule,
    // articular, or head marking) — it adds a depth column without content
    // (Lowfat's outer <wg role="cl"> shell). Any wrapper carrying source
    // information — including a classless SBLGNT coordination wrapper whose
    // only content is its `rule` — stays visible as a source node.
    if (!n.cat && !raw && !n.head && !n.rule && !n.articular && kids.length === 1) return kids[0];
    const cat = n.cat ? (SOURCE_WG_CAT[n.cat] ?? n.cat.toUpperCase()) : '';
    return {
      cat,
      rawRole: raw,
      srcHead: n.head,
      rule: n.rule,
      articular: n.articular,
      order: Math.min(...kids.map((k) => k.order)),
      // Source child order is authoritative — never re-sorted.
      children: kids,
    };
  };
  return walk(tree.root);
}

export function layoutConstituency(
  doc: KrDocument,
  orientation: TreeOrientation = 'horizontal',
  variant: ConstituencyVariant = 'auto',
): DiagramLayout {
  resetIds();
  const horiz = orientation === 'horizontal';

  const tokenById = new Map(doc.tokens.map((t) => [t.id, t]));
  const order = new Map(doc.tokens.map((t) => [t.id, t.index]));
  // Nodes already attached as a real dependent — so a label word that a
  // normalization step promoted to a real edge isn't ALSO added as a leaf.
  const attachedElsewhere = new Set(doc.syntax.relations.map((r) => r.dependentId));

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

  // The role a connector/subordinator word (carried as a relation LABEL) reads as.
  const labelRole = (id: string): SyntacticRole => {
    const n = getNode(doc.syntax, id);
    const pos = n?.tokenIds.length ? tokenById.get(n.tokenIds[0]!)?.pos : undefined;
    return pos === 'conjunction' ? 'conjunction' : pos === 'particle' ? 'particle' : 'adjunct';
  };

  const build = (nodeId: string, role: SyntacticRole | undefined, seen: Set<string>): ConsNode | undefined => {
    if (seen.has(nodeId)) return undefined;
    const next = new Set(seen).add(nodeId);
    const node = getNode(doc.syntax, nodeId);
    if (!node) return undefined;
    const ord = subtreeOrder(nodeId, new Set());
    const kids = childRelations(doc.syntax, nodeId)
      .map((r) => ({ child: build(r.dependentId, r.type, next), o: subtreeOrder(r.dependentId, new Set()) }))
      .filter((k): k is { child: ConsNode; o: number } => Boolean(k.child));
    // Connector / subordinator words (ἐάν, ὅτι…) the parse carries as the LABEL on
    // an edge INTO this node would otherwise be dropped; add each as a leaf so
    // every word of the sentence appears in the tree. Skip any that a normalization
    // step already attached as a real dependent (so they aren't drawn twice).
    for (const r of doc.syntax.relations) {
      if (r.dependentId !== nodeId || !r.labelNodeId || next.has(r.labelNodeId)) continue;
      if (attachedElsewhere.has(r.labelNodeId)) continue;
      const child = build(r.labelNodeId, labelRole(r.labelNodeId), next);
      if (child) kids.push({ child, o: subtreeOrder(r.labelNodeId, new Set()) });
    }
    kids.sort((a, b) => a.o - b.o);

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

  // Pick the tree: source when available (unless explicitly reconstructed),
  // else the reconstruction — and SAY which one is on screen.
  const sourceTree =
    variant !== 'reconstructed' && doc.sourceConstituency
      ? buildSourceTree(doc, doc.sourceConstituency)
      : undefined;
  const tree = sourceTree ?? build(doc.syntax.rootId, undefined, new Set());
  if (!tree) return finalize([]);
  const caption = sourceTree
    ? `Source constituency: ${SOURCE_LABEL[doc.sourceConstituency!.sourceId] ?? doc.sourceConstituency!.sourceId}`
    : variant === 'source'
      ? 'Reconstructed from the app syntax graph (no source tree available)'
      : 'Reconstructed from the app syntax graph';

  // ---- tidy layout: measure the cross axis, then map (depth, cross) → (x, y) --
  // Vertical grows top-down (depth → y); horizontal grows left-to-right (depth →
  // x), which stacks sibling sentences down the page instead of one wide row.
  const ROW = Math.round(LAYOUT.fontSize * 3.1); // vertical: category → child gap
  const WORD_DROP = Math.round(LAYOUT.fontSize * 1.7); // POS tag → its word
  const hasGloss = doc.tokens.some((t) => t.gloss);

  const STEM_H = 16; // horizontal: dotted POS-tag → word connector length

  // Source chips show the raw role AND the head marking together ("s · head"),
  // so an explicit Nestle1904 head is never hidden behind a role.
  const chipLabel = (n: ConsNode): string | undefined => {
    if (n.rawRole || n.srcHead) {
      return [n.rawRole, n.srcHead ? 'head' : undefined].filter(Boolean).join(' · ');
    }
    return n.role ? SHORT_ROLE[n.role] : undefined;
  };
  const chipColor = (n: ConsNode): string =>
    n.role
      ? relationColor(n.role)
      : n.rawRole
        ? relationColor(SOURCE_ROLE_COLOR[n.rawRole] ?? 'unknown')
        : ROOT_COLOR;
  // Source phrase rule + articular marking, shown small beside the category —
  // raw and untranslated (QuanPp stays "QuanPp", never an app-role claim).
  const srcMeta = (n: ConsNode): string | undefined => {
    const parts = [n.rule, n.articular ? 'art.' : undefined].filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
  };
  const srcMetaW = (n: ConsNode): number => {
    const m = srcMeta(n);
    return m ? (n.cat ? 6 : 0) + width(m, true) : 0;
  };
  const chipW = (n: ConsNode | undefined): number => {
    const l = n && chipLabel(n);
    return l ? width(l, true) + CHIP_PAD : 0;
  };
  // The word (+ gloss beneath) block of a terminal — its width, the two stacked.
  const wordBlockW = (n: ConsNode): number =>
    Math.max(width(n.word ?? ''), n.gloss && hasGloss && n.gloss !== n.word ? width(n.gloss, true) : 0);
  // A node's OWN width along the WRITING direction. Vertical stacks a terminal's
  // POS tag above its word, so the leaf is only as wide as the widest line;
  // horizontal lays "tag ⋯ word" in a row, so it is that whole run wide.
  const textW = (n: ConsNode): number =>
    n.word
      ? Math.max(width(n.word), width(n.cat, true), n.gloss ? width(n.gloss, true) : 0)
      : width(n.cat) + srcMetaW(n);
  const nodeWh = (n: ConsNode): number =>
    n.word ? (n.cat ? width(n.cat, true) + STEM_H : 0) + wordBlockW(n) : width(n.cat) + srcMetaW(n);
  // Cross-axis footprint when VERTICAL: text width + the role chip riding the
  // branch into it (so a narrow leaf's chip can't overlap a sibling) + padding.
  const ownWidth = (n: ConsNode): number => Math.max(textW(n), chipW(n)) + SLOT_GAP;
  // Cross-axis footprint when HORIZONTAL: one row, plus a second line below a
  // terminal that carries an English gloss under its word.
  const crossH = (n: ConsNode): number =>
    Math.round(LAYOUT.fontSize * (n.word && n.gloss && hasGloss && n.gloss !== n.word ? 2.8 : 1.9));

  const { cross, depth, byDepth } = tidyTree(tree, (n) => n.children, horiz ? crossH : ownWidth);

  const xy = new Map<ConsNode, { x: number; y: number }>();
  if (horiz) {
    const colWidth = byDepth.map((list) => Math.max(0, ...list.map(nodeWh)));
    const centres = columnCentres(colWidth, (d) =>
      d === 0 ? COL_PAD : Math.max(0, ...byDepth[d]!.map((n) => chipW(n))) + COL_PAD,
    );
    for (const [n, d] of depth) xy.set(n, { x: centres[d]!, y: cross.get(n)! });
  } else {
    for (const [n, d] of depth) xy.set(n, { x: cross.get(n)!, y: d * ROW });
  }

  const elements: DiagramElement[] = [];

  const draw = (n: ConsNode): void => {
    const { x, y } = xy.get(n)!;
    for (const c of n.children) {
      const p = xy.get(c)!;
      const color = chipColor(c);
      const lbl = chipLabel(c);
      if (horiz) {
        // Branch steps rightward and stops at the role chip's LEFT edge (no line
        // under the bubble); the chip sits centred in the gap before the child.
        const x1 = x + nodeWh(n) / 2 + 6;
        const wordLeft = p.x - nodeWh(c) / 2;
        let x2 = wordLeft - 5;
        if (lbl) {
          const bw = width(lbl, true) + 10; // matches the renderer's chip padding
          const chipCx = wordLeft - 5 - bw / 2;
          x2 = chipCx - bw / 2;
          elements.push(
            text(chipCx, p.y, lbl, { anchor: 'middle', small: true, italic: true, box: true, color, ...(c.role ? { glossKey: c.role } : {}) }),
          );
        }
        elements.push(line(x1, y, x2, p.y, 'connector', 'solid', { color }));
      } else {
        // Branch drops downward; its role label sits directly above the child
        // (centred in the child's column) so sibling chips never pile up.
        elements.push(line(x, y + 6, p.x, p.y - LAYOUT.fontSize, 'connector', 'solid', { color }));
        if (lbl) {
          elements.push(
            text(p.x, p.y - LAYOUT.fontSize - 7, lbl, {
              anchor: 'middle', small: true, italic: true, box: true, color, ...(c.role ? { glossKey: c.role } : {}),
            }),
          );
        }
      }
      draw(c);
    }

    if (n.word && horiz) {
      // Horizontal terminal reads left-to-right: POS tag ⋯ word (gloss beneath the
      // word), so the leaf grows the same direction as the tree.
      const w = nodeWh(n);
      const left = x - w / 2;
      const tagW = n.cat ? width(n.cat, true) : 0;
      let wx = x;
      if (n.cat) {
        elements.push(text(left + tagW / 2, y, n.cat, { anchor: 'middle', small: true, italic: true, muted: true, glossKey: posGlossKey(n.cat) }));
        const sy = y - LAYOUT.fontSize * 0.32; // dotted stem at mid text-height
        elements.push(line(left + tagW + 2, sy, left + tagW + STEM_H - 2, sy, 'stem', 'dotted', { color: ROOT_COLOR }));
        wx = left + tagW + STEM_H + wordBlockW(n) / 2;
      }
      elements.push(text(wx, y, n.word, { anchor: 'middle', nodeId: n.nodeId, muted: n.implied, italic: n.implied }));
      if (n.gloss && hasGloss && n.gloss !== n.word) {
        elements.push(text(wx, y + LAYOUT.fontSize + 2, n.gloss, { anchor: 'middle', small: true, muted: true, nodeId: n.nodeId }));
      }
    } else if (n.word) {
      // Vertical terminal: POS tag, then the word a fixed drop below it (dotted
      // leaf), gloss under.
      if (n.cat) {
        elements.push(text(x, y, n.cat, { anchor: 'middle', small: true, italic: true, muted: true, glossKey: posGlossKey(n.cat) }));
      }
      const wy = y + WORD_DROP;
      elements.push(line(x, y + 4, x, wy - LAYOUT.fontSize, 'stem', 'dotted', { color: ROOT_COLOR }));
      elements.push(text(x, wy, n.word, { anchor: 'middle', nodeId: n.nodeId, muted: n.implied, italic: n.implied }));
      if (n.gloss && hasGloss && n.gloss !== n.word) {
        elements.push(text(x, wy + LAYOUT.fontSize + 2, n.gloss, { anchor: 'middle', small: true, muted: true, nodeId: n.nodeId }));
      }
    } else if (n.cat || srcMeta(n)) {
      // Internal category node (S, NP, VP…) — tappable for what the symbol means,
      // and still highlights its constituent on hover via its head node id. A
      // source node's raw phrase rule / articular marking rides beside it small
      // and untranslated; a classless source wrapper shows just that metadata.
      const meta = srcMeta(n);
      const catW = n.cat ? width(n.cat) : 0;
      const total = catW + (meta ? srcMetaW(n) : 0);
      const left = x - total / 2;
      if (n.cat) {
        elements.push(
          text(left + catW / 2, y, n.cat, { anchor: 'middle', nodeId: n.nodeId, color: ROOT_COLOR, glossKey: phraseGlossKey(n.cat) }),
        );
      }
      if (meta) {
        elements.push(
          text(left + catW + (n.cat ? 6 : 0) + width(meta, true) / 2, y, meta, {
            anchor: 'middle', small: true, italic: true, muted: true,
          }),
        );
      }
    }
  };
  draw(tree);

  // The honesty caption: which tree is on screen, and from which source.
  elements.push(text(0, -30, caption, { anchor: 'start', small: true, italic: true, muted: true }));

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
