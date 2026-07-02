import type {
  KrDocument,
  Language,
  Morphology,
  PartOfSpeech,
  Provenance,
  Relation,
  SourceConstituencyNode,
  SourceConstituencyTree,
  SyntacticRole,
  SyntaxNode,
  Token,
} from '@/domain/schema';
import { SCHEMA_VERSION } from '@/domain/schema';
import { mergeSharedSubjectPredicate } from '@/domain/model';

/**
 * Convert a Nestle1904 **Lowfat** syntax tree (biblicalhumanities /
 * Clear-Bible "macula-greek") into our `KrDocument` model — the engine behind
 * the gold-standard GNT mode.
 *
 * Lowfat is a head-marked CONSTITUENCY tree: every `<wg>` (word group) has one
 * `head="true"` child, and a child's `role` (s, v, o, io, p, adv, …) gives its
 * function. We percolate heads to turn constituents into the head→dependent
 * relations our schema uses, mapping Lowfat's roles/rules onto Kellogg-Reed
 * roles. The morphology on each `<w>` carries over verbatim, so articles attach
 * by agreement and the diagram is faithful to the published analysis.
 *
 * The conversion is gold-standard: every node/relation is marked
 * `source: 'given'`, so nothing renders as a tentative guess — with two
 * deliberate, honestly-labelled exceptions (see
 * docs/sblgnt-kellogg-reed-plan.md; Mark 5:26 is the regression case):
 *
 *   • an accusative `o` dependent of a PASSIVE verb is not claimed as an
 *     ordinary direct object — it becomes a neutral `accusativeModifier`
 *     marked `converted` with the raw source role preserved;
 *   • an ARTICULAR PP (an article nominalizing a prepositional phrase, with
 *     no substantive head word — τὰ παρ᾽ αὐτῆς, τὰ περὶ τοῦ Ἰησοῦ) is rooted
 *     on its ARTICLE, so a quantifier like πάντα modifies the substantival
 *     phrase instead of being promoted to a bare "direct object".
 */

const POS: Record<string, PartOfSpeech> = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  conj: 'conjunction',
  det: 'article',
  num: 'numeral',
  prep: 'preposition',
  pron: 'pronoun',
  ptcl: 'particle',
};

const MORPH_KEYS = ['case', 'gender', 'number', 'person', 'tense', 'voice', 'mood'] as const;

/** Lowfat `<wg class>` → constituency phrase category (stamped for the tree view). */
const PHRASE_CAT: Record<string, string> = {
  np: 'NP',
  vp: 'VP',
  pp: 'PP',
  adjp: 'AdjP',
  advp: 'AdvP',
};

/** Lowfat child roles a copula would link: subject, objects, predicate complement. */
const PRED_ARG_ROLES = new Set(['s', 'o', 'o2', 'io', 'p']);

export function parseXml(xml: string): Document {
  if (typeof DOMParser === 'undefined') {
    throw new Error('Lowfat conversion requires a DOMParser (browser or happy-dom).');
  }
  return new DOMParser().parseFromString(xml, 'application/xml');
}

/** Lower-cased tag name (XML preserves case in browsers; happy-dom upper-cases). */
function tag(el: Element): string {
  return el.tagName.toLowerCase();
}

/** Direct child elements that are part of the tree (skip text/milestone/pc). */
function constituents(el: Element): Element[] {
  return Array.from(el.children).filter((c) => tag(c) === 'w' || tag(c) === 'wg');
}

function posOf(w: Element): PartOfSpeech {
  const cls = w.getAttribute('class') ?? '';
  const mood = w.getAttribute('mood');
  if (cls === 'verb' && mood === 'participle') return 'participle';
  if (cls === 'verb' && mood === 'infinitive') return 'infinitive';
  if (cls === 'noun' && w.getAttribute('type') === 'proper') return 'propernoun';
  return POS[cls] ?? 'unknown';
}

function morphOf(w: Element): Morphology | undefined {
  const m: Morphology = {};
  let any = false;
  for (const k of MORPH_KEYS) {
    const v = w.getAttribute(k);
    if (v) {
      (m as Record<string, string>)[k] = v;
      any = true;
    }
  }
  // Alignment anchors carried in `extra`: the canonical reference (osisId, e.g.
  // "Phil.1.1!1") and Strong's number. Parallel translations are linked to these
  // words by LEXEME (Strong's), not position, so the link survives the small
  // textual differences between Nestle1904 and the alignment's SBLGNT base.
  const extra: Record<string, string> = {};
  const ref = w.getAttribute('osisId');
  const strong = w.getAttribute('strong');
  if (ref) extra.ref = ref;
  if (strong) extra.strong = strong;
  if (Object.keys(extra).length) {
    m.extra = extra;
    any = true;
  }
  return any ? m : undefined;
}

/**
 * Per-language adapter for the Lowfat constituency converter. The tree SHAPE is
 * shared between macula-greek and macula-hebrew (head-marked `<wg>`/`<w>` with
 * `role`/`class`/`rule`), so only the leaf reads — how a `<w>`'s id, surface,
 * part of speech, lemma, gloss, and morphology are spelled — differ. A dialect
 * supplies those; `SentenceConverter` owns the language-agnostic structure.
 */
export interface LowfatDialect {
  language: Language;
  /** Stable id from a node's own attributes (null → the converter autogenerates). */
  idOf(el: Element): string | null;
  surfaceOf(w: Element): string;
  posOf(w: Element): PartOfSpeech;
  lemmaOf(w: Element): string | undefined;
  glossOf(w: Element): string | undefined;
  morphOf(w: Element): Morphology | undefined;
  /**
   * Pick the head among children when NONE is marked `head="true"`. Nestle1904
   * marks word-level heads, so the first child is right; macula-hebrew marks
   * heads only on word-GROUPS, so a leaf group (article + noun) needs the content
   * word chosen instead of the leading function morpheme; SBLGNT Lowfat carries
   * NO head marking at all, so every group needs class/role-driven inference.
   * Defaults to the first child.
   */
  headFallback?(kids: Element[], parent?: Element): Element | undefined;
}

/** macula-greek (Nestle1904 Lowfat): ids on `n`/`osisId`, surface in text. */
export const greekDialect: LowfatDialect = {
  language: 'grc',
  idOf: (el) => el.getAttribute('n') || el.getAttribute('osisId') || null,
  surfaceOf: (w) => (w.textContent ?? '').trim(),
  posOf,
  lemmaOf: (w) => w.getAttribute('lemma') ?? w.getAttribute('normalized') ?? undefined,
  glossOf: (w) => w.getAttribute('gloss') ?? undefined,
  morphOf,
};

/** Alignment anchors for SBLGNT `<w>`: canonical `ref` ("MRK 5:25!1") and
 *  Strong's number, carried in `morphology.extra` like the Nestle1904 osisId. */
function sblgntMorphOf(w: Element): Morphology | undefined {
  const m: Morphology = {};
  let any = false;
  for (const k of MORPH_KEYS) {
    const v = w.getAttribute(k);
    if (v) {
      (m as Record<string, string>)[k] = v;
      any = true;
    }
  }
  const extra: Record<string, string> = {};
  const ref = w.getAttribute('ref');
  const strong = w.getAttribute('strong');
  if (ref) extra.ref = ref;
  if (strong) extra.strong = strong;
  if (Object.keys(extra).length) {
    m.extra = extra;
    any = true;
  }
  return any ? m : undefined;
}

/** Function-word classes that never head an SBLGNT word group. */
const SBLGNT_FUNCTION_CLASSES = new Set(['det', 'conj', 'prep', 'ptcl']);

/**
 * Head-worthiness of a constituent class (higher heads). The relative order
 * mirrors the original priority list: nominal > adjectival > verbal >
 * adverbial > prepositional.
 */
const SBLGNT_CLASS_RANK: Record<string, number> = {
  np: 5, noun: 5, pron: 5,
  adjp: 4, adj: 4, num: 4,
  vp: 3, verb: 3,
  advp: 2, adv: 2,
  pp: 1, prep: 1,
};

/** The ultimate head WORD an SBLGNT constituent would resolve to (following
 *  explicit head marks where present, inferred heads otherwise). */
function sblgntUltimateWord(el: Element): Element | undefined {
  if (tag(el) === 'w') return el;
  const kids = constituents(el);
  const head = kids.find((c) => c.getAttribute('head') === 'true') ?? sblgntHead(kids);
  return head ? sblgntUltimateWord(head) : undefined;
}

/**
 * Head inference for SBLGNT Lowfat, which (unlike Nestle1904) carries NO
 * `head="true"` marking. Explicit predicate roles (`v`/`vc`) and clause
 * children win outright; other candidates are scored by class — the class of
 * a CLASSLESS wrapper (an SBLGNT coordination like `NpaNp`) resolved through
 * its own ultimate word, so a coordination of nouns counts as nominal (the
 * Titus 2:13 fix: θεοῦ-καὶ-σωτῆρος must outrank the adjective μεγάλου) — with
 * two linguistic adjustments on top of the class ranking:
 *
 *   • function words (det/conj/prep/ptcl) never head — a `DetNP` is headed by
 *     its noun and a `PrepNp` object stays findable;
 *   • a GENITIVE candidate is demoted below every non-genitive case-bearing
 *     candidate: inside a nominal group a genitive alongside another case is
 *     (almost always) the dependent (the Col 1:15 fix: nominative
 *     πρωτότοκος heads, genitive πάσης-κτίσεως depends) — while a group
 *     that is entirely genitive (Titus 2:13) is left to the class ranking.
 *
 * Ties keep document order, matching the original first-match behavior.
 */
function sblgntHead(kids: Element[]): Element | undefined {
  if (!kids.length) return undefined;
  const cls = (el: Element) => el.getAttribute('class') ?? '';
  const role = (el: Element) => el.getAttribute('role') ?? '';
  const explicit =
    kids.find((k) => role(k) === 'v' || role(k) === 'vc') ??
    kids.find((k) => cls(k) === 'cl');
  if (explicit) return explicit;

  // Effective rank: a node's own class when it has one; a CLASSLESS wrapper
  // ranks as its inferred head CONSTITUENT (one level at a time — so a
  // classless coordination of nouns ranks nominal, while a classless
  // coordination of PPs ranks prepositional, never as the PP's object noun).
  const rankOf = (el: Element): number => {
    const c = el.getAttribute('class');
    if (c) return SBLGNT_CLASS_RANK[c] ?? 0;
    if (tag(el) === 'w') return 0;
    const inner = constituents(el);
    const head = inner.find((x) => x.getAttribute('head') === 'true') ?? sblgntHead(inner);
    return head ? rankOf(head) : 0;
  };

  const contentKids = kids.filter((k) => !SBLGNT_FUNCTION_CLASSES.has(cls(k)));
  const pool = contentKids.length ? contentKids : kids;
  const scored = pool.map((k) => {
    const w = sblgntUltimateWord(k);
    const kase = w?.getAttribute('case') ?? '';
    return { k, rank: rankOf(k), genitive: kase === 'genitive', hasCase: Boolean(kase) };
  });
  // Demote genitives only RELATIVE to a non-genitive case-bearing sibling.
  const hasNonGenitiveCase = scored.some((s) => s.hasCase && !s.genitive);
  const effective = (s: (typeof scored)[number]) =>
    s.rank - (s.genitive && hasNonGenitiveCase ? 10 : 0);
  let best = scored[0]!;
  for (const s of scored) if (effective(s) > effective(best)) best = s;
  return best.k;
}

/** macula-greek SBLGNT Lowfat (Clear-Bible/macula-greek): ids on `xml:id`/
 *  `ref`, no head marking (inferred), alignment ref instead of osisId. */
export const sblgntDialect: LowfatDialect = {
  language: 'grc',
  idOf: (el) => el.getAttribute('xml:id') || el.getAttribute('ref') || null,
  surfaceOf: (w) => (w.textContent ?? '').trim(),
  posOf,
  lemmaOf: (w) => w.getAttribute('lemma') ?? w.getAttribute('normalized') ?? undefined,
  glossOf: (w) => w.getAttribute('gloss') ?? undefined,
  morphOf: sblgntMorphOf,
  headFallback: sblgntHead,
};

/** One conversion pass over a single `<sentence>`. */
export class SentenceConverter {
  readonly tokens: Token[] = [];
  readonly nodes: SyntaxNode[] = [];
  readonly relations: Relation[] = [];
  private wordNodeId = new Map<Element, string>();
  /**
   * Representative node id → the subordinator (ἵνα, ὅτι, ὡς…) that introduced it.
   * A Lowfat subordinate clause wraps its real clause behind a bare conjunction
   * word; we pass the clause through and stash the conjunction here so the
   * relation that finally links the clause to its head carries it as a connector
   * label (Kellogg-Reed writes the subordinator on the dotted connecting line).
   */
  private subLabel = new Map<string, string>();
  /** Representative node id → the subordinator's own NODE id (so the connector
   *  label that rides the line is selectable and can show word details). */
  private subLabelNode = new Map<string, string>();
  private seq = 0;

  constructor(
    private readonly idPrefix: string,
    private readonly dialect: LowfatDialect,
  ) {}

  private key(el: Element): string {
    return this.dialect.idOf(el) || `${this.idPrefix}${this.seq++}`;
  }

  /**
   * Re-order tokens into SURFACE (reading) order and reindex them. The tree walk
   * visits constituents head-first, so the raw token list is in TREE order — the
   * source text strip and `doc.text` would otherwise read scrambled. The source
   * id (`n` for Greek, `xml:id` for Hebrew) is zero-padded by position, so a
   * lexicographic sort of the token ids recovers the original word order.
   */
  orderTokensBySurface(): void {
    this.tokens.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    this.tokens.forEach((t, i) => {
      t.index = i;
    });
  }

  private rel(
    type: SyntacticRole,
    headId: string,
    dependentId: string,
    label?: string,
    provenance?: Provenance,
  ): void {
    if (headId === dependentId) return;
    // An explicit label wins; otherwise inherit a stashed subordinator, if any —
    // and carry the subordinator's own node so the connector label is selectable.
    const inheritedLabel = label ?? this.subLabel.get(dependentId);
    const labelNodeId = label ? undefined : this.subLabelNode.get(dependentId);
    this.relations.push({
      id: `r_${this.idPrefix}${this.seq++}`,
      type,
      headId,
      dependentId,
      label: inheritedLabel,
      ...(labelNodeId ? { labelNodeId } : {}),
      provenance: provenance ?? { source: 'given', confidence: 'high' },
    });
  }

  /** Create a clause node for `el` and return its id. */
  private makeClause(el: Element, clauseType: SyntaxNode['clauseType']): string {
    const clauseId = `cl_${this.key(el)}`;
    this.nodes.push({
      id: clauseId,
      kind: 'clause',
      tokenIds: [],
      clauseType,
      provenance: { source: 'given', confidence: 'high' },
    });
    return clauseId;
  }

  /**
   * Whether converting `el` yields a CLAUSE node (vs. a word/phrase). Used to tell
   * clause coordination/subordination apart from ordinary phrase structure without
   * actually converting (which would mint duplicate nodes).
   */
  private isClauseLike(el: Element): boolean {
    if (tag(el) === 'w') return false;
    const cls = el.getAttribute('class');
    if (cls === 'cl') return true;
    if (cls) return false; // np / vp / pp / adjp / advp …
    // A bare wrapper (no class) is clause-like iff it ultimately wraps a clause.
    if (el.getAttribute('role') === 'cl') return true;
    return constituents(el).some((c) => this.isClauseLike(c));
  }

  /** Create the TOKEN for a `<w>` leaf (idempotent), without minting a node. */
  private makeToken(w: Element, tokenId: string): void {
    if (this.tokens.some((t) => t.id === tokenId)) return;
    this.tokens.push({
      id: tokenId,
      index: this.tokens.length,
      surface: this.dialect.surfaceOf(w),
      language: this.dialect.language,
      pos: this.dialect.posOf(w),
      lemma: this.dialect.lemmaOf(w),
      gloss: this.dialect.glossOf(w),
      morphology: this.dialect.morphOf(w),
      provenance: { source: 'given', confidence: 'high' },
    });
  }

  /** Create (once) the token + word node for a `<w>` leaf, return the node id. */
  private wordNode(w: Element): string {
    const existing = this.wordNodeId.get(w);
    if (existing) return existing;
    const k = this.key(w);
    const tokenId = `t_${k}`;
    this.makeToken(w, tokenId);
    const nodeId = `w_${k}`;
    this.nodes.push({ id: nodeId, kind: 'word', tokenIds: [tokenId], provenance: { source: 'given', confidence: 'high' } });
    this.wordNodeId.set(w, nodeId);
    return nodeId;
  }

  /**
   * Realize a periphrastic verb phrase — a finite copula plus a participle
   * (ἐστιν εἰργασμένα "have been wrought", ἦν βαπτίζων "was baptizing") — as ONE
   * compound predicate node spanning all its verb words, so the whole periphrasis
   * sits together on the baseline (Reed-Kellogg treats it as a single verb, not a
   * participle head with a demoted auxiliary hanging beneath it). The finite verb
   * is listed FIRST so the clause reads as finite — the layout keys the
   * subject/omit-subject decision off the predicate's first token — while the drawn
   * word order is recovered from token indices, so this ordering never reshuffles
   * the visible text.
   */
  private periphrasticPredicate(el: Element): string {
    const ws = Array.from(el.querySelectorAll('w'));
    const finite = ws.filter(
      (w) => w.getAttribute('class') === 'verb' && w.getAttribute('mood') !== 'participle',
    );
    const ordered = [...finite, ...ws.filter((w) => !finite.includes(w))];
    const tokenIds = ordered.map((w) => {
      const tokenId = `t_${this.key(w)}`;
      this.makeToken(w, tokenId);
      return tokenId;
    });
    const nodeId = `w_${this.key(el)}`;
    this.nodes.push({
      id: nodeId,
      kind: 'word',
      tokenIds,
      provenance: { source: 'given', confidence: 'high' },
    });
    // Any later reference to one of these verb words (a word-group modifier, the
    // orphan rescue) resolves to the compound node, so no verb word is drawn twice
    // or dropped.
    for (const w of ordered) this.wordNodeId.set(w, nodeId);
    return nodeId;
  }

  /**
   * Attach any word node left UNREACHABLE — neither a dependent of a relation nor
   * the connector LABEL of one — to the root, so no source word is silently
   * dropped. This rescues a clause-initial connective (οὖν, γάρ, δέ…) sitting on
   * the OUTERMOST clause: Lowfat wraps it as a subordinator over the real clause,
   * but when that clause is the document root nothing links to it, so the
   * connective's stashed label is never consumed and its node would vanish from
   * every view (the missing-οὖν bug). Idempotent: a word already attached or used
   * as a referenced label is left untouched.
   */
  rescueOrphans(rootId: string): void {
    const attached = new Set<string>();
    const labelled = new Set<string>();
    for (const r of this.relations) {
      attached.add(r.dependentId);
      if (r.labelNodeId) labelled.add(r.labelNodeId);
    }
    for (const n of this.nodes) {
      if (n.kind !== 'word' || !n.tokenIds.length) continue;
      if (n.id === rootId || attached.has(n.id) || labelled.has(n.id)) continue;
      const tok = this.tokens.find((t) => n.tokenIds.includes(t.id));
      const role: SyntacticRole =
        tok?.pos === 'particle' ? 'particle' : tok?.pos === 'conjunction' ? 'conjunction' : 'adjunct';
      this.rel(role, rootId, n.id);
    }
  }

  private headChild(el: Element): Element | undefined {
    const kids = constituents(el);
    return (
      kids.find((c) => c.getAttribute('head') === 'true') ??
      this.dialect.headFallback?.(kids, el) ??
      kids[0]
    );
  }

  private isAdjective(el: Element): boolean {
    if (tag(el) === 'w') return el.getAttribute('class') === 'adj';
    const h = this.headChild(el);
    return h ? this.isAdjective(h) : false;
  }

  /** The ultimate head WORD of a constituent (following head marking down). */
  private ultimateHeadWord(el: Element): Element | undefined {
    if (tag(el) === 'w') return el;
    const h = this.headChild(el);
    return h ? this.ultimateHeadWord(h) : undefined;
  }

  /**
   * A CLASSLESS `<wg>` that SBLGNT writes for a PHRASE-level coordination — a
   * rule like `NpaNp` / `PpaPp` / `NpNp` joining PHRASES (never clauses).
   * Nestle1904 puts a `class` on such groups, so `convert`'s classless→clause
   * default was fine there; SBLGNT leaves them classless with only a `rule`, so
   * without this they fall through to `convertClause` and get mangled — a
   * coordinate member (the object "Ἰάκωβον … καὶ Ἰωάννην …" in Mark 1:19) is
   * mistaken for a bare subordinator word and collapsed to a single token.
   * Clause coordinations (rule mentions CL) and verb-phrase coordinations stay
   * clauses.
   */
  private isPhraseCoordination(el: Element): boolean {
    if (tag(el) !== 'wg' || el.getAttribute('class')) return false;
    return isPhraseCoordinationRule(el.getAttribute('rule') ?? '');
  }

  /** Convert any constituent, returning the id of its representative node. */
  convert(el: Element): string {
    if (tag(el) === 'w') return this.wordNode(el);
    const cls = el.getAttribute('class');
    if (cls === 'pp') {
      return classifyLowfatRule(el.getAttribute('rule') ?? '').contrastive
        ? this.convertContrastivePp(el)
        : this.convertPp(el);
    }
    if (cls === 'cl' || el.getAttribute('role') === 'cl' || !cls) {
      // A classless SBLGNT phrase coordination is a PHRASE, not a clause.
      if (!cls && this.isPhraseCoordination(el)) return this.convertPhrase(el);
      return this.convertClause(el);
    }
    return this.convertPhrase(el);
  }

  /**
   * A CONTRASTIVE coordination of prepositional phrases — Lowfat's "notPPbutPP"
   * ("οὐκ ἀπ’ ἀνθρώπων οὐδὲ δι’ ἀνθρώπου ἀλλὰ διὰ Ἰησοῦ Χριστοῦ …", Gal 1:1). The
   * source nests the negated phrase(s) and the "but" phrase under one wrapper (the
   * "but" PP marked head); percolating that naively makes the negated phrases
   * modifiers of the "but" preposition, which the layout's PP path then silently
   * drops — losing the whole "not from men…" clause. Flatten it instead into ONE
   * coordination whose members are EVERY constituent PP (a nested PP-coordination
   * flattened too), joined by the negator/conjunctions — the fork Reed-Kellogg
   * draws for "not X nor Y but Z".
   */
  private convertContrastivePp(el: Element): string {
    const members: Element[] = []; // each a simple prep+object PP
    const connectors: Element[] = []; // οὐκ (negator adv) · οὐδέ · ἀλλά
    const collect = (node: Element): void => {
      for (const c of constituents(node)) {
        const cls = c.getAttribute('class');
        if (cls === 'pp') {
          if (constituents(c).some((x) => x.getAttribute('class') === 'prep')) members.push(c);
          else collect(c); // a nested pp-coordination wrapper: flatten its members
        } else if (cls === 'conj' || cls === 'adv') {
          connectors.push(c);
        }
      }
    };
    collect(el);
    if (members.length < 2) return this.convertPhrase(el); // not a coordination after all
    const headId = this.convert(members[0]!);
    for (let i = 1; i < members.length; i++) this.rel('conjunct', headId, this.convert(members[i]!));
    // Every connector rides the coordination as a coordinator; the layout places
    // one BEFORE the first member (a leading negator, οὐκ) on the first slant, and
    // each one BETWEEN members on the bar of the join it introduces.
    for (const w of connectors) this.rel('coordinator', headId, this.convert(w));
    return headId;
  }

  /** A prepositional phrase: the preposition governs the (head) object. */
  private convertPp(el: Element): string {
    const kids = constituents(el);
    const prepEl = kids.find((c) => c.getAttribute('class') === 'prep');
    const objEl = this.headChild(el);
    if (!prepEl || !objEl) return this.convertPhrase(el);
    const prepId = this.wordNode(prepEl);
    const objId = this.convert(objEl);
    this.rel('prepositionObject', prepId, objId);
    this.stampCategory(prepId, 'pp');
    return prepId; // the preposition is what the governor attaches to
  }

  /**
   * Record the SOURCE phrase category (Lowfat `<wg class>`: np/vp/pp/adjp/advp) on
   * the head word's token, under `morphology.extra.cat`. This is purely additive —
   * it changes no node or relation — so the KR / Block / Dependency layouts are
   * untouched; only the Constituency view reads it, preferring this gold-standard
   * label over the POS-based estimate. Innermost (most specific) category wins.
   */
  private stampCategory(repNodeId: string, cls: string | null): void {
    const cat = cls ? PHRASE_CAT[cls] : undefined;
    if (!cat) return;
    const node = this.nodes.find((n) => n.id === repNodeId);
    const tokId = node?.tokenIds[0];
    const tok = tokId ? this.tokens.find((t) => t.id === tokId) : undefined;
    if (!tok) return;
    const extra = { ...(tok.morphology?.extra ?? {}) };
    if (extra.cat) return; // keep the first (innermost) category seen
    extra.cat = cat;
    tok.morphology = { ...(tok.morphology ?? {}), extra };
  }

  /** A clause: the verb is the predicate; arguments hang off verb or clause. */
  private convertClause(el: Element): string {
    const kids = constituents(el);
    const verbEl = kids.find((c) => c.getAttribute('role') === 'v' || c.getAttribute('role') === 'vc');
    // Roles a copula could link. Only a clause that actually carries one of these
    // is a (possibly verbless) PREDICATION; a clause with none is a bare wrapper
    // Lowfat puts around the real clause (e.g. <wg role="cl"> over <wg class="cl">).
    const hasPredArg = kids.some(
      (c) => c !== verbEl && PRED_ARG_ROLES.has(c.getAttribute('role') ?? ''),
    );

    // A verbless wrapper with nothing to predicate is not an "(is)" clause —
    // synthesizing an implied copula here invents a spurious empty subject and a
    // floating predicate. Recover the real structure instead of leaving an empty
    // "(subject)|(verb)" baseline with dangling adjuncts:
    //   • a lone child            → pass straight through
    //   • ≥2 clause children      → a COORDINATE clause (conjuncts + coordinator)
    //   • 1 clause + bare conj(s) → pass the clause through, the conjunction
    //                               becoming the SUBORDINATOR label on its link
    //   • only words              → a bare container (last resort)
    if (!verbEl && !hasPredArg) {
      if (kids.length === 1) return this.convert(kids[0]!);
      const clauseKids = kids.filter((c) => this.isClauseLike(c));
      const wordKids = kids.filter((c) => !this.isClauseLike(c));

      if (clauseKids.length >= 2) {
        const clauseId = this.makeClause(el, 'coordinate');
        for (const c of clauseKids) this.rel('conjunct', clauseId, this.convert(c));
        for (const w of wordKids) {
          // A real conjunction joins the conjuncts; a discourse particle (γε,
          // μέν…) is not a coordinator — give it the `particle` role so it stays
          // visible in the clause instead of being exiled to the fork bar.
          const role = isCoordinatorWord(w)
            ? 'coordinator'
            : w.getAttribute('class') === 'ptcl'
              ? 'particle'
              : 'adjunct';
          this.rel(role, clauseId, this.convert(w));
        }
        return clauseId;
      }

      if (clauseKids.length === 1) {
        // The bare word(s) are the subordinator (ὅτι, ἵνα, ὡς …) introducing the
        // clause. Give them a NODE (token + word) so the source text is complete
        // and the connector is SELECTABLE with full word details — but DON'T
        // attach it anywhere in the tree, so it is never drawn as a separate
        // baseline word; it rides the connecting line as the clause's label, and
        // the linking relation points at it via `labelNodeId`.
        const subParts: string[] = [];
        let subNodeId: string | undefined;
        for (const kid of kids) {
          if (this.isClauseLike(kid)) continue;
          const nodeId = this.wordNode(kid); // token + node, but left unattached
          if (subNodeId === undefined) subNodeId = nodeId; // label points at the first
          const s = (kid.textContent ?? '').trim();
          if (s) subParts.push(s);
        }
        const rep = this.convert(clauseKids[0]!);
        const sub = subParts.join(' ');
        if (sub && !this.subLabel.has(rep)) this.subLabel.set(rep, sub);
        if (subNodeId && !this.subLabelNode.has(rep)) this.subLabelNode.set(rep, subNodeId);
        return rep;
      }

      // A CLASSLESS `<wg>` with NO clause content at all is a PHRASE, not a
      // clause — an SBLGNT coordination-member wrapper such as "καὶ + <NP>"
      // (the "καὶ Ἰωάννην …" arm of the Mark 1:19 object). Convert it as a
      // phrase (the conjunction becomes a coordinator, the content phrase its
      // head) instead of fabricating an adjunct-only clause, which would bury
      // the member below a spurious "(subject)/(verb)" baseline. A `class="cl"`
      // wrapper is left to the last-resort container below.
      if (clauseKids.length === 0 && !el.getAttribute('class')) {
        return this.convertPhrase(el);
      }

      const clauseId = this.makeClause(el, 'unknown');
      for (const child of kids) this.rel('adjunct', clauseId, this.convert(child));
      return clauseId;
    }

    const clauseId = this.makeClause(el, 'unknown');

    let verbId: string;
    if (verbEl) {
      verbId = isPeriphrasticVp(verbEl) ? this.periphrasticPredicate(verbEl) : this.convert(verbEl);
    } else {
      // Verbless predication (a greeting: nominative + dative, no verb): supply
      // an implied copula to anchor the subject and complement.
      verbId = `impl_${clauseId}`;
      this.nodes.push({
        id: verbId,
        kind: 'word',
        tokenIds: [],
        role: 'predicate',
        implied: true,
        // The elided copula, in the passage's own language: Greek ἐστίν, but
        // Hebrew has no copula word, so a verbless clause is marked "(is)" rather
        // than borrowing the Greek form.
        label: this.dialect.language === 'grc' ? '(ἐστίν)' : '(is)',
        provenance: { source: 'given', confidence: 'high' },
      });
    }
    this.rel('predicate', clauseId, verbId);

    for (const child of kids) {
      if (child === verbEl) continue;
      const rep = this.convert(child);
      const mapped = normalizeLowfatClauseRole(child.getAttribute('role'), {
        // Only explicit `voice="passive"` triggers the accusative downgrade —
        // middle-passive forms keep a real object (the middle reading takes one).
        passiveVerb: Boolean(
          verbEl && this.ultimateHeadWord(verbEl)?.getAttribute('voice') === 'passive',
        ),
        accusative: this.ultimateHeadWord(child)?.getAttribute('case') === 'accusative',
        isPp: child.getAttribute('class') === 'pp',
        isAdjective: this.isAdjective(child),
      });
      this.rel(
        mapped.type,
        mapped.attachTo === 'verb' ? verbId : clauseId,
        rep,
        undefined,
        mapped.provenance,
      );
    }
    return clauseId;
  }

  /**
   * An NP in which the ARTICLE nominalizes a prepositional phrase — τὰ παρ᾽
   * αὐτῆς ("the things belonging to her"), τὰ περὶ τοῦ Ἰησοῦ ("the things
   * concerning Jesus") — rather than agreeing with a substantive head word.
   * Detected when the np carries a det child, its ultimate head word is NOT a
   * noun/pronoun (so the article is the nominalizer), and the phrase content is
   * a PP (a direct child, or a direct child of the head-marked inner np —
   * Lowfat writes both shapes: `NpPp` heads the article, `DetNP`+`PpNp2Np`
   * heads a quantifier like πάντα). Returns the pieces, or null when this is an
   * ordinary NP.
   */
  private articularPpParts(
    el: Element,
  ): { det: Element; pps: Element[]; mods: Element[] } | null {
    if (el.getAttribute('class') !== 'np') return null;
    const kids = constituents(el);
    const det = kids.find((c) => tag(c) === 'w' && c.getAttribute('class') === 'det');
    if (!det) return null;
    const headEl = this.headChild(el);
    const headWord = headEl && headEl !== det ? this.ultimateHeadWord(headEl) : undefined;
    const headCls = headWord?.getAttribute('class');
    if (headCls === 'noun' || headCls === 'pron') return null; // ordinary articular NP
    const pps: Element[] = [];
    const mods: Element[] = [];
    for (const c of kids) {
      if (c === det) continue;
      if (c.getAttribute('class') === 'pp') {
        pps.push(c);
      } else if (c === headEl && tag(c) === 'wg' && c.getAttribute('class') === 'np') {
        // one level of flattening: the inner np holding the PP plus modifiers
        for (const inner of constituents(c)) {
          if (inner.getAttribute('class') === 'pp') pps.push(inner);
          else mods.push(inner);
        }
      } else {
        mods.push(c);
      }
    }
    return pps.length ? { det, pps, mods } : null;
  }

  /**
   * Root an articular PP on its ARTICLE — the substantival reading. The PP
   * hangs beneath the article, and any quantifier/adjective (πάντα) modifies
   * the whole nominalized phrase instead of being promoted to phrase head (the
   * source marks πάντα `head="true"`, which naive percolation would otherwise
   * turn into a bare "direct object" — the Mark 5:26 bug). Both Mark 5 shapes
   * come out identical, so the presence of πάντα no longer forces an
   * artificial structural difference. Relations that re-read the source's head
   * marking are stamped `converted` with the raw source role preserved.
   */
  private convertArticularPp(
    el: Element,
    { det, pps, mods }: { det: Element; pps: Element[]; mods: Element[] },
  ): string {
    const detId = this.wordNode(det);
    const detNode = this.nodes.find((n) => n.id === detId);
    if (detNode && !detNode.role) detNode.role = 'substantivalPrepositionalPhrase';
    this.stampCategory(detId, el.getAttribute('class'));
    for (const pp of pps) {
      this.rel('prepositionalPhrase', detId, this.convert(pp), undefined, {
        source: 'converted',
        confidence: 'high',
        sourceRole: pp.getAttribute('head') === 'true' ? 'head' : undefined,
      });
    }
    const rule = el.getAttribute('rule') ?? '';
    for (const m of mods) {
      const mapped = this.phraseChildRole(m, rule, false);
      // A bare word beside the nominalized phrase reads as its modifier, not an
      // apposition to it.
      const role = mapped === 'apposition' ? 'adjectival' : mapped;
      this.rel(role, detId, this.convert(m), undefined, {
        source: 'converted',
        confidence: 'medium',
        sourceRole: m.getAttribute('head') === 'true' ? 'head' : (m.getAttribute('role') ?? undefined),
      });
    }
    return detId;
  }

  /** A phrase (np/vp/adjp/advp): head plus modifiers attached beneath it. */
  private convertPhrase(el: Element): string {
    const substantival = this.articularPpParts(el);
    if (substantival) return this.convertArticularPp(el, substantival);
    const head = this.headChild(el);
    if (!head) return `w_${this.key(el)}`;
    const repId = this.convert(head);
    this.stampCategory(repId, el.getAttribute('class'));
    const rule = el.getAttribute('rule') ?? '';
    const coordinated = isCoordinationRule(rule);
    for (const child of constituents(el)) {
      if (child === head) continue;
      const rep = this.convert(child);
      let role = this.phraseChildRole(child, rule, coordinated);
      // A prepositional phrase the source wrapped WITHOUT a class (a classless
      // "Conj2Pp" coordination of PPs — ἐν τοῖς οὐρανοῖς καὶ ἐπὶ τῆς γῆς
      // modifying πάντα in Col 1:16) falls through `phraseChildRole` to the
      // apposition default; its converted head is a preposition, so treat it as
      // the PP modifier it is — otherwise it renames the head on the baseline
      // (an inline "=" fork) instead of hanging beneath it as a phrase.
      if (role === 'apposition' && this.headTokenPos(rep) === 'preposition') {
        role = 'prepositionalPhrase';
      }
      // An article/adjective on an articular clause (τοῖς οὖσιν ἐν Φιλίπποις —
      // "the [ones] who are…") modifies the participle that heads it, so it hangs
      // on a diagonal beneath the verb, not floating beside the whole clause.
      const target =
        (role === 'determiner' || role === 'adjectival') ? this.headWordOf(repId) : repId;
      this.rel(role, target, rep);
    }
    return repId;
  }

  /** POS of a node's first token (its head word), if any — used to tell a
   *  preposition-headed subtree from a nominal one when the source left the
   *  wrapping constituent unclassed. */
  private headTokenPos(nodeId: string): string | undefined {
    const node = this.nodes.find((n) => n.id === nodeId);
    const tid = node?.tokenIds[0];
    return tid ? this.tokens.find((t) => t.id === tid)?.pos : undefined;
  }

  /** The word a modifier should attach to: a clause delegates to its predicate. */
  private headWordOf(nodeId: string): string {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (node?.kind !== 'clause') return nodeId;
    const pred = this.relations.find((r) => r.headId === nodeId && r.type === 'predicate');
    return pred?.dependentId ?? nodeId;
  }

  /** Map a non-head phrase child to a Kellogg-Reed relation. */
  private phraseChildRole(child: Element, rule: string, coordinated: boolean): SyntacticRole {
    return normalizeLowfatPhraseRole(child, rule, coordinated, (el) => this.isAdjective(el));
  }
}

/** Everything about a clause child the clause-role normalization needs. */
export interface LowfatClauseChildContext {
  /** The clause's verb is EXPLICITLY passive (`voice="passive"`; never middle-passive). */
  passiveVerb: boolean;
  /** The child's ultimate head word is accusative. */
  accusative: boolean;
  /** The child is a prepositional phrase. */
  isPp: boolean;
  /** The child's ultimate head word is an adjective. */
  isAdjective: boolean;
}

export interface NormalizedClauseRole {
  type: SyntacticRole;
  /** Whether the relation hangs off the predicate or the clause node. */
  attachTo: 'verb' | 'clause';
  /** Set only when the mapping is interpretive (beyond a 1:1 relabelling). */
  provenance?: Provenance;
}

/**
 * Map a Lowfat clause-child `role` attribute (s / o / o2 / io / p / adv) to
 * the app relation it becomes — the clause-level source-role normalization,
 * in one named place. Two mappings are deliberately interpretive:
 *
 *   • a PASSIVE verb's accusative "o" is not claimed as an ordinary direct
 *     object (μηδὲν ὠφεληθεῖσα, Mark 5:26): Greek allows an accusative of
 *     extent/respect or a retained accusative here, and the source's bare
 *     `o` does not decide — the neutral `accusativeModifier` says exactly
 *     as much as is known, with the raw source role preserved in provenance;
 *   • a predicate complement that is a PP (οὖσιν ἐν Φιλίπποις) is
 *     locative/adverbial in KR — it hangs under the verb, not on the
 *     baseline as a predicate noun.
 */
export function normalizeLowfatClauseRole(
  role: string | null,
  ctx: LowfatClauseChildContext,
): NormalizedClauseRole {
  switch (role) {
    case 's':
      return { type: 'subject', attachTo: 'clause' };
    case 'o':
      if (ctx.passiveVerb && ctx.accusative) {
        return {
          type: 'accusativeModifier',
          attachTo: 'verb',
          provenance: { source: 'converted', confidence: 'medium', sourceRole: 'o' },
        };
      }
      return { type: 'directObject', attachTo: 'verb' };
    case 'o2':
      return { type: 'objectComplement', attachTo: 'verb' };
    case 'io':
      return { type: 'indirectObject', attachTo: 'verb' };
    case 'p':
      if (ctx.isPp) return { type: 'adverbial', attachTo: 'verb' };
      return {
        type: ctx.isAdjective ? 'predicateAdjective' : 'predicateNominative',
        attachTo: 'verb',
      };
    case 'adv':
      return { type: 'adverbial', attachTo: 'verb' };
    default:
      return { type: 'adjunct', attachTo: 'clause' };
  }
}

/**
 * Map a NON-HEAD phrase child to the app role it plays under its head —
 * the phrase-level source-role normalization, in one named place. `rule` is
 * the PARENT group's rule; `coordinated` says the parent is a coordination
 * fork; `isAdjective` resolves a constituent's ultimate head word (which
 * needs the converter's head logic, hence injected).
 */
export function normalizeLowfatPhraseRole(
  child: Element,
  rule: string,
  coordinated: boolean,
  isAdjective: (el: Element) => boolean,
): SyntacticRole {
  const role = child.getAttribute('role');
  if (role === 'adv') return 'adverbial';
  const cls = child.getAttribute('class');
  // An adverb (or adverb phrase) modifying a noun phrase — e.g. the focusing
  // καί "also" in "καὶ ὁ Θεός" (rule AdvpNp) — is adverbial: it slants under its
  // head, not onto the baseline as an apposition. (`class="adv"`, no `role`.)
  if (cls === 'adv' || cls === 'advp') return 'adverbial';
  // Determiners: Greek `det`, Hebrew article `art`, and the Hebrew direct-object
  // marker אֵת (`om`), which rides a slant under the noun it marks.
  if (cls === 'det' || cls === 'art' || cls === 'om') return 'determiner';
  // Coordinators: a real conjunction (Greek `conj`, Hebrew `cj`) or the
  // coordinating particle τε. A non-coordinating particle (γε, μέν…) keeps the
  // `particle` role rather than being mistaken for a conjunction.
  if (isCoordinatorWord(child)) return 'coordinator';
  if (cls === 'ptcl') return 'particle';
  // Coordination is decided FIRST, so a coordinated sibling constituent becomes
  // a CONJUNCT of the head rather than being mis-read as a modifier of it. This
  // is what fixes a dropped second PP in "ἐν τοῖς οὐρανοῖς καὶ ἐπὶ τῆς γῆς"
  // (rule "Conj2Pp"): without it, the ἐπὶ phrase becomes a `prepositionalPhrase`
  // hanging off ἐν, which the layout engine's PP fast-path then silently drops.
  if (coordinated) return 'conjunct';
  if (cls === 'pp') return 'prepositionalPhrase';
  // A cardinal numeral quantifying a noun ("πέντε ἄρτους", "τὰ τρία ταῦτα")
  // is adjectival — it slants under the noun like any quantifier, not onto the
  // baseline as an apposition (the final fall-through default).
  if (cls === 'adj' || cls === 'adjp' || cls === 'num') return 'adjectival';
  if (cls === 'cl') return 'adjectival'; // relative/attributive clause
  // Noun-level: genitive vs apposition, from the parent rule.
  const ruleClass = classifyLowfatRule(rule);
  if (ruleClass.apposition) return 'apposition';
  if (ruleClass.genitive) return 'genitive';
  if (isAdjective(child)) return 'adjectival';
  return child.getAttribute('case') === 'genitive' ? 'genitive' : 'apposition';
}

/**
 * A Lowfat `<wg class="vp" rule="BeVerb">` that is a PERIPHRASTIC verb form: a
 * finite copula (εἰμί) plus a participle carrying the lexical content — ἐστιν
 * εἰργασμένα ("have been wrought"), ἦν βαπτίζων ("was baptizing"). Lowfat marks
 * the participle as the phrase head, which would make the participle the clause
 * predicate and leave the finite verb hanging beneath it as a stray apposition.
 * Reed-Kellogg instead writes the whole periphrasis on the baseline as one
 * compound verb, so the converter realizes it as a single multi-token predicate.
 * Guarded by the presence of BOTH a participle and a finite verb, so any
 * non-periphrastic BeVerb phrase is left to the ordinary head-percolation path.
 */
function isPeriphrasticVp(el: Element): boolean {
  if (tag(el) !== 'wg' || (el.getAttribute('rule') ?? '').toLowerCase() !== 'beverb') return false;
  const ws = Array.from(el.querySelectorAll('w'));
  const hasParticiple = ws.some((w) => w.getAttribute('mood') === 'participle');
  const hasFinite = ws.some(
    (w) => w.getAttribute('class') === 'verb' && w.getAttribute('mood') !== 'participle',
  );
  return hasParticiple && hasFinite;
}

/**
 * Whether a phrase `rule` marks a COORDINATION of like constituents (a fork)
 * rather than a head with modifiers. Lowfat encodes coordination three ways:
 *   • a "Conj…" head — an explicit conjunction joins the conjuncts
 *     (Conj2Pp, Conj3Np, Conj2VP, Conj-CL…);
 *   • an "a"(=καί) infix/prefix list — NpaNp, aNpaNp, aPpaPp, 2PpaPp…;
 *   • an asyndetic run of ONE repeated category — NpNpNp, PpPp, ClClCl,
 *     AdjAdj… (a bare list with no conjunction; still a fork, not apposition).
 * A modifier structure (NpPp, AdjpNp, NpAdjp, Np-Appos…) matches none of these,
 * so its pp/adjp/clause child stays a modifier.
 */
export function isCoordinationRule(rule: string): boolean {
  if (/^conj/i.test(rule)) return true;
  // The "a"(=καί) infix/prefix list joins CAPITALISED category codes
  // (NpaNp, aPpaPp, 2PpaPp…). Match the category after the coordinator
  // case-SENSITIVELY so an ordinary 'a' inside a rule WORD is not mistaken for
  // the coordinator — e.g. "QuanPp" (a quantifier πάντα modified by a PP) must
  // NOT be read as a coordination just because "Qu·an·Pp" contains "anp".
  if (/(^|[a-zA-Z])a(N[Pp]|P[Pp]|Adjp?|V[Pp]|C[Ll])/.test(rule)) return true;
  return /^\d*(np|adjp|adj|vp|pp|cl)(\1)+$/i.test(rule);
}

/**
 * One classification of a Lowfat `rule` string, replacing the scattered
 * regexes the converter used to apply in place. Everything here reads the
 * RULE only — the element's class/role/children still decide how the flags
 * are used. Behavior-preserving extraction: each flag reproduces the exact
 * test previously inlined at its call site.
 */
export interface LowfatRuleClassification {
  /** A coordination fork of like constituents, at any level. */
  coordination: boolean;
  /** Mentions a clause/verb-phrase category (a classless wg with this stays a clause). */
  clauseLike: boolean;
  /** A PHRASE-level coordination — coordination that never involves cl/vp
   *  (the classless SBLGNT `NpaNp`/`PpaPp` wrappers; Mark 1:19–20). */
  phraseCoordination: boolean;
  /** A contrastive "not X but Y" coordination (Lowfat "notPPbutPP" rules). */
  contrastive: boolean;
  /** An apposition-like rule (Np-Appos …). */
  apposition: boolean;
  /** A genitive / of-NP rule (NPofNP, ofNPNP …). */
  genitive: boolean;
}

export function classifyLowfatRule(rule: string): LowfatRuleClassification {
  const coordination = isCoordinationRule(rule);
  const clauseLike = /cl|vp/i.test(rule);
  return {
    coordination,
    clauseLike,
    phraseCoordination: Boolean(rule) && coordination && !clauseLike,
    contrastive: /but/i.test(rule),
    apposition: /appos/i.test(rule),
    genitive: /ofnp|ofgen|gen/i.test(rule),
  };
}

/** A rule marking a PHRASE-level coordination (never clause/vp members). */
export function isPhraseCoordinationRule(rule: string): boolean {
  return classifyLowfatRule(rule).phraseCoordination;
}

/** A rule marking a CLAUSE-level (or verb-phrase) coordination. */
export function isClauseCoordinationRule(rule: string): boolean {
  const c = classifyLowfatRule(rule);
  return c.coordination && c.clauseLike;
}

/**
 * Particles (Lowfat `class="ptcl"`) that genuinely COORDINATE conjuncts — only
 * the connective τε ("and", "both…and"). Every other particle (γε, μέν, δή, γάρ,
 * οὖν, …) is emphatic/connective, NOT a conjunction: forcing it onto a
 * coordination fork buries it as a rotated "coordinator" far from where it
 * stands in the clause (the bug behind the missing initial γε in Phil 3:8). Such
 * particles take the dedicated `particle` role instead.
 */
const COORDINATING_PARTICLES = new Set(['τε']);

/** Accent-stripped, lower-cased lemma (or surface) of a word element. */
function bareLemma(el: Element): string {
  return (el.getAttribute('lemma') || el.textContent || '')
    .normalize('NFD')
    .replace(/[̀-ͯ᷀-᷿]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Whether a word actually coordinates conjuncts — a real conjunction (Greek
 * `conj`, Hebrew `cj`) or a coordinating particle (τε) — as opposed to a
 * discourse particle that merely colours the clause.
 */
function isCoordinatorWord(el: Element): boolean {
  const cls = el.getAttribute('class');
  if (cls === 'conj' || cls === 'cj') return true;
  if (cls === 'ptcl') return COORDINATING_PARTICLES.has(bareLemma(el));
  return false;
}

export interface LowfatDocOptions {
  /** Book name for titles, e.g. "Philippians". */
  book?: string;
  /** Leaf-read adapter (defaults to Nestle1904 macula-greek). */
  dialect?: LowfatDialect;
  /** Document-id prefix — `gnt` (Nestle1904, default) or `sblgnt`. The prefix
   *  is how `sourceOfDoc` tells editions apart, so it must stay distinct. */
  docIdPrefix?: string;
  /** When set, each document also preserves the source `<wg>` hierarchy
   *  verbatim as `sourceConstituency`, attributed to this source id. */
  sourceId?: string;
}

/**
 * Preserve a sentence's `<wg>` hierarchy VERBATIM as a source constituency
 * tree: categories, roles, rules, head/articular marking, and each leaf's
 * token id (matching the converter's `t_<source id>` tokens). Pure recording —
 * no interpretation — so the Constituency Tree can show exactly what the
 * source published.
 */
export function captureSourceConstituency(
  topWg: Element,
  dialect: LowfatDialect,
  sourceId: string,
  editionId?: string,
): SourceConstituencyTree {
  let seq = 0;
  const walk = (el: Element): SourceConstituencyNode => {
    const base = {
      id: `sc${seq++}`,
      cat: el.getAttribute('class') ?? undefined,
      role: el.getAttribute('role') ?? undefined,
      head: el.getAttribute('head') === 'true' ? true : undefined,
    };
    if (tag(el) === 'w') {
      const k = dialect.idOf(el);
      return { ...base, kind: 'word', tokenIds: k ? [`t_${k}`] : [], children: [] };
    }
    return {
      ...base,
      kind: 'wg',
      rule: el.getAttribute('rule') ?? undefined,
      articular: el.getAttribute('articular') === 'true' ? true : undefined,
      children: constituents(el).map(walk),
    };
  };
  return { sourceId, ...(editionId ? { editionId } : {}), root: walk(topWg) };
}

/** Convert every `<sentence>` in a Lowfat book into a standalone document. */
export function lowfatToDocuments(xml: string, opts: LowfatDocOptions = {}): KrDocument[] {
  const dom = parseXml(xml);
  const book = opts.book ?? dom.querySelector('book')?.getAttribute('name') ?? 'GNT';
  const sentences = Array.from(dom.querySelectorAll('sentence'));
  const docs: KrDocument[] = [];

  sentences.forEach((sentence, i) => {
    const topWg = sentence.querySelector('wg');
    if (!topWg) return;
    const conv = new SentenceConverter(`s${i}_`, opts.dialect ?? greekDialect);
    const rootId = conv.convert(topWg);
    if (!conv.tokens.length) return;
    // Rescue any word the tree walk left unattached (e.g. a clause-initial οὖν on
    // the outermost clause) so it isn't dropped from the diagram and the source text.
    conv.rescueOrphans(rootId);
    conv.orderTokensBySurface();

    const ref = verseRef(sentence);
    const ts = '2024-01-01T00:00:00.000Z';
    const dialect = opts.dialect ?? greekDialect;
    // Collapse coordinate clauses that share one subject into a compound
    // predicate (one subject, forked verbs) — the Reed-Kellogg reading.
    docs.push(
      mergeSharedSubjectPredicate({
        schemaVersion: SCHEMA_VERSION,
        id: `${opts.docIdPrefix ?? 'gnt'}_${slug(book)}_${i}`,
        title: ref ? `${book} ${ref}` : `${book} (${i + 1})`,
        language: 'grc',
        text: conv.tokens.map((t) => t.surface).join(' '),
        notes: '',
        createdAt: ts,
        updatedAt: ts,
        layoutHints: {},
        tokens: conv.tokens,
        syntax: { rootId, nodes: conv.nodes, relations: conv.relations },
        ...(opts.sourceId
          ? { sourceConstituency: captureSourceConstituency(topWg, dialect, opts.sourceId) }
          : {}),
      }),
    );
  });
  return docs;
}

function verseRef(sentence: Element): string | undefined {
  const ms = sentence.querySelectorAll('milestone[unit="verse"]');
  const ids = Array.from(ms).map((m) => m.getAttribute('id') || m.textContent || '');
  // Nestle1904 writes "Mark.5.25"; SBLGNT writes "MRK 5:25" — both end c(:|.)v.
  const verses = ids
    .map((id) => {
      const m = id.match(/(\d+)[:.](\d+)\s*$/);
      return m ? `${m[1]}:${m[2]}` : '';
    })
    .filter(Boolean);
  if (!verses.length) return undefined;
  return verses.length > 1 ? `${verses[0]}–${verses[verses.length - 1]!.split(':').pop()}` : verses[0];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
