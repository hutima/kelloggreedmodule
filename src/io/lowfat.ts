import type {
  KrDocument,
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

function parseXml(xml: string): Document {
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
  return any ? m : undefined;
}

/** One conversion pass over a single `<sentence>`. */
class SentenceConverter {
  readonly tokens: Token[] = [];
  readonly nodes: SyntaxNode[] = [];
  readonly relations: Relation[] = [];
  private wordNodeId = new Map<Element, string>();
  private seq = 0;

  constructor(private readonly idPrefix: string) {}

  private key(el: Element): string {
    return el.getAttribute('n') || el.getAttribute('osisId') || `${this.idPrefix}${this.seq++}`;
  }

  private rel(type: SyntacticRole, headId: string, dependentId: string): void {
    if (headId === dependentId) return;
    this.relations.push({
      id: `r_${this.idPrefix}${this.seq++}`,
      type,
      headId,
      dependentId,
      provenance: { source: 'given', confidence: 'high' },
    });
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
      surface: (w.textContent ?? '').trim(),
      language: 'grc',
      pos: posOf(w),
      lemma: w.getAttribute('lemma') ?? w.getAttribute('normalized') ?? undefined,
      gloss: w.getAttribute('gloss') ?? undefined,
      morphology: morphOf(w),
      provenance: { source: 'given', confidence: 'high' },
    });
    const nodeId = `w_${k}`;
    this.nodes.push({ id: nodeId, kind: 'word', tokenIds: [tokenId], provenance: { source: 'given', confidence: 'high' } });
    this.wordNodeId.set(w, nodeId);
    return nodeId;
  }

  private headChild(el: Element): Element | undefined {
    const kids = constituents(el);
    return kids.find((c) => c.getAttribute('head') === 'true') ?? kids[0];
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
    // floating predicate. Collapse it into its content instead: pass a lone child
    // straight through (its real clause becomes the representative), and for a
    // multi-child wrapper keep a bare container that simply hosts the children.
    if (!verbEl && !hasPredArg) {
      if (kids.length === 1) return this.convert(kids[0]!);
      const k = this.key(el);
      const clauseId = `cl_${k}`;
      this.nodes.push({
        id: clauseId,
        kind: 'clause',
        tokenIds: [],
        clauseType: 'unknown',
        provenance: { source: 'given', confidence: 'high' },
      });
      for (const child of kids) this.rel('adjunct', clauseId, this.convert(child));
      return clauseId;
    }

    const k = this.key(el);
    const clauseId = `cl_${k}`;
    this.nodes.push({
      id: clauseId,
      kind: 'clause',
      tokenIds: [],
      clauseType: 'unknown',
      provenance: { source: 'given', confidence: 'high' },
    });

    let verbId: string;
    if (verbEl) {
      verbId = this.convert(verbEl);
    } else {
      // Verbless predication (a greeting: nominative + dative, no verb): supply
      // an implied copula to anchor the subject and complement.
      verbId = `impl_${k}`;
      this.nodes.push({
        id: verbId,
        kind: 'word',
        tokenIds: [],
        role: 'predicate',
        implied: true,
        label: '(is)',
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
          this.rel(this.isAdjective(child) ? 'predicateAdjective' : 'predicateNominative', verbId, rep);
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
    for (const child of constituents(el)) {
      if (child === head) continue;
      const rep = this.convert(child);
      this.rel(this.phraseChildRole(child, rule), repId, rep);
    }
    return repId;
  }

  /** Map a non-head phrase child to a Kellogg-Reed relation. */
  private phraseChildRole(child: Element, rule: string): SyntacticRole {
    const role = child.getAttribute('role');
    if (role === 'adv') return 'adverbial';
    const cls = child.getAttribute('class');
    if (cls === 'det') return 'determiner';
    if (cls === 'conj' || cls === 'ptcl') return 'coordinator';
    if (cls === 'pp') return 'prepositionalPhrase';
    if (cls === 'adj' || cls === 'adjp') return 'adjectival';
    if (cls === 'cl') return 'adjectival'; // relative/attributive clause
    // Noun-level: genitive vs apposition vs coordinate, from the parent rule.
    if (/appos/i.test(rule)) return 'apposition';
    if (/ofnp|ofgen|gen/i.test(rule)) return 'genitive';
    if (/npanp|aNp|conj/i.test(rule)) return 'conjunct';
    if (this.isAdjective(child)) return 'adjectival';
    return child.getAttribute('case') === 'genitive' ? 'genitive' : 'apposition';
  }
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
    const conv = new SentenceConverter(`s${i}_`);
    const rootId = conv.convert(topWg);
    if (!conv.tokens.length) return;

    const ref = verseRef(sentence);
    const ts = '2024-01-01T00:00:00.000Z';
    docs.push({
      schemaVersion: SCHEMA_VERSION,
      id: `gnt_${slug(book)}_${i}`,
      title: ref ? `${book} ${ref}` : `${book} (${i + 1})`,
      language: 'grc',
      text: conv.tokens.map((t) => t.surface).join(' '),
      notes: 'Nestle1904 Lowfat syntax tree (biblicalhumanities). Gold-standard parse.',
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
