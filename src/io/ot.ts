import type { KrDocument } from '@/domain/schema';
import { maculaHebrewToDocuments } from './macula-hebrew';

/**
 * Hebrew Bible (Old Testament) loader for the gold-standard mode. Each CHAPTER
 * is a Westminster Leningrad Codex Lowfat syntax tree (Clear-Bible
 * macula-hebrew, CC BY 4.0). Unlike the GNT (one file per book), macula-hebrew
 * ships one file per chapter, so a passage is picked by book + chapter. Chapters
 * are fetched on demand and cached by the service worker.
 */

export interface OtBook {
  /** Canonical order (1-39). */
  num: number;
  /** Display name. */
  name: string;
  /** Source file code, e.g. "Gen", "1Sa", "HOS" (case matches the filenames). */
  code: string;
  /** Number of chapters. */
  chapters: number;
  /** Short abbreviation for compact UI. */
  abbr: string;
}

// [num, name, code, chapters, abbr] — codes/chapter counts derived from the
// macula-hebrew WLC/lowfat directory (note Hosea's code is upper-case "HOS").
export const OT_BOOKS: OtBook[] = (
  [
    [1, 'Genesis', 'Gen', 50, 'Gen'],
    [2, 'Exodus', 'Exo', 40, 'Exo'],
    [3, 'Leviticus', 'Lev', 27, 'Lev'],
    [4, 'Numbers', 'Num', 36, 'Num'],
    [5, 'Deuteronomy', 'Deu', 34, 'Deu'],
    [6, 'Joshua', 'Jos', 24, 'Jos'],
    [7, 'Judges', 'Jdg', 21, 'Jdg'],
    [8, 'Ruth', 'Rut', 4, 'Rut'],
    [9, '1 Samuel', '1Sa', 31, '1Sa'],
    [10, '2 Samuel', '2Sa', 24, '2Sa'],
    [11, '1 Kings', '1Ki', 22, '1Ki'],
    [12, '2 Kings', '2Ki', 25, '2Ki'],
    [13, '1 Chronicles', '1Ch', 29, '1Ch'],
    [14, '2 Chronicles', '2Ch', 36, '2Ch'],
    [15, 'Ezra', 'Ezr', 10, 'Ezr'],
    [16, 'Nehemiah', 'Neh', 13, 'Neh'],
    [17, 'Esther', 'Est', 10, 'Est'],
    [18, 'Job', 'Job', 42, 'Job'],
    [19, 'Psalms', 'Psa', 150, 'Psa'],
    [20, 'Proverbs', 'Pro', 31, 'Pro'],
    [21, 'Ecclesiastes', 'Ecc', 12, 'Ecc'],
    [22, 'Song of Songs', 'Sng', 8, 'Sng'],
    [23, 'Isaiah', 'Isa', 66, 'Isa'],
    [24, 'Jeremiah', 'Jer', 52, 'Jer'],
    [25, 'Lamentations', 'Lam', 5, 'Lam'],
    [26, 'Ezekiel', 'Ezk', 48, 'Ezk'],
    [27, 'Daniel', 'Dan', 12, 'Dan'],
    [28, 'Hosea', 'HOS', 14, 'Hos'],
    [29, 'Joel', 'Jol', 4, 'Jol'],
    [30, 'Amos', 'Amo', 9, 'Amo'],
    [31, 'Obadiah', 'Oba', 1, 'Oba'],
    [32, 'Jonah', 'Jon', 4, 'Jon'],
    [33, 'Micah', 'Mic', 7, 'Mic'],
    [34, 'Nahum', 'Nam', 3, 'Nam'],
    [35, 'Habakkuk', 'Hab', 3, 'Hab'],
    [36, 'Zephaniah', 'Zep', 3, 'Zep'],
    [37, 'Haggai', 'Hag', 2, 'Hag'],
    [38, 'Zechariah', 'Zec', 14, 'Zec'],
    [39, 'Malachi', 'Mal', 3, 'Mal'],
  ] as const
).map(([num, name, code, chapters, abbr]) => ({ num, name, code, chapters, abbr }));

/** Source of the WLC Lowfat trees (fetched on demand, cached by the SW). */
const SOURCE_BASE =
  'https://raw.githubusercontent.com/Clear-Bible/macula-hebrew/main/WLC/lowfat/';

function localBase(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.replace(/\/$/, '')}/ot/`;
}

/** macula-hebrew chapter filename, e.g. "01-Gen-001-lowfat.xml". */
export function chapterFile(book: OtBook, chapter: number): string {
  const nn = String(book.num).padStart(2, '0');
  const ccc = String(chapter).padStart(3, '0');
  return `${nn}-${book.code}-${ccc}-lowfat.xml`;
}

/** Fetch and convert a chapter into one document per sentence. */
export async function loadOtChapter(book: OtBook, chapter: number): Promise<KrDocument[]> {
  const xml = await fetchChapterXml(book, chapter);
  return maculaHebrewToDocuments(xml, { book: book.name });
}

/**
 * Warm the service-worker cache for a chapter so it is available offline, without
 * opening a passage. Resolves true on success.
 */
export async function cacheOtChapter(book: OtBook, chapter: number): Promise<boolean> {
  try {
    await fetchChapterXml(book, chapter);
    return true;
  } catch {
    return false;
  }
}

async function fetchChapterXml(book: OtBook, chapter: number): Promise<string> {
  const file = chapterFile(book, chapter);
  // Prefer a bundled copy (instant, offline); fall back to the upstream source.
  for (const url of [localBase() + file, SOURCE_BASE + file]) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      /* try the next source */
    }
  }
  throw new Error(
    `Could not load ${book.name} ${chapter}. Check your connection and try again.`,
  );
}
