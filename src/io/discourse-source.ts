import type { DiscourseDocument, DiscourseGranularity, KrDocument } from '@/domain/schema';
import {
  buildDiscourseDocumentFromEnglishBibleRange,
  buildDiscourseDocumentFromRange,
  rangeOfTitle,
  rangesOverlap,
  parseRef,
  refInRange,
  type EnglishBibleBook,
} from '@/domain/discourse';
import { GNT_BOOKS, loadGntBook, type GntBook } from './gnt';
import { SBLGNT_BOOKS, loadSblgntBook } from './gnt-sblgnt';
import { OPENTEXT_BOOKS, loadOpenTextBook } from './opentext-source';
import {
  ENGLISH_BIBLE_SOURCES,
  englishBibleBooksFor,
  isEnglishBibleSource,
  loadEnglishBibleBook,
  type EnglishBibleSourceId,
} from './english-bible';
import type { SyntaxSourceId } from './sources';

/**
 * DISCOURSE RANGE LOADER — fetches a book through the EXISTING per-source
 * loaders (and their service-worker caches; no new fetching layer, no flags on
 * the syntax loaders) and builds a `DiscourseDocument` for a verse range.
 * Loading a discourse range never touches the syntax selection: the result
 * goes to the discourse store only.
 *
 * Discourse mode can read either a SYNTAX source (Greek/Hebrew analysis, shared
 * with the sentence-level modes) or an ENGLISH BIBLE source (built directly from
 * verse text, no syntax parse). English Bible sources are DISCOURSE-ONLY — they
 * never appear in the syntax source selectors (`SyntaxSourceId` is untouched).
 */

/** A Discourse source id — a syntax source OR a Discourse-only English Bible. */
export type DiscourseSourceId = SyntaxSourceId | EnglishBibleSourceId;

/** The sources a discourse range can load from (syntax + English Bibles). */
export const DISCOURSE_SOURCES: { id: DiscourseSourceId; label: string }[] = [
  { id: 'macula-greek-sblgnt-lowfat', label: 'SBLGNT Lowfat' },
  { id: 'macula-greek-nestle1904-lowfat', label: 'Nestle 1904 Lowfat' },
  { id: 'opentext', label: 'OpenText syntax' },
  ...ENGLISH_BIBLE_SOURCES.map((s) => ({ id: s.id, label: s.label })),
];

/** Books offered for a discourse source. */
export function discourseBooksFor(sourceId: DiscourseSourceId): { num: number; name: string }[] {
  if (isEnglishBibleSource(sourceId)) return englishBibleBooksFor(sourceId);
  return sourceId === 'opentext'
    ? OPENTEXT_BOOKS.map((b) => ({ num: b.num, name: b.name }))
    : GNT_BOOKS.map((b) => ({ num: b.num, name: b.name }));
}

/** The text edition underlying each loadable syntax source (stamped on docs). */
function editionOf(sourceId: SyntaxSourceId): string {
  return sourceId === 'macula-greek-sblgnt-lowfat' ? 'sblgnt' : 'nestle1904';
}

/** Load a syntax book's sentence documents from the selected source (SW-cached). */
export async function loadDiscourseBookDocs(
  sourceId: SyntaxSourceId,
  bookNum: number,
): Promise<KrDocument[]> {
  if (sourceId === 'opentext') {
    const b = OPENTEXT_BOOKS.find((x) => x.num === bookNum);
    if (!b) throw new Error('This book has no OpenText analysis.');
    return loadOpenTextBook(b);
  }
  if (sourceId === 'macula-greek-nestle1904-lowfat') {
    return loadGntBook(GNT_BOOKS.find((x) => x.num === bookNum) as GntBook);
  }
  return loadSblgntBook(SBLGNT_BOOKS.find((x) => x.num === bookNum) as GntBook);
}

/**
 * A loaded discourse book, normalized across source families. The range
 * selector holds one of these to compute the chapter/verse shape + unit
 * estimate and to hand straight to `loadDiscourseRange` (avoiding a re-fetch).
 */
export type LoadedDiscourseBook =
  | { kind: 'syntax'; docs: KrDocument[] }
  | { kind: 'english'; book: EnglishBibleBook };

/** Load the selected book's data (syntax sentence docs OR an English book). */
export async function loadDiscourseBook(
  sourceId: DiscourseSourceId,
  bookNum: number,
): Promise<LoadedDiscourseBook> {
  if (isEnglishBibleSource(sourceId)) {
    return { kind: 'english', book: await loadEnglishBibleBook(sourceId, bookNum) };
  }
  return { kind: 'syntax', docs: await loadDiscourseBookDocs(sourceId, bookNum) };
}

/** Chapter/verse shape (max verse per chapter) of a syntax book, from titles. */
export function bookRefShape(docs: KrDocument[]): Map<number, number> {
  const maxVerse = new Map<number, number>();
  for (const d of docs) {
    const r = rangeOfTitle(d.title);
    if (!r) continue;
    for (const ref of [r.start, r.end]) {
      const p = parseRef(ref);
      if (!p) continue;
      if ((maxVerse.get(p.chapter) ?? 0) < p.verse) maxVerse.set(p.chapter, p.verse);
    }
  }
  return maxVerse;
}

/** Chapter/verse shape of an English book, from its verse refs. */
export function englishBookRefShape(book: EnglishBibleBook): Map<number, number> {
  const maxVerse = new Map<number, number>();
  for (const ref of Object.keys(book.verses)) {
    const p = parseRef(ref);
    if (!p) continue;
    if ((maxVerse.get(p.chapter) ?? 0) < p.verse) maxVerse.set(p.chapter, p.verse);
  }
  return maxVerse;
}

/** Chapter/verse shape of any loaded discourse book. */
export function bookRefShapeOf(loaded: LoadedDiscourseBook): Map<number, number> {
  return loaded.kind === 'english' ? englishBookRefShape(loaded.book) : bookRefShape(loaded.docs);
}

/** How many initial units a syntax range would generate (selector estimate). */
export function estimateUnitCount(
  docs: KrDocument[],
  startRef: string,
  endRef: string,
  granularity: DiscourseGranularity,
): number {
  const selected = docs.filter((d) => {
    const r = rangeOfTitle(d.title);
    return r && rangesOverlap(r.start, r.end, startRef, endRef);
  });
  if (granularity !== 'verse') return selected.length;
  const verses = new Set<string>();
  for (const d of selected) {
    const r = rangeOfTitle(d.title);
    if (!r) continue;
    const s = parseRef(r.start)!;
    const e = parseRef(r.end)!;
    // Count verses per chapter from the title span, clamped to the requested
    // range so an overlapping sentence's out-of-range verses are not counted.
    for (let c = s.chapter; c <= e.chapter; c++) {
      const v0 = c === s.chapter ? s.verse : 1;
      const v1 = c === e.chapter ? e.verse : v0;
      for (let v = v0; v <= v1; v++) {
        const ref = `${c}:${v}`;
        if (refInRange(ref, startRef, endRef)) verses.add(ref);
      }
    }
  }
  return verses.size;
}

/** How many initial units an English range would generate (selector estimate). */
export function estimateEnglishUnitCount(
  book: EnglishBibleBook,
  startRef: string,
  endRef: string,
  granularity: DiscourseGranularity,
): number {
  const inRange = Object.values(book.verses).filter((v) => refInRange(v.ref, startRef, endRef));
  if (granularity === 'verse') return inRange.length;
  // Sentence granularity: count sentence-final punctuation across the range.
  let sentences = 0;
  for (const v of inRange) {
    for (const w of v.words) if (/[.!?]$/.test(w.surface.trim())) sentences++;
  }
  return sentences || inRange.length;
}

/** Unit-count estimate for any loaded discourse book. */
export function estimateUnitCountOf(
  loaded: LoadedDiscourseBook,
  startRef: string,
  endRef: string,
  granularity: DiscourseGranularity,
): number {
  return loaded.kind === 'english'
    ? estimateEnglishUnitCount(loaded.book, startRef, endRef, granularity)
    : estimateUnitCount(loaded.docs, startRef, endRef, granularity);
}

/**
 * Load a source book and build the discourse BASE document for a verse range.
 * Callers (the discourse store) apply any stored user patch on top. A syntax
 * source builds from sentence `KrDocument`s; an English Bible source builds
 * directly from verse text (no syntax parse).
 */
export async function loadDiscourseRange(opts: {
  sourceId: DiscourseSourceId;
  bookNum: number;
  startRef: string;
  endRef: string;
  granularity?: DiscourseGranularity;
  /** Reuse already-loaded book data (the selector holds it). */
  loaded?: LoadedDiscourseBook;
  /** Back-compat: syntax sentence docs (equivalent to `loaded.docs`). */
  bookDocs?: KrDocument[];
}): Promise<DiscourseDocument> {
  const books = discourseBooksFor(opts.sourceId);
  const book = books.find((b) => b.num === opts.bookNum);
  if (!book) throw new Error('Unknown book for this source.');
  const granularity = opts.granularity ?? 'sentence';

  if (isEnglishBibleSource(opts.sourceId)) {
    const eng =
      opts.loaded?.kind === 'english'
        ? opts.loaded.book
        : await loadEnglishBibleBook(opts.sourceId, opts.bookNum);
    const built = buildDiscourseDocumentFromEnglishBibleRange(eng, {
      startRef: opts.startRef,
      endRef: opts.endRef,
      granularity,
    });
    if (!built.units.length) {
      throw new Error(`No verses of ${book.name} fall in ${opts.startRef}–${opts.endRef}.`);
    }
    return built;
  }

  const docs =
    opts.bookDocs ??
    (opts.loaded?.kind === 'syntax' ? opts.loaded.docs : undefined) ??
    (await loadDiscourseBookDocs(opts.sourceId, opts.bookNum));
  const built = buildDiscourseDocumentFromRange(docs, {
    sourceId: opts.sourceId,
    editionId: editionOf(opts.sourceId),
    book: book.name,
    startRef: opts.startRef,
    endRef: opts.endRef,
    granularity,
  });
  if (!built.units.length) {
    throw new Error(`No sentences of ${book.name} overlap ${opts.startRef}–${opts.endRef}.`);
  }
  return built;
}
