import type { EnglishBibleBook, EnglishBibleVerse, EnglishBibleWord } from '@/domain/discourse';

/**
 * REMOTE ENGLISH BIBLE LOADER — KJV and ASV as English-ONLY Discourse sources.
 *
 * Unlike the bundled BSB corpus (`english-bible.ts`), KJV/ASV ship NO Bible text
 * in this repo: only a manifest + URL template + adapter live here, and passage
 * data is fetched on demand from public-domain / permissively-licensed raw
 * GitHub endpoints and cached in memory (same promise-cache style as
 * `parallel.ts` / `gnt.ts`).
 *
 * These are PLAIN ENGLISH texts. No lemma, morphology, Strong's number, Greek/
 * Hebrew alignment, or MACULA discourse-marker hint is produced — every word is
 * honestly `alignmentMethod: 'none'`. Adding any of those would mean fabricating
 * data the sources do not carry, which is explicitly out of scope.
 *
 * Sources (verified upstream; both fetched from raw.githubusercontent.com):
 *   - KJV — aruljohn/Bible-kjv — PER-BOOK JSON, e.g. `John.json`, `1Samuel.json`
 *     `{ book, chapters: [{ chapter, verses: [{ verse, text }] }] }`.
 *     KJV (1611/1769) is public domain (outside the UK).
 *   - ASV — scrollmapper/bible_databases — WHOLE-BIBLE JSON `formats/json/ASV.json`
 *     `{ translation, books: [{ name, chapters: [{ chapter, verses: [{ verse, text }] }] }] }`.
 *     ASV (1901) is public domain; the repo is MIT-licensed. Fetched once,
 *     cached, then sliced per book by canonical index.
 */

export type RemoteEnglishSourceId = 'english-kjv' | 'english-asv';

export interface RemoteEnglishSourceInfo {
  id: RemoteEnglishSourceId;
  label: string;
  version: 'kjv' | 'asv';
  /** How the upstream data is shaped / fetched. */
  strategy: 'per-book' | 'whole-bible';
  /** Upstream repository (provenance). */
  repo: string;
  /** Human-readable licence note (provenance / UI). */
  license: string;
}

export const REMOTE_ENGLISH_SOURCES: RemoteEnglishSourceInfo[] = [
  {
    id: 'english-kjv',
    label: 'KJV (English)',
    version: 'kjv',
    strategy: 'per-book',
    repo: 'https://github.com/aruljohn/Bible-kjv',
    license: 'King James Version (1611/1769) — public domain (outside the UK).',
  },
  {
    id: 'english-asv',
    label: 'ASV (English)',
    version: 'asv',
    strategy: 'whole-bible',
    repo: 'https://github.com/scrollmapper/bible_databases',
    license: 'American Standard Version (1901) — public domain; repo MIT-licensed.',
  },
];

export function isRemoteEnglishSource(id: string): id is RemoteEnglishSourceId {
  return REMOTE_ENGLISH_SOURCES.some((s) => s.id === id);
}

export function remoteEnglishSourceInfo(id: RemoteEnglishSourceId): RemoteEnglishSourceInfo {
  return REMOTE_ENGLISH_SOURCES.find((s) => s.id === id)!;
}

/**
 * Canonical 66-book Protestant order (Genesis = 1 … Revelation = 66). Both
 * upstream sources are in this order, so a book is matched by INDEX — robust to
 * the ASV source's Roman-numeral book spellings ("I Samuel", "Revelation of
 * John"). Display names follow the KJV source's own spelling.
 */
export const REMOTE_ENGLISH_BOOKS: { num: number; name: string }[] = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians',
  '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
].map((name, i) => ({ num: i + 1, name }));

/** Books 1–39 are Old Testament, 40–66 New Testament. */
function corpusOf(bookNum: number): 'ot' | 'nt' {
  return bookNum <= 39 ? 'ot' : 'nt';
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Stable per-word id, matching the bundled loader's scheme. */
function wordId(sourceId: string, book: string, ref: string, index: number): string {
  return `${sourceId}_${slug(book)}_${ref.replace(/:/g, '.')}_${index}`;
}

/**
 * Turn one verse's plain text into English words. Whitespace split keeps
 * punctuation attached to its word (deterministic; the discourse builder detects
 * sentence ends by trailing `.?!`). No tagging is added — plain English only.
 */
function verseToWords(sourceId: string, book: string, ref: string, text: string): EnglishBibleWord[] {
  const surfaces = text.trim().split(/\s+/u).filter(Boolean);
  return surfaces.map((surface, index) => ({
    id: wordId(sourceId, book, ref, index),
    surface,
    ref,
    index,
    alignmentMethod: 'none' as const,
  }));
}

// --- KJV (aruljohn/Bible-kjv) — per-book JSON -----------------------------------

interface KjvBookJson {
  book: string;
  chapters: { chapter: string; verses: { verse: string; text: string }[] }[];
}

/** The raw GitHub URL for a KJV book (spaces stripped: "1 Samuel" → `1Samuel.json`). */
export function kjvBookUrl(bookName: string): string {
  const file = bookName.replace(/\s+/g, '');
  return `https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/${file}.json`;
}

/** Pure conversion of an aruljohn KJV book JSON → normalized English book. */
export function kjvJsonToEnglishBook(
  sourceId: string,
  book: { name: string; num: number },
  json: KjvBookJson,
): EnglishBibleBook {
  const verses: Record<string, EnglishBibleVerse> = {};
  for (const ch of json.chapters ?? []) {
    const c = Number(ch.chapter);
    for (const v of ch.verses ?? []) {
      const ref = `${c}:${Number(v.verse)}`;
      const text = (v.text ?? '').trim();
      verses[ref] = { ref, text, words: verseToWords(sourceId, book.name, ref, text) };
    }
  }
  return { sourceId, version: 'kjv', corpus: corpusOf(book.num), book: book.name, bookNum: book.num, verses };
}

// --- ASV (scrollmapper/bible_databases) — whole-Bible JSON ----------------------

interface ScrollmapperVerse {
  verse: number;
  text: string;
}
interface ScrollmapperBook {
  name: string;
  chapters: { chapter: number; verses: ScrollmapperVerse[] }[];
}
export interface ScrollmapperBible {
  translation: string;
  books: ScrollmapperBook[];
}

export const ASV_URL =
  'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/ASV.json';

/** Pure conversion of one scrollmapper book (already selected) → English book. */
export function scrollmapperBookToEnglishBook(
  sourceId: string,
  version: 'asv',
  book: { name: string; num: number },
  src: ScrollmapperBook,
): EnglishBibleBook {
  const verses: Record<string, EnglishBibleVerse> = {};
  for (const ch of src.chapters ?? []) {
    const c = Number(ch.chapter);
    for (const v of ch.verses ?? []) {
      const ref = `${c}:${Number(v.verse)}`;
      const text = (v.text ?? '').trim();
      verses[ref] = { ref, text, words: verseToWords(sourceId, book.name, ref, text) };
    }
  }
  return { sourceId, version, corpus: corpusOf(book.num), book: book.name, bookNum: book.num, verses };
}

// --- fetch + cache --------------------------------------------------------------

/** In-memory promise caches (per session), mirroring `parallel.ts`. */
const bookCache = new Map<string, Promise<EnglishBibleBook>>();
const wholeBibleCache = new Map<RemoteEnglishSourceId, Promise<ScrollmapperBible>>();

async function fetchJson<T>(url: string, label: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`Couldn’t reach the ${label} text source. Check your connection and try again.`);
  }
  if (!res.ok) {
    throw new Error(`The ${label} text source returned an error (${res.status}). Please try again later.`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`The ${label} text source returned unreadable data.`);
  }
}

/** Fetch + convert a KJV book (per-book endpoint). */
async function loadKjvBook(book: { name: string; num: number }): Promise<EnglishBibleBook> {
  const json = await fetchJson<KjvBookJson>(kjvBookUrl(book.name), 'KJV');
  return kjvJsonToEnglishBook('english-kjv', book, json);
}

/** Fetch (once) the whole ASV bible, then slice out one book by canonical index. */
async function loadAsvBook(book: { name: string; num: number }): Promise<EnglishBibleBook> {
  let biblePromise = wholeBibleCache.get('english-asv');
  if (!biblePromise) {
    biblePromise = fetchJson<ScrollmapperBible>(ASV_URL, 'ASV');
    wholeBibleCache.set('english-asv', biblePromise);
  }
  let bible: ScrollmapperBible;
  try {
    bible = await biblePromise;
  } catch (e) {
    // Don't cache a failed fetch — allow a later retry.
    wholeBibleCache.delete('english-asv');
    throw e;
  }
  const src = bible.books?.[book.num - 1];
  if (!src) throw new Error(`The ASV source has no data for ${book.name}.`);
  return scrollmapperBookToEnglishBook('english-asv', 'asv', book, src);
}

/** Load a normalized English book for a remote (KJV/ASV) source, cached. */
export function loadRemoteEnglishBibleBook(
  sourceId: RemoteEnglishSourceId,
  bookNum: number,
): Promise<EnglishBibleBook> {
  const book = REMOTE_ENGLISH_BOOKS.find((b) => b.num === bookNum);
  if (!book) return Promise.reject(new Error('Unknown book for this source.'));
  const key = `${sourceId}:${bookNum}`;
  let cached = bookCache.get(key);
  if (!cached) {
    cached = (sourceId === 'english-kjv' ? loadKjvBook(book) : loadAsvBook(book)).catch((e) => {
      // Don't cache failures — a later attempt should be able to retry.
      bookCache.delete(key);
      throw e;
    });
    bookCache.set(key, cached);
  }
  return cached;
}

/** Test/backup hook: clear the remote English caches. */
export function clearRemoteEnglishCache(): void {
  bookCache.clear();
  wholeBibleCache.clear();
}
