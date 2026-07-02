import type { KrDocument } from '@/domain/schema';
import { GNT_BOOKS, type GntBook } from './gnt';
import { lowfatToDocuments, sblgntDialect } from './lowfat';

/**
 * Greek New Testament loader for the **SBLGNT Lowfat** edition — MACULA Greek
 * (Clear-Bible/macula-greek, `SBLGNT/lowfat`, CC BY 4.0; SBLGNT text © SBL,
 * CC BY 4.0). This is the incoming PRIMARY Greek edition; the Nestle1904
 * loader (`gnt.ts`) stays untouched as the legacy/alternate edition (see
 * docs/sblgnt-kellogg-reed-plan.md).
 *
 * Same canon and file naming as the Nestle1904 tree set, so the book list is
 * shared. Documents get the `sblgnt_` id prefix — that prefix is how
 * `sourceOfDoc` tells editions apart, which in turn keeps user patches from
 * silently crossing editions.
 */

/** Same 27 books, same `NN-name.xml` file names as the Nestle1904 set. */
export const SBLGNT_BOOKS: GntBook[] = GNT_BOOKS;

/** Upstream source of the SBLGNT Lowfat trees. */
const SOURCE_BASE = 'https://raw.githubusercontent.com/Clear-Bible/macula-greek/main/SBLGNT/lowfat/';

function localBase(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.replace(/\/$/, '')}/sblgnt/`;
}

/** Philippians is bundled (matching the Nestle1904 starter book) so the
 *  DEFAULT edition works offline on first run; the rest fetch on demand. */
export const SBLGNT_BUNDLED_BOOKS = new Set<number>([11]);

/** The runtime cache the service worker keeps corpus XML in (see src/sw.ts). */
const CORPUS_CACHE = 'gnt-books-v1';

/** Candidate cache URLs for a book (bundled path + upstream source). */
function bookUrls(book: GntBook): string[] {
  return [localBase() + book.file, SOURCE_BASE + book.file];
}

async function fetchBookXml(book: GntBook): Promise<string> {
  for (const url of bookUrls(book)) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      /* try the next source */
    }
  }
  throw new Error(`Could not load ${book.name} (SBLGNT). Check your connection and try again.`);
}

/** Fetch and convert a book into one document per sentence (cached by the SW). */
export async function loadSblgntBook(book: GntBook): Promise<KrDocument[]> {
  const xml = await fetchBookXml(book);
  return lowfatToDocuments(xml, { book: book.name, dialect: sblgntDialect, docIdPrefix: 'sblgnt' });
}

/** Warm the service-worker cache for offline use. Resolves true on success. */
export async function cacheSblgntBook(book: GntBook): Promise<boolean> {
  try {
    await fetchBookXml(book);
    return true;
  } catch {
    return false;
  }
}

/** Evict a book's XML from the runtime cache (best-effort; see gnt.ts). */
export async function evictSblgntBook(book: GntBook): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CORPUS_CACHE);
    await Promise.all(bookUrls(book).map((u) => cache.delete(u)));
  } catch {
    /* cache eviction is best-effort */
  }
}
