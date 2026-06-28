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
}

export const GNT_BOOKS: GntBook[] = [
  [1, 'Matthew', '01-matthew.xml'],
  [2, 'Mark', '02-mark.xml'],
  [3, 'Luke', '03-luke.xml'],
  [4, 'John', '04-john.xml'],
  [5, 'Acts', '05-acts.xml'],
  [6, 'Romans', '06-romans.xml'],
  [7, '1 Corinthians', '07-1corinthians.xml'],
  [8, '2 Corinthians', '08-2corinthians.xml'],
  [9, 'Galatians', '09-galatians.xml'],
  [10, 'Ephesians', '10-ephesians.xml'],
  [11, 'Philippians', '11-philippians.xml'],
  [12, 'Colossians', '12-colossians.xml'],
  [13, '1 Thessalonians', '13-1thessalonians.xml'],
  [14, '2 Thessalonians', '14-2thessalonians.xml'],
  [15, '1 Timothy', '15-1timothy.xml'],
  [16, '2 Timothy', '16-2timothy.xml'],
  [17, 'Titus', '17-titus.xml'],
  [18, 'Philemon', '18-philemon.xml'],
  [19, 'Hebrews', '19-hebrews.xml'],
  [20, 'James', '20-james.xml'],
  [21, '1 Peter', '21-1peter.xml'],
  [22, '2 Peter', '22-2peter.xml'],
  [23, '1 John', '23-1john.xml'],
  [24, '2 John', '24-2john.xml'],
  [25, '3 John', '25-3john.xml'],
  [26, 'Jude', '26-jude.xml'],
  [27, 'Revelation', '27-revelation.xml'],
].map(([num, name, file]) => ({ num: num as number, name: name as string, file: file as string }));

/** Source of the Lowfat trees, used when a book is not bundled locally. */
const SOURCE_BASE =
  'https://raw.githubusercontent.com/biblicalhumanities/greek-new-testament/master/syntax-trees/nestle1904-lowfat/xml/';

function localBase(): string {
  // Vite's base URL (the app may be served from a subpath, e.g. GitHub Pages).
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.replace(/\/$/, '')}/gnt/`;
}

/** Fetch and convert a book into one document per sentence (cached by the SW). */
export async function loadGntBook(book: GntBook): Promise<KrDocument[]> {
  const xml = await fetchBookXml(book);
  return lowfatToDocuments(xml, { book: book.name });
}

async function fetchBookXml(book: GntBook): Promise<string> {
  // Prefer a bundled copy (instant, offline); fall back to the upstream source.
  for (const url of [localBase() + book.file, SOURCE_BASE + book.file]) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      /* try the next source */
    }
  }
  throw new Error(`Could not load ${book.name}. Check your connection and try again.`);
}
