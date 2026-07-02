import type { DiscourseDocument, DiscourseGranularity, KrDocument } from '@/domain/schema';
import { buildDiscourseDocumentFromRange, rangeOfTitle, rangesOverlap, parseRef } from '@/domain/discourse';
import { GNT_BOOKS, loadGntBook, type GntBook } from './gnt';
import { SBLGNT_BOOKS, loadSblgntBook } from './gnt-sblgnt';
import { OPENTEXT_BOOKS, loadOpenTextBook } from './opentext-source';
import type { SyntaxSourceId } from './sources';

/**
 * DISCOURSE RANGE LOADER — fetches a book through the EXISTING per-source
 * loaders (and their service-worker caches; no new fetching layer, no flags on
 * the syntax loaders) and builds a `DiscourseDocument` for a verse range.
 * Loading a discourse range never touches the syntax selection: the result
 * goes to the discourse store only.
 */

/** The GNT sources a discourse range can load from. */
export const DISCOURSE_SOURCES: { id: SyntaxSourceId; label: string }[] = [
  { id: 'macula-greek-sblgnt-lowfat', label: 'SBLGNT Lowfat' },
  { id: 'macula-greek-nestle1904-lowfat', label: 'Nestle 1904 Lowfat' },
  { id: 'opentext', label: 'OpenText syntax' },
];

/** Books offered for a discourse source. */
export function discourseBooksFor(sourceId: SyntaxSourceId): { num: number; name: string }[] {
  return sourceId === 'opentext'
    ? OPENTEXT_BOOKS.map((b) => ({ num: b.num, name: b.name }))
    : GNT_BOOKS.map((b) => ({ num: b.num, name: b.name }));
}

/** The text edition underlying each loadable source (stamped on documents). */
function editionOf(sourceId: SyntaxSourceId): string {
  return sourceId === 'macula-greek-sblgnt-lowfat' ? 'sblgnt' : 'nestle1904';
}

/** Load a book's sentence documents from the selected source (SW-cached). */
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

/** Chapter/verse shape of a loaded book: max verse per chapter, from titles. */
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

/** How many initial units a range would generate (for the selector estimate). */
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
    // Count verses per chapter conservatively from the title span.
    for (let c = s.chapter; c <= e.chapter; c++) {
      const v0 = c === s.chapter ? s.verse : 1;
      const v1 = c === e.chapter ? e.verse : v0;
      for (let v = v0; v <= v1; v++) verses.add(`${c}:${v}`);
    }
  }
  return verses.size;
}

/**
 * Load a source book and build the discourse BASE document for a verse range.
 * Callers (the discourse store) apply any stored user patch on top.
 */
export async function loadDiscourseRange(opts: {
  sourceId: SyntaxSourceId;
  bookNum: number;
  startRef: string;
  endRef: string;
  granularity?: DiscourseGranularity;
  /** Reuse already-loaded book docs (the selector holds them). */
  bookDocs?: KrDocument[];
}): Promise<DiscourseDocument> {
  const books = discourseBooksFor(opts.sourceId);
  const book = books.find((b) => b.num === opts.bookNum);
  if (!book) throw new Error('Unknown book for this source.');
  const docs = opts.bookDocs ?? (await loadDiscourseBookDocs(opts.sourceId, opts.bookNum));
  const built = buildDiscourseDocumentFromRange(docs, {
    sourceId: opts.sourceId,
    editionId: editionOf(opts.sourceId),
    book: book.name,
    startRef: opts.startRef,
    endRef: opts.endRef,
    granularity: opts.granularity ?? 'sentence',
  });
  if (!built.units.length) {
    throw new Error(`No sentences of ${book.name} overlap ${opts.startRef}–${opts.endRef}.`);
  }
  return built;
}
