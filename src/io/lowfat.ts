import type {
  KrDocument,
  Language,
  Morphology,
  PartOfSpeech,
  Relation,
  SyntacticRole,
  SyntaxNode,
  Token,
} from '@/domain/schema';
import { SCHEMA_VERSION } from '@/domain/schema';

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
 * `source: 'given'`, so nothing renders as a tentative guess.
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
   * Pick the head among children when NONE is marked `head="true"`. macula-greek
   * marks word-level heads, so the first child is right; macula-hebrew marks
   * heads only on word-GROUPS, so a leaf group (article + noun) needs the content
   * word chosen instead of the leading function morpheme. Defaults to the first.
   */
  headFallback?(kids: Element[]): Element | undefined;
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

  private rel(type: SyntacticRole, headId: string, dependentId: string, label?: string): void {
    if (headId === dependentId) return;
    this.relations.push({
      id: `r_${this.idPrefix}${this.seq++}`,
      type,
      headId,
      dependentId,
      // An explicit label wins; otherwise inherit a stashed subordinator, if any.
      label: label ?? this.subLabel.get(dependentId),
      provenance: { source: 'given', confidence: 'high' },
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

  /** Create (once) the token + word node for a `<w>` leaf, return the node id. */
  private wordNode(w: Element): string {
    const existing = this.wordNodeId.get(w);
    if (existing) return existing;
    const k = this.key(w);
    const tokenId = `t_${k}`;
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
    const nodeId = `w_${k}`;
    this.nodes.push({ id: nodeId, kind: 'word', tokenIds: [tokenId], provenance: { source: 'given', confidence: 'high' } });
    this.wordNodeId.set(w, nodeId);
    return nodeId;
  }

  /**
   * Create just the TOKEN for a `<w>` leaf (no syntax node), once. Used for a
   * subordinator/connector word that is shown as a relation LABEL rather than as
   * its own node — so it still appears in the source text and token stream
   * (complete + selectable) without being drawn twice on the diagram.
   */
  private wordToken(w: Element): void {
    if (this.wordNodeId.has(w)) return; // already realized by a node + token
    const tokenId = `t_${this.key(w)}`;
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

  private headChild(el: Element): Element | undefined {
    const kids = constituents(el);
    return (
      kids.find((c) => c.getAttribute('head') === 'true') ??
      this.dialect.headFallback?.(kids) ??
      kids[0]
    );
  }

  private isAdjective(el: Element): boolean {
    if (tag(el) === 'w') return el.getAttribute('class') === 'adj';
    const h = this.headChild(el);
    return h ? this.isAdjective(h) : false;
  }

  /** Convert any constituent, returning the id of its representative node. */
  convert(el: Element): string {
    if (tag(el) === 'w') return this.wordNode(el);
    const cls = el.getAttribute('class');
    if (cls === 'pp') return this.convertPp(el);
    if (cls === 'cl' || el.getAttribute('role') === 'cl' || !cls) return this.convertClause(el);
    return this.convertPhrase(el);
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
    return prepId; // the preposition is what the governor attaches to
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
        // clause. Keep them as TOKENS (in surface order, before the clause's own
        // tokens) so the source text is complete and they're selectable — but with
        // no node, since they ride the connecting line as the clause's label, not
        // as a separate word on the diagram.
        const subParts: string[] = [];
        for (const kid of kids) {
          if (this.isClauseLike(kid)) continue;
          this.wordToken(kid);
          const s = (kid.textContent ?? '').trim();
          if (s) subParts.push(s);
        }
        const rep = this.convert(clauseKids[0]!);
        const sub = subParts.join(' ');
        if (sub && !this.subLabel.has(rep)) this.subLabel.set(rep, sub);
        return rep;
      }

      const clauseId = this.makeClause(el, 'unknown');
      for (const child of kids) this.rel('adjunct', clauseId, this.convert(child));
      return clauseId;
    }

    const clauseId = this.makeClause(el, 'unknown');

    let verbId: string;
    if (verbEl) {
      verbId = this.convert(verbEl);
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
      const role = child.getAttribute('role');
      const rep = this.convert(child);
      switch (role) {
        case 's':
          this.rel('subject', clauseId, rep);
          break;
        case 'o':
          this.rel('directObject', verbId, rep);
          break;
        case 'o2':
          this.rel('objectComplement', verbId, rep);
          break;
        case 'io':
          this.rel('indirectObject', verbId, rep);
          break;
        case 'p':
          // A predicate that is a prepositional phrase (οὖσιν ἐν Φιλίπποις —
          // "being in Philippi") is locative/adverbial in KR: it hangs under the
          // verb like any adverbial, not on the baseline as a predicate noun.
          if (child.getAttribute('class') === 'pp') {
            this.rel('adverbial', verbId, rep);
          } else {
            this.rel(this.isAdjective(child) ? 'predicateAdjective' : 'predicateNominative', verbId, rep);
          }
          break;
        case 'adv':
          this.rel('adverbial', verbId, rep);
          break;
        default:
          this.rel('adjunct', clauseId, rep);
      }
    }
    return clauseId;
  }

  /** A phrase (np/vp/adjp/advp): head plus modifiers attached beneath it. */
  private convertPhrase(el: Element): string {
    const head = this.headChild(el);
    if (!head) return `w_${this.key(el)}`;
    const repId = this.convert(head);
    const rule = el.getAttribute('rule') ?? '';
    const coordinated = isCoordinationRule(rule);
    for (const child of constituents(el)) {
      if (child === head) continue;
      const rep = this.convert(child);
      const role = this.phraseChildRole(child, rule, coordinated);
      // An article/adjective on an articular clause (τοῖς οὖσιν ἐν Φιλίπποις —
      // "the [ones] who are…") modifies the participle that heads it, so it hangs
      // on a diagonal beneath the verb, not floating beside the whole clause.
      const target =
        (role === 'determiner' || role === 'adjectival') ? this.headWordOf(repId) : repId;
      this.rel(role, target, rep);
    }
    return repId;
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
    if (/appos/i.test(rule)) return 'apposition';
    if (/ofnp|ofgen|gen/i.test(rule)) return 'genitive';
    if (this.isAdjective(child)) return 'adjectival';
    return child.getAttribute('case') === 'genitive' ? 'genitive' : 'apposition';
  }
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
function isCoordinationRule(rule: string): boolean {
  if (/^conj/i.test(rule)) return true;
  if (/(^|[a-z])a(np|pp|adjp|adj|vp|cl)/i.test(rule)) return true;
  return /^\d*(np|adjp|adj|vp|pp|cl)(\1)+$/i.test(rule);
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
    const conv = new SentenceConverter(`s${i}_`, greekDialect);
    const rootId = conv.convert(topWg);
    if (!conv.tokens.length) return;
    conv.orderTokensBySurface();

    const ref = verseRef(sentence);
    const ts = '2024-01-01T00:00:00.000Z';
    docs.push({
      schemaVersion: SCHEMA_VERSION,
      id: `gnt_${slug(book)}_${i}`,
      title: ref ? `${book} ${ref}` : `${book} (${i + 1})`,
      language: 'grc',
      text: conv.tokens.map((t) => t.surface).join(' '),
      notes: '',
      createdAt: ts,
      updatedAt: ts,
      layoutHints: {},
      tokens: conv.tokens,
      syntax: { rootId, nodes: conv.nodes, relations: conv.relations },
    });
  });
  return docs;
}

function verseRef(sentence: Element): string | undefined {
  const ms = sentence.querySelectorAll('milestone[unit="verse"]');
  const ids = Array.from(ms).map((m) => m.getAttribute('id') || m.textContent || '');
  const verses = ids
    .map((id) => id.split('.').slice(1).join(':'))
    .filter(Boolean);
  if (!verses.length) return undefined;
  return verses.length > 1 ? `${verses[0]}–${verses[verses.length - 1]!.split(':').pop()}` : verses[0];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
