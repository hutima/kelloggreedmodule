import type { KrDocument } from '@/domain/schema';
import { lowfatToDocuments } from './lowfat';

/**
 * Greek New Testament loader for the gold-standard mode. Each book is a
 * Nestle1904 Lowfat syntax tree (biblicalhumanities / Clear-Bible macula-greek,
 * CC BY-SA 4.0). Books are fetched on demand and cached by the service worker,
 * so the whole GNT is available without committing ~80 MB of XML to the app;
 * a starter book is bundled for first-run / offline use.
 */

export interface GntBook {
  /** Canonical order (1-27). */
  num: number;
  /** Display name. */
  name: string;
  /** Source file name. */
  file: string;
  /** Short 3-letter abbreviation (Php, Rom, 1Co…) for compact UI. */
  abbr: string;
}

export const GNT_BOOKS: GntBook[] = [
  [1, 'Matthew', '01-matthew.xml', 'Mat'],
  [2, 'Mark', '02-mark.xml', 'Mrk'],
  [3, 'Luke', '03-luke.xml', 'Luk'],
  [4, 'John', '04-john.xml', 'Jhn'],
  [5, 'Acts', '05-acts.xml', 'Act'],
  [6, 'Romans', '06-romans.xml', 'Rom'],
  [7, '1 Corinthians', '07-1corinthians.xml', '1Co'],
  [8, '2 Corinthians', '08-2corinthians.xml', '2Co'],
  [9, 'Galatians', '09-galatians.xml', 'Gal'],
  [10, 'Ephesians', '10-ephesians.xml', 'Eph'],
  [11, 'Philippians', '11-philippians.xml', 'Php'],
  [12, 'Colossians', '12-colossians.xml', 'Col'],
  [13, '1 Thessalonians', '13-1thessalonians.xml', '1Th'],
  [14, '2 Thessalonians', '14-2thessalonians.xml', '2Th'],
  [15, '1 Timothy', '15-1timothy.xml', '1Ti'],
  [16, '2 Timothy', '16-2timothy.xml', '2Ti'],
  [17, 'Titus', '17-titus.xml', 'Tit'],
  [18, 'Philemon', '18-philemon.xml', 'Phm'],
  [19, 'Hebrews', '19-hebrews.xml', 'Heb'],
  [20, 'James', '20-james.xml', 'Jas'],
  [21, '1 Peter', '21-1peter.xml', '1Pe'],
  [22, '2 Peter', '22-2peter.xml', '2Pe'],
  [23, '1 John', '23-1john.xml', '1Jn'],
  [24, '2 John', '24-2john.xml', '2Jn'],
  [25, '3 John', '25-3john.xml', '3Jn'],
  [26, 'Jude', '26-jude.xml', 'Jud'],
  [27, 'Revelation', '27-revelation.xml', 'Rev'],
].map(([num, name, file, abbr]) => ({
  num: num as number,
  name: name as string,
  file: file as string,
  abbr: abbr as string,
}));

/** Source of the Lowfat trees, used when a book is not bundled locally. */
const SOURCE_BASE =
  'https://raw.githubusercontent.com/biblicalhumanities/greek-new-testament/master/syntax-trees/nestle1904-lowfat/xml/';

function localBase(): string {
  // Vite's base URL (the app may be served from a subpath, e.g. GitHub Pages).
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.replace(/\/$/, '')}/gnt/`;
}

/** Only Philippians is bundled with the app; the rest fetch on demand. */
export const BUNDLED_BOOKS = new Set([11]);

/** Fetch and convert a book into one document per sentence (cached by the SW). */
export async function loadGntBook(book: GntBook): Promise<KrDocument[]> {
  const xml = await fetchBookXml(book);
  return lowfatToDocuments(xml, { book: book.name });
}

/**
 * Warm the service-worker cache for a book so it is available offline, without
 * loading a passage. Resolves true on success.
 */
export async function cacheGntBook(book: GntBook): Promise<boolean> {
  try {
    await fetchBookXml(book);
    return true;
  } catch {
    return false;
  }
}

/** The runtime cache the service worker keeps GNT XML in (must match src/sw.ts). */
const GNT_CACHE = 'gnt-books-v1';

/** Candidate cache URLs for a book (bundled path + upstream source). */
function bookUrls(book: GntBook): string[] {
  return [localBase() + book.file, SOURCE_BASE + book.file];
}

async function fetchBookXml(book: GntBook): Promise<string> {
  // Prefer a bundled copy (instant, offline); fall back to the upstream source.
  for (const url of bookUrls(book)) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      /* try the next source */
    }
  }
  throw new Error(`Could not load ${book.name}. Check your connection and try again.`);
}

/**
 * Evict a book's XML from the runtime cache. A whole-NT search streams every book
 * through the service worker's cache-first handler; without this, one sweep would
 * leave the entire corpus (~80 MB) sitting in Cache Storage. Best-effort — a no-op
 * where the Cache Storage API is unavailable (older engines, non-secure contexts).
 */
export async function evictGntBook(book: GntBook): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(GNT_CACHE);
    await Promise.all(bookUrls(book).map((u) => cache.delete(u)));
  } catch {
    /* cache eviction is best-effort; a failure never breaks the search */
  }
}
