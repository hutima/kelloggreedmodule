import type { KrDocument, Morphology, PartOfSpeech } from '@/domain/schema';
import { SCHEMA_VERSION } from '@/domain/schema';
import {
  captureSourceConstituency,
  parseXml,
  SentenceConverter,
  type LowfatDialect,
} from './lowfat';

/**
 * Convert a Clear-Bible **macula-hebrew** (WLC) Lowfat syntax tree into our
 * `KrDocument` model — the engine behind the gold-standard Hebrew Bible mode.
 *
 * macula-hebrew uses the SAME head-marked constituency shape as macula-greek
 * (`<wg>` word groups with a `head="true"` child and `role`/`class`/`rule`
 * attributes), so the structural conversion is shared with the Greek path via
 * `SentenceConverter`. Only the leaf encoding differs, which this module's
 * dialect handles:
 *
 *   • ids live on `xml:id` (per morpheme), not `n`/`osisId`;
 *   • Hebrew is segmented into MORPHEMES — the article הַ, the conjunction וְ,
 *     and the inseparable prepositions בְּ/לְ/כְּ are their own `<w>` leaves, which
 *     is exactly what a Kellogg-Reed diagram wants (each on its own line);
 *   • morphology carries Hebrew-specific features — `state` (absolute/construct)
 *     and `stem` (the binyan) and the conjugation `type` — which ride in
 *     `morphology.extra` (no `case`: Hebrew has none);
 *   • files are per-CHAPTER (`<chapter id="GEN 1">`), not per-book.
 *
 * Every node/relation is `source: 'given'` — this is a published gold-standard
 * analysis, not a guess.
 */

/** macula-hebrew `class` → our part of speech. */
const HE_POS: Record<string, PartOfSpeech> = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  cj: 'conjunction',
  art: 'article',
  num: 'numeral',
  prep: 'preposition',
  pron: 'pronoun',
  om: 'particle', // direct-object marker אֵת
  rel: 'particle', // relative אֲשֶׁר
  ij: 'interjection',
  suffix: 'pronoun', // pronominal suffix
};

function hePosOf(w: Element): PartOfSpeech {
  const cls = w.getAttribute('class') ?? '';
  const type = w.getAttribute('type') ?? '';
  // Participle / infinitive are verb forms that diagram distinctly (as in Greek).
  if (cls === 'verb' && /participle/i.test(type)) return 'participle';
  if (cls === 'verb' && /infinitive/i.test(type)) return 'infinitive';
  if (cls === 'noun' && type === 'proper') return 'propernoun';
  return HE_POS[cls] ?? 'unknown';
}

/** Standard features carried in typed fields; Hebrew has no grammatical case. */
const HE_MORPH_KEYS = ['gender', 'number', 'person'] as const;

function heMorphOf(w: Element): Morphology | undefined {
  const m: Morphology = {};
  let any = false;
  for (const k of HE_MORPH_KEYS) {
    const v = w.getAttribute(k);
    if (v) {
      (m as Record<string, string>)[k] = v;
      any = true;
    }
  }
  // Hebrew-specific morphology (not yet first-class schema fields) plus the
  // alignment anchors the parallel-English linker matches on (canonical ref and
  // Strong's number), all carried in the free-form `extra` bag.
  const extra: Record<string, string> = {};
  const carry: ReadonlyArray<readonly [attr: string, key: string]> = [
    ['state', 'state'],
    ['stem', 'stem'],
    ['type', 'type'],
    ['transliteration', 'translit'], // academic romanization for the detail popover
    ['ref', 'ref'],
    ['strongnumberx', 'strong'],
    ['lang', 'lang'], // "H" Hebrew · "A" Aramaic
  ];
  for (const [attr, key] of carry) {
    const v = w.getAttribute(attr);
    if (v) extra[key] = v;
  }
  if (Object.keys(extra).length) {
    m.extra = extra;
    any = true;
  }
  return any ? m : undefined;
}

/** xml:id is the only stable per-morpheme key (a verse's `ref` is shared). */
function heIdOf(el: Element): string | null {
  return (
    el.getAttribute('xml:id') ||
    el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id') ||
    null
  );
}

/**
 * Hebrew function morphemes that never head a leaf word-group: the article, the
 * direct-object marker אֵת, conjunctions, prepositions, particles, and the
 * relative אֲשֶׁר. The head is the content word among the rest.
 */
const HE_FUNCTION_CLASSES = new Set(['art', 'om', 'cj', 'prep', 'ptcl', 'rel']);

/**
 * macula-hebrew marks `head="true"` only on word-GROUPS, never on `<w>` leaves,
 * so a leaf group like a determined noun phrase (article הַ + noun) has no marked
 * head. Choose the first CONTENT word, skipping leading function morphemes, so
 * the noun heads its phrase rather than the article.
 */
function heHeadFallback(kids: Element[]): Element | undefined {
  return kids.find((c) => !HE_FUNCTION_CLASSES.has(c.getAttribute('class') ?? '')) ?? kids[0];
}

/** macula-hebrew (WLC Lowfat): ids on xml:id, surface in text, RTL Hebrew. */
export const hebrewDialect: LowfatDialect = {
  language: 'hbo',
  idOf: heIdOf,
  surfaceOf: (w) => (w.textContent ?? '').trim(),
  posOf: hePosOf,
  lemmaOf: (w) => w.getAttribute('lemma') ?? undefined,
  glossOf: (w) => w.getAttribute('gloss') ?? w.getAttribute('english') ?? undefined,
  morphOf: heMorphOf,
  headFallback: heHeadFallback,
};

export interface MaculaHebrewDocOptions {
  /** Display book name, e.g. "Genesis". Falls back to the chapter id's code. */
  book?: string;
  /** When set, each document also preserves the source `<wg>` hierarchy
   *  verbatim as `sourceConstituency`, attributed to this source id —
   *  macula-hebrew uses the same head-marked Lowfat `<wg>` shape as the
   *  Greek editions, so the shared capture helper applies unchanged. */
  sourceId?: string;
}

/** Convert every `<sentence>` in a macula-hebrew chapter into a document. */
export function maculaHebrewToDocuments(
  xml: string,
  opts: MaculaHebrewDocOptions = {},
): KrDocument[] {
  const dom = parseXml(xml);
  const chapterId = dom.querySelector('chapter')?.getAttribute('id') ?? ''; // "GEN 1"
  const [code = '', chapterNum = ''] = chapterId.split(/\s+/);
  const book = opts.book ?? code ?? 'WLC';
  const sentences = Array.from(dom.querySelectorAll('sentence'));
  const docs: KrDocument[] = [];

  sentences.forEach((sentence, i) => {
    const topWg = sentence.querySelector('wg');
    if (!topWg) return;
    const conv = new SentenceConverter(`h${i}_`, hebrewDialect);
    const rootId = conv.convert(topWg);
    if (!conv.tokens.length) return;
    // Rescue any word left unattached — e.g. a sentence-initial compound
    // subordinator (כִּי אִם) on the OUTERMOST clause, whose stashed connector
    // label has no incoming relation to ride (same rescue as the Greek path).
    conv.rescueOrphans(rootId);
    conv.orderTokensBySurface();

    const ref = hebrewVerseRef(sentence);
    const ts = '2024-01-01T00:00:00.000Z';
    docs.push({
      schemaVersion: SCHEMA_VERSION,
      id: `wlc_${slug(book)}_${chapterNum || i}_${i}`,
      title: ref ? `${book} ${ref}` : `${book} ${chapterNum} (${i + 1})`,
      language: 'hbo',
      // Prefer the source `<p>` text (correct morpheme spacing) over a
      // space-joined token list, which would split prefixes from their hosts.
      text: sentenceText(sentence) || conv.tokens.map((t) => t.surface).join(' '),
      notes: '',
      createdAt: ts,
      updatedAt: ts,
      layoutHints: {},
      tokens: conv.tokens,
      syntax: { rootId, nodes: conv.nodes, relations: conv.relations },
      ...(opts.sourceId
        ? { sourceConstituency: captureSourceConstituency(topWg, hebrewDialect, opts.sourceId) }
        : {}),
    });
  });
  return docs;
}

/** The pointed running text of a sentence's `<p>`, minus the verse milestones. */
function sentenceText(sentence: Element): string {
  const p = sentence.querySelector('p');
  if (!p) return '';
  const text = Array.from(p.childNodes)
    .filter(
      (n) => !(n.nodeType === 1 && (n as Element).tagName.toLowerCase() === 'milestone'),
    )
    .map((n) => n.textContent ?? '')
    .join('');
  return text.replace(/\s+/g, ' ').trim();
}

/** "GEN 1:1" → "1:1"; a multi-verse sentence → "1:1–3". */
function hebrewVerseRef(sentence: Element): string | undefined {
  const ms = sentence.querySelectorAll('milestone[unit="verse"]');
  const verses = Array.from(ms)
    .map((m) => (m.getAttribute('id') || m.textContent || '').replace(/^\S+\s+/, ''))
    .filter(Boolean);
  if (!verses.length) return undefined;
  return verses.length > 1
    ? `${verses[0]}–${verses[verses.length - 1]!.split(':').pop()}`
    : verses[0];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
