import type {
  GrammaticalCase,
  Gender,
  GrammaticalNumber,
  KrDocument,
  Mood,
  Morphology,
  PartOfSpeech,
  Person,
  Relation,
  SyntacticRole,
  SyntaxNode,
  Tense,
  Token,
  Voice,
} from '@/domain/schema';
import { SCHEMA_VERSION } from '@/domain/schema';

/**
 * Convert the **OpenText.org** annotation of the Greek New Testament
 * (OpenText-org/original_annotation, CC BY-SA 4.0) into our `KrDocument` model,
 * so it can be offered as an ALTERNATIVE syntax tree alongside the default
 * Nestle1904 Lowfat parse. Because every visualization is a lens over the one
 * shared syntax graph, a single converted document drives all four modes
 * (kellogg-reed · phrase-block · dependency · morphology) with no per-mode work.
 *
 * OpenText is a three-layer STANDOFF annotation keyed by word id (NT.Phlm.w1…):
 *   1. base/<book>.xml         word level — POS, morphology, LEMMA, Louw-Nida domains
 *   2. wordgroup/…-wg-chN.xml  phrase level — head + typed modifiers
 *   3. clause/…-cl-chN.xml     clause level — S / P / C / A components, embedding
 *
 * The base layer carries the LEMMA, not the inflected surface form (excluded for
 * copyright). The converter therefore emits lemma-form tokens; `alignOpenText`
 * (io/opentext-align.ts) fills in the inflected surface from the parallel
 * Nestle1904 passage. A diagram is still well-formed without alignment — it just
 * reads in dictionary forms.
 *
 * Every node/relation is stamped `source: 'given'`: this is a published analysis,
 * not a guess.
 */

// --- base (word) layer --------------------------------------------------------

/** OpenText POS code → our part of speech. A NON with a Louw-Nida "names"
 *  domain (major 93) is promoted to propernoun; a coordinating PAR to conjunction. */
const POS_CODE: Record<string, PartOfSpeech> = {
  NON: 'noun',
  PRO: 'pronoun',
  ADJ: 'adjective',
  ADV: 'adverb',
  ART: 'article',
  PRP: 'preposition',
  PAR: 'particle',
  VBF: 'verb',
  VBP: 'participle',
  VBN: 'infinitive',
};

/** Lemmas OpenText tags PAR (particle) that actually coordinate — render as conjunctions. */
const CONJUNCTION_LEMMAS = new Set([
  'καί', 'δέ', 'ἀλλά', 'ἤ', 'οὐδέ', 'οὔτε', 'τε', 'μηδέ', 'μήτε', 'εἴτε', 'γάρ', 'οὖν',
]);

const CASE: Record<string, GrammaticalCase> = {
  nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', voc: 'vocative',
};
const GENDER: Record<string, Gender> = {
  mas: 'masculine', fem: 'feminine', neu: 'neuter', com: 'common',
};
const NUMBER: Record<string, GrammaticalNumber> = {
  sing: 'singular', plur: 'plural', dual: 'dual',
};
const PERSON: Record<string, Person> = { '1st': 'first', '2nd': 'second', '3rd': 'third' };
const VOICE: Record<string, Voice> = {
  act: 'active', mid: 'middle', pas: 'passive', mop: 'middlepassive', mep: 'middlepassive',
};
const MOOD: Record<string, Mood> = {
  ind: 'indicative', sub: 'subjunctive', imp: 'imperative', opt: 'optative',
  inf: 'infinitive', ptc: 'participle',
};
const TENSE: Record<string, Tense> = {
  pre: 'present', imp: 'imperfect', fut: 'future', aor: 'aorist', per: 'perfect', plu: 'pluperfect',
};

interface BaseWord {
  id: string; // "NT.Phlm.w1"
  ref: string; // "NT.Phlm.1.1" → book.chapter.verse
  num: number; // numeric word index within the book (for reading order)
  lemma: string;
  pos: PartOfSpeech;
  morph?: Morphology;
  /** Louw-Nida semantic domains, "major.sub" (first sub only), for the inspector. */
  domains: string[];
}

export function parseXml(xml: string): Document {
  if (typeof DOMParser === 'undefined') {
    throw new Error('OpenText conversion requires a DOMParser (browser or happy-dom).');
  }
  return new DOMParser().parseFromString(expandSelfClosing(xml), 'application/xml');
}

/**
 * Expand self-closing tags (`<w .../>`) into explicit empty pairs
 * (`<w ...></w>`). OpenText writes its standoff word pointers as self-closing
 * elements; happy-dom's parser (used in tests) wrongly NESTS consecutive
 * self-closing siblings instead of closing them, which would collapse a clause's
 * word list into a single deep chain. The expansion is a no-op semantically and
 * is parsed correctly by both happy-dom and real browsers. The attribute run
 * `[^<>]*?` cannot cross a tag boundary, so `\/>` only fires on a genuine
 * self-closing tag (the OpenText attribute values never contain a literal `/>`).
 */
function expandSelfClosing(xml: string): string {
  return xml.replace(/<([A-Za-z_][\w.:-]*)([^<>]*?)\/>/g, '<$1$2></$1>');
}

function tag(el: Element): string {
  return el.tagName.toLowerCase();
}

/** xlink:href, tolerant of namespace-aware and prefix-literal parsers. */
function href(el: Element): string | null {
  return (
    el.getAttribute('xlink:href') ??
    el.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href') ??
    el.getAttribute('href')
  );
}

/** Direct child elements (no text nodes), optionally filtered by tag. */
function kids(el: Element, name?: string): Element[] {
  return Array.from(el.children).filter((c) => !name || tag(c) === name);
}

function wordNumber(id: string): number {
  const m = id.match(/w(\d+)$/);
  return m ? Number(m[1]) : 0;
}

/** Parse the base/<book>.xml word layer into a map of word id → BaseWord. */
export function parseBase(xml: string): Map<string, BaseWord> {
  const dom = parseXml(xml);
  const out = new Map<string, BaseWord>();
  for (const w of Array.from(dom.querySelectorAll('w'))) {
    const id = w.getAttribute('xml:id') ?? w.getAttribute('id');
    if (!id) continue;
    const ref = w.getAttribute('ref') ?? '';
    const posEl = kids(w, 'pos')[0];
    const posTag = posEl ? kids(posEl)[0] : undefined;
    const code = posTag ? posTag.tagName.toUpperCase() : '';
    const wf = kids(w, 'wf')[0];
    const lemma = (wf?.getAttribute('lex') || wf?.textContent || '').trim();
    const domains = kids(kids(w, 'sem')[0] ?? w, 'domain').map((d) => {
      const major = d.getAttribute('majorNum') ?? '';
      const sub = (d.getAttribute('subNum') ?? '').split(/\s+/)[0] ?? '';
      return sub ? `${major}.${sub}` : major;
    });

    let pos = POS_CODE[code] ?? 'unknown';
    if (pos === 'noun' && domains.some((d) => d.startsWith('93'))) pos = 'propernoun';
    if (pos === 'particle' && CONJUNCTION_LEMMAS.has(lemma)) pos = 'conjunction';

    out.set(id, { id, ref, num: wordNumber(id), lemma, pos, morph: morphOf(posTag), domains });
  }
  return out;
}

function morphOf(posTag: Element | undefined): Morphology | undefined {
  if (!posTag) return undefined;
  const m: Morphology = {};
  const g = (a: string) => posTag.getAttribute(a) ?? undefined;
  const set = <T,>(v: string | undefined, table: Record<string, T>, k: keyof Morphology) => {
    const mapped = v ? table[v] : undefined;
    if (mapped) (m as Record<string, unknown>)[k] = mapped;
  };
  set(g('cas'), CASE, 'case');
  set(g('gen'), GENDER, 'gender');
  set(g('num'), NUMBER, 'number');
  set(g('per'), PERSON, 'person');
  set(g('voc'), VOICE, 'voice');
  set(g('mod'), MOOD, 'mood');
  set(g('tf') ?? g('tns'), TENSE, 'tense');
  return Object.keys(m).length ? m : undefined;
}

// --- wordgroup (phrase) layer -------------------------------------------------

/** A modifier edge in the word-group layer: head word → (role, modifier head word). */
interface WgEdge {
  role: 'definer' | 'specifier' | 'qualifier' | 'relator' | 'connector';
  word: string;
}

interface WordGroups {
  /** head word id → its ordered modifier edges. */
  edges: Map<string, WgEdge[]>;
  /** word id → the head word it modifies (inverse of `edges`, excluding connectors). */
  parent: Map<string, string>;
  /** connector (conjunction) word ids. */
  connectors: Set<string>;
}

const WG_ROLE: Record<string, WgEdge['role']> = {
  'wg.definer': 'definer',
  'wg.specifier': 'specifier',
  'wg.qualifier': 'qualifier',
  'wg.relator': 'relator',
  'wg.connector': 'connector',
};

/** Parse a wordgroup chapter file into a flat head→modifier adjacency. */
export function parseWordGroups(xml: string): WordGroups {
  const dom = parseXml(xml);
  const edges = new Map<string, WgEdge[]>();
  const parent = new Map<string, string>();
  const connectors = new Set<string>();

  // Every `wg.word` element carries one head word and, in its direct
  // `wg.modifiers`, the typed modifier word-groups. Reading each element's DIRECT
  // modifiers (recursion falls out because every wg.word is visited) yields the
  // whole tree as adjacency.
  for (const ww of Array.from(dom.getElementsByTagName('wg.word'))) {
    const head = href(ww);
    if (!head) continue;
    const mods = kids(ww, 'wg.modifiers')[0];
    if (!mods) continue;
    for (const mod of kids(mods)) {
      const role = WG_ROLE[tag(mod)];
      if (!role) continue;
      const inner = kids(mod, 'wg.word')[0] ?? kids(mod)[0];
      const dep = inner ? href(inner) : null;
      if (!dep) continue;
      if (role === 'connector') {
        connectors.add(dep);
        continue;
      }
      (edges.get(head) ?? edges.set(head, []).get(head)!).push({ role, word: dep });
      parent.set(dep, head);
    }
  }
  // A `wg.connector` may also sit as a sibling of `wg.head` inside a `wg.group`.
  for (const c of Array.from(dom.getElementsByTagName('wg.connector'))) {
    const inner = kids(c, 'wg.word')[0] ?? kids(c)[0];
    const w = inner ? href(inner) : null;
    if (w) connectors.add(w);
  }
  return { edges, parent, connectors };
}

// --- conversion ---------------------------------------------------------------

const GIVEN = { source: 'given', confidence: 'high' } as const;
const COPULA_LEMMAS = new Set(['εἰμί', 'γίνομαι', 'ὑπάρχω']);

/** Map a clause component element tag to its argument role. */
const COMPONENT_TAG = new Set(['cl.s', 'cl.p', 'cl.c', 'cl.a', 'cl.add', 'pl.conj']);

class OpenTextConverter {
  readonly tokens: Token[] = [];
  readonly nodes: SyntaxNode[] = [];
  readonly relations: Relation[] = [];
  private nodeOf = new Map<string, string>(); // word id → its word-node id
  private seq = 0;

  /** word id → its 1-based position within its verse (for surface alignment). */
  private readonly wvi = new Map<string, number>();

  constructor(
    private readonly base: Map<string, BaseWord>,
    private readonly wg: WordGroups,
  ) {
    const byVerse = new Map<string, BaseWord[]>();
    for (const bw of base.values()) (byVerse.get(bw.ref) ?? byVerse.set(bw.ref, []).get(bw.ref)!).push(bw);
    for (const list of byVerse.values()) {
      list.sort((a, b) => a.num - b.num);
      list.forEach((bw, i) => this.wvi.set(bw.id, i + 1));
    }
  }

  private rel(type: SyntacticRole, headId: string, dependentId: string, label?: string): void {
    if (!headId || !dependentId || headId === dependentId) return;
    this.relations.push({ id: `r_ot${this.seq++}`, type, headId, dependentId, label, provenance: GIVEN });
  }

  /** Create (once) the token + word node for a base word, return the node id. */
  private wordNode(wordId: string): string {
    const existing = this.nodeOf.get(wordId);
    if (existing) return existing;
    const bw = this.base.get(wordId);
    const tokenId = `t_${wordId}`;
    // Carry the canonical ref + Louw-Nida domains in morphology.extra as
    // alignment/inspection anchors (the same slot Lowfat uses for osisId/Strong's).
    let morphology = bw?.morph;
    if (bw) {
      // `ref` drops the "NT." prefix to match Nestle1904's osisId verse ("Phlm.1.1");
      // `wvi` is the within-verse index, the alignment key Nestle1904 spells "!n".
      const extra: Record<string, string> = { ref: bw.ref.replace(/^NT\./, ''), wvi: String(this.wvi.get(wordId) ?? 0) };
      if (bw.domains.length) extra.louwNida = bw.domains.join(' ');
      morphology = { ...(morphology ?? {}), extra };
    }
    this.tokens.push({
      id: tokenId,
      index: this.tokens.length,
      surface: bw?.lemma ?? wordId,
      language: 'grc',
      pos: bw?.pos ?? 'unknown',
      lemma: bw?.lemma,
      morphology,
      provenance: GIVEN,
    });
    const nodeId = `w_${wordId}`;
    this.nodes.push({ id: nodeId, kind: 'word', tokenIds: [tokenId], provenance: GIVEN });
    this.nodeOf.set(wordId, nodeId);
    return nodeId;
  }

  /** Kellogg-Reed role for a word-group modifier edge, by the modifier's morphology. */
  private modRole(edge: WgEdge): SyntacticRole {
    const w = this.base.get(edge.word);
    const pos = w?.pos;
    const gen = w?.morph?.case === 'genitive';
    switch (edge.role) {
      case 'definer':
        return pos === 'article' ? 'determiner' : gen ? 'genitive' : 'apposition';
      case 'specifier':
        return pos === 'article' ? 'determiner' : pos === 'numeral' ? 'determiner' : 'adjectival';
      case 'qualifier':
        if (this.isPrepositional(edge.word)) return 'prepositionalPhrase';
        if (pos === 'adjective') return 'adjectival';
        if (gen) return 'genitive';
        return 'apposition';
      default:
        return 'adjunct';
    }
  }

  /** Whether a word heads a prepositional group (carries a `relator`). */
  private isPrepositional(wordId: string): boolean {
    return (this.wg.edges.get(wordId) ?? []).some((e) => e.role === 'relator');
  }

  /**
   * Build the phrase headed by `wordId` and return its representative node. A
   * prepositional group is represented by its PREPOSITION (which governs the head
   * as `prepositionObject`), mirroring the Lowfat converter, so the layout
   * engine's PP path writes the preposition on the slant.
   */
  private buildPhrase(wordId: string, seen: Set<string>): string {
    const nodeId = this.wordNode(wordId);
    if (seen.has(wordId)) return nodeId;
    seen.add(wordId);
    // Only word-group edges to real BASE WORDS are phrase structure. A modifier
    // edge pointing at a clause id (a relative clause qualifying the head, e.g.
    // "the love WHICH YOU HAVE") is left to the clause layer, which already
    // embeds that clause — attaching it here too would duplicate it / dangle.
    const edges = (this.wg.edges.get(wordId) ?? []).filter(
      (e) => e.role === 'relator' || e.role === 'connector' || this.base.has(e.word),
    );
    let rep = nodeId;
    const relator = edges.find((e) => e.role === 'relator' && this.base.has(e.word));
    if (relator) {
      const prep = this.wordNode(relator.word);
      this.rel('prepositionObject', prep, nodeId);
      rep = prep;
    }
    for (const e of edges) {
      if (e.role === 'relator' || e.role === 'connector') continue;
      const childRep = this.buildPhrase(e.word, seen);
      this.rel(this.modRole(e), nodeId, childRep);
    }
    return rep;
  }

  /**
   * Process one clause component (a span of words + embedded clauses) into a
   * single representative node. Multiple top constituents are coordinated when a
   * connector is present, else apposed.
   */
  private processComponent(compEl: Element, seen: Set<string>): string | null {
    const parts: string[] = []; // representative nodes, in order
    const connectorWords: string[] = [];
    const directWords: string[] = [];
    for (const child of kids(compEl)) {
      if (tag(child) === 'w') {
        const w = href(child);
        if (w) directWords.push(w);
      } else if (tag(child) === 'cl.clause') {
        const c = this.buildClause(child, seen);
        if (c) parts.push(c);
      }
    }
    const wordSet = new Set(directWords);
    // Roots: words not modifying another word of THIS component, and not bare
    // connectors (consumed by the coordination) — each heads a top constituent.
    for (const w of directWords) {
      if (this.wg.connectors.has(w)) {
        connectorWords.push(w);
        continue;
      }
      const par = this.wg.parent.get(w);
      if (par && wordSet.has(par)) continue; // a modifier of another root → skip
      parts.push(this.buildPhrase(w, seen));
    }
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0]!;

    // Several constituents: a coordination if a connector joins them, else
    // apposition of the trailing constituents onto the first.
    const head = parts[0]!;
    if (connectorWords.length) {
      for (let i = 1; i < parts.length; i++) this.rel('conjunct', head, parts[i]!);
      for (const c of connectorWords) this.rel('coordinator', head, this.wordNode(c));
    } else {
      for (let i = 1; i < parts.length; i++) this.rel('apposition', head, parts[i]!);
    }
    return head;
  }

  /** Build a clause node (primary or embedded) and return its id. */
  buildClause(clauseEl: Element, seen: Set<string>): string {
    const clauseId = `cl_${clauseEl.getAttribute('xml:id') ?? `g${this.seq++}`}`;
    this.nodes.push({ id: clauseId, kind: 'clause', clauseType: clauseTypeOf(clauseEl), tokenIds: [], provenance: GIVEN });

    const comps = kids(clauseEl).filter((c) => COMPONENT_TAG.has(tag(c)));
    const predEl = comps.find((c) => tag(c) === 'cl.p');

    // Predicate first, so complements/adjuncts can attach to the verb.
    let verbId: string;
    const verbWord = predEl ? firstWord(predEl) : undefined;
    if (predEl) {
      verbId = this.processComponent(predEl, seen) ?? this.implied(clauseId);
    } else {
      verbId = this.implied(clauseId);
    }
    this.rel('predicate', clauseId, verbId);
    const verbLemma = verbWord ? this.base.get(verbWord)?.lemma : undefined;
    const copula = !predEl || (verbLemma ? COPULA_LEMMAS.has(verbLemma) : false);

    for (const comp of comps) {
      if (comp === predEl) continue;
      const t = tag(comp);
      const rep = this.processComponent(comp, seen);
      if (!rep) continue;
      switch (t) {
        case 'cl.s':
          this.rel('subject', clauseId, rep);
          break;
        case 'cl.c':
          this.rel(this.complementRole(rep, copula), verbId, rep);
          break;
        case 'cl.a':
          this.rel('adverbial', verbId, rep);
          break;
        case 'cl.add':
          this.rel('adjunct', clauseId, rep);
          break;
        case 'pl.conj':
          this.rel('conjunction', clauseId, rep);
          break;
        default:
          this.rel('adjunct', clauseId, rep);
      }
    }
    return clauseId;
  }

  /** A complement is a predicate nominal/adjective under a copula, else an object. */
  private complementRole(rep: string, copula: boolean): SyntacticRole {
    if (!copula) return 'directObject';
    const node = this.nodes.find((n) => n.id === rep);
    const tok = node?.tokenIds[0] ? this.tokens.find((t) => t.id === node!.tokenIds[0]) : undefined;
    return tok?.pos === 'adjective' ? 'predicateAdjective' : 'predicateNominative';
  }

  private implied(clauseId: string): string {
    const id = `impl_${clauseId}`;
    this.nodes.push({ id, kind: 'word', tokenIds: [], role: 'predicate', implied: true, label: '(ἐστίν)', provenance: GIVEN });
    return id;
  }

  /** Re-index tokens into reading order (by OpenText word number). */
  orderTokens(): void {
    this.tokens.sort((a, b) => wordNumber(a.id) - wordNumber(b.id));
    this.tokens.forEach((t, i) => (t.index = i));
  }
}

function firstWord(el: Element): string | undefined {
  const w = el.querySelector('w');
  return w ? href(w) ?? undefined : undefined;
}

function clauseTypeOf(el: Element): SyntaxNode['clauseType'] {
  const level = el.getAttribute('level');
  if (level === 'embedded' || level === 'secondary') return 'complement';
  return 'independent';
}

export interface OpenTextDocOptions {
  /** Book display name, e.g. "Philemon". */
  book?: string;
}

/**
 * Convert the three OpenText layers for ONE chapter into one document per
 * PRIMARY clause (embedded clauses nest inside their parent). Each document is
 * titled by the verse(s) its words span.
 */
export function openTextToDocuments(
  baseXml: string,
  wgXml: string,
  clauseXml: string,
  opts: OpenTextDocOptions = {},
): KrDocument[] {
  const base = parseBase(baseXml);
  const wg = parseWordGroups(wgXml);
  const dom = parseXml(clauseXml);
  const book = opts.book ?? dom.querySelector('chapter')?.getAttribute('book') ?? 'GNT';

  // A "primary" clause is a top-level clause — a direct child of <chapter>;
  // everything nested (in a component or another clause) is embedded and handled
  // recursively inside its parent.
  const primaries = Array.from(dom.getElementsByTagName('cl.clause')).filter(
    (c) => c.parentElement != null && tag(c.parentElement) === 'chapter',
  );

  const docs: KrDocument[] = [];
  primaries.forEach((clauseEl, i) => {
    const conv = new OpenTextConverter(base, wg);
    const rootId = conv.buildClause(clauseEl, new Set());
    if (!conv.tokens.length) return;
    conv.orderTokens();
    const ref = verseRange(conv.tokens, base);
    const ts = '2024-01-01T00:00:00.000Z';
    docs.push({
      schemaVersion: SCHEMA_VERSION,
      id: `opentext_${slug(book)}_${i}`,
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

/** "1:4–6" (or "1:4") from the verse refs of the tokens used. */
function verseRange(tokens: Token[], base: Map<string, BaseWord>): string | undefined {
  const verses = tokens
    .map((t) => base.get(t.id.replace(/^t_/, ''))?.ref)
    .map((r) => (r ? r.split('.').slice(-2).join(':') : undefined))
    .filter((v): v is string => Boolean(v));
  if (!verses.length) return undefined;
  const first = verses[0]!;
  const last = verses[verses.length - 1]!;
  if (first === last) return first;
  const endVerse = last.split(':').pop();
  return `${first}–${endVerse}`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
