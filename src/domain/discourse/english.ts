import type {
  DiscourseDocument,
  DiscourseGranularity,
  DiscourseToken,
  DiscourseUnit,
  Provenance,
} from '@/domain/schema';
import { detectEnglishDiscourseMarkers } from './markers';
import { buildInitialSuggestions } from './suggest';
import { compareRefs, formatRange, refInRange, refSlug } from './refs';
import { filterDiscourseTokensToRange, groupUnderChapters } from './build';

/**
 * ENGLISH BIBLE → DISCOURSE builder. Discourse mode can analyse an English
 * Bible directly, WITHOUT a Greek/Hebrew syntax parse: a normalized
 * `EnglishBibleBook` (produced by the io loader) is cut into discourse units
 * exactly like a Greek range, so every discourse operation — split, relate,
 * label, indent, delete, export, persist — works unchanged.
 *
 * Nothing here fetches or parses; it is pure and deterministic (ids derive from
 * source/version/book/ref/word index, so user patches survive reloads). No
 * Strong's/alignment data is invented — tags are copied only when the loader
 * supplies them.
 */

/** One English word, with any tagging the source actually carries. */
export interface EnglishBibleWord {
  id: string;
  surface: string;
  /** Canonical `"chapter:verse"`. */
  ref: string;
  /** 0-based position within its verse. */
  index: number;
  /** Strong's number, only when the source provides it (never fabricated). */
  strong?: string | number;
  lemma?: string;
  gloss?: string;
  /** Ids of the original-language tokens this word aligns to, when known. */
  sourceTokenIds?: string[];
  /** How the word was aligned to its original-language word, when known. */
  alignmentMethod?: 'greek' | 'hebrew' | 'strongs' | 'position' | 'none';
}

export interface EnglishBibleVerse {
  /** `"chapter:verse"`. */
  ref: string;
  /** Readable verse text (spacing/punctuation applied). */
  text: string;
  words: EnglishBibleWord[];
}

export interface EnglishBibleBook {
  sourceId: string;
  version: 'bsb' | 'kjv' | 'asv';
  corpus: 'nt' | 'ot';
  book: string;
  bookNum: number;
  /** `"chapter:verse"` → verse. */
  verses: Record<string, EnglishBibleVerse>;
}

export interface BuildEnglishDiscourseOptions {
  startRef: string;
  endRef: string;
  granularity?: DiscourseGranularity;
  now?: string;
}

const GIVEN: Provenance = {
  source: 'given',
  confidence: 'high',
  reason: 'Generated from English Bible verse boundaries.',
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** First/last refs among a token list (reading order). */
function refSpan(tokens: DiscourseToken[]): { start: string; end: string } {
  const refs = tokens.map((t) => t.ref).filter(Boolean);
  if (!refs.length) return { start: '', end: '' };
  let start = refs[0]!;
  let end = refs[0]!;
  for (const r of refs) {
    if (compareRefs(r, start) < 0) start = r;
    if (compareRefs(r, end) > 0) end = r;
  }
  return { start, end };
}

/** Distinct source doc ids in first-seen order. */
function sourceDocsOf(tokens: DiscourseToken[]): string[] {
  const out: string[] = [];
  for (const t of tokens) if (!out.includes(t.sourceDocId)) out.push(t.sourceDocId);
  return out;
}

/** Verses of the book, in canonical order. */
function orderedVerses(book: EnglishBibleBook): EnglishBibleVerse[] {
  return Object.values(book.verses).sort((a, b) => compareRefs(a.ref, b.ref));
}

/** A synthetic per-verse "source document" id, stable per source/version/book. */
function verseDocId(book: EnglishBibleBook, ref: string): string {
  return `en_${slug(book.version)}_${slug(book.book)}_${refSlug(ref)}`;
}

/** Flatten in-range English words into compact discourse tokens. */
function englishTokens(book: EnglishBibleBook, startRef: string, endRef: string): DiscourseToken[] {
  const out: DiscourseToken[] = [];
  for (const verse of orderedVerses(book)) {
    if (!refInRange(verse.ref, startRef, endRef)) continue;
    const docId = verseDocId(book, verse.ref);
    for (const w of verse.words) {
      out.push({
        id: w.id,
        surface: w.surface,
        lemma: w.lemma,
        gloss: w.gloss,
        strong: w.strong != null ? String(w.strong) : undefined,
        alignmentMethod: w.alignmentMethod,
        ref: w.ref,
        sourceDocId: docId,
      });
    }
  }
  // Belt-and-braces trim (English data is per-verse, so this rarely drops).
  return filterDiscourseTokensToRange(out, startRef, endRef);
}

/** Sentence-final punctuation token (closes a sentence after being included). */
function isSentenceEnd(surface: string): boolean {
  return /[.!?]$/.test(surface.trim());
}

/** Cut tokens into leaf units by the chosen granularity. */
function cutUnits(tokens: DiscourseToken[], granularity: DiscourseGranularity): DiscourseUnit[] {
  const leaf = (tokens: DiscourseToken[], id: string, order: number): DiscourseUnit => {
    const span = refSpan(tokens);
    return {
      id,
      kind: 'sentence',
      refStart: span.start,
      refEnd: span.end,
      tokenIds: tokens.map((t) => t.id),
      sourceDocIds: sourceDocsOf(tokens),
      order,
      depth: 0,
      provenance: GIVEN,
    };
  };

  if (granularity === 'verse') {
    // One unit per distinct verse ref, in order.
    const byRef = new Map<string, DiscourseToken[]>();
    const order: string[] = [];
    for (const t of tokens) {
      const key = t.ref || '?';
      if (!byRef.has(key)) {
        byRef.set(key, []);
        order.push(key);
      }
      byRef.get(key)!.push(t);
    }
    return order.map((ref, i) => leaf(byRef.get(ref)!, `du_v${refSlug(ref)}`, i));
  }

  // sentence (default) and fallbacks: segment on sentence-final punctuation.
  const units: DiscourseUnit[] = [];
  let current: DiscourseToken[] = [];
  const flush = () => {
    if (!current.length) return;
    units.push(leaf(current, `du_${current[0]!.id}`, units.length));
    current = [];
  };
  for (const t of tokens) {
    current.push(t);
    if (isSentenceEnd(t.surface)) flush();
  }
  flush();
  return units;
}

/**
 * Build a `DiscourseDocument` directly from an English Bible range. Language is
 * `en`; no syntax parse is required or produced. Trimming to the range is exact
 * (English data is per-verse); markers are conservative English hints.
 */
export function buildDiscourseDocumentFromEnglishBibleRange(
  book: EnglishBibleBook,
  opts: BuildEnglishDiscourseOptions,
): DiscourseDocument {
  const granularity = opts.granularity ?? 'sentence';
  const now = opts.now ?? new Date().toISOString();
  const tokens = englishTokens(book, opts.startRef, opts.endRef);

  const leaves = cutUnits(tokens, granularity);
  const units = groupUnderChapters(leaves);

  const span = refSpan(tokens);
  const startRef = span.start || opts.startRef;
  const endRef = span.end || opts.endRef;

  const scopeByToken = new Map<string, string>();
  for (const u of units) for (const tid of u.tokenIds) scopeByToken.set(tid, u.id);
  const markers = detectEnglishDiscourseMarkers(tokens, (tid) => scopeByToken.get(tid));

  // Readable running text from the retained verses.
  const text = orderedVerses(book)
    .filter((v) => refInRange(v.ref, opts.startRef, opts.endRef))
    .map((v) => v.text)
    .join(' ')
    .trim();

  const id = `disc_${slug(book.sourceId)}_${slug(book.book)}_${refSlug(startRef)}-${refSlug(endRef)}_${granularity}`;

  const doc: DiscourseDocument = {
    schemaVersion: 1,
    id,
    sourceDocIds: sourceDocsOf(tokens),
    sourceId: book.sourceId,
    editionId: book.version,
    language: 'en',
    title: `${book.book} ${formatRange(startRef, endRef)}`.trim(),
    range: { book: book.book, startRef, endRef },
    granularity,
    text,
    tokens,
    units,
    relations: [],
    markers,
    suggestions: [],
    layoutHints: {},
    provenance: {
      source: 'given',
      confidence: 'high',
      reason: `Generated from ${book.version.toUpperCase()} English verses; discourse structure is user-authored.`,
    },
    createdAt: now,
    updatedAt: now,
  };
  return { ...doc, suggestions: buildInitialSuggestions(doc) };
}
