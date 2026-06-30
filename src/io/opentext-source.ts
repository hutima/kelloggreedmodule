import type { KrDocument } from '@/domain/schema';
import { parseBase, buildOpenTextDocuments } from './opentext';
import { buildSurfaceIndex, alignOpenTextSurface } from './opentext-align';
import { GNT_BOOKS, loadGntBook } from './gnt';

/**
 * Loader for the OpenText.org analysis (OpenText-org/original_annotation,
 * CC BY-SA 4.0) as an ALTERNATIVE syntax source to the default Nestle1904
 * Lowfat parse. Each book's three standoff layers are fetched, converted
 * (`openTextToDocuments`), and aligned to the Nestle1904 surface text
 * (`alignOpenTextSurface`) so the diagram reads in the inflected forms OpenText
 * itself omits. Because every visualization is a lens over the one syntax graph,
 * the returned documents drive all four modes with no extra work.
 *
 * The full GNT (all 27 books) is selectable. Books are fetched on demand from
 * the upstream OpenText repo and cached by the service worker; Philemon is also
 * bundled for first-run / offline use. A book parses its word layer ONCE and
 * loops its chapters, fetching each chapter's wordgroup + clause file.
 */

export interface OpenTextBook {
  /** Canonical NT order (matches the GNT catalogue). */
  num: number;
  name: string;
  abbr: string;
  /** Directory slug under /opentext (the OpenText NT folder name), e.g. "philemon". */
  slug: string;
  /** Number of chapters (drives how many wordgroup/clause files to fetch). */
  chapters: number;
}

// The full GNT. `num` matches GNT_BOOKS (for Nestle1904 surface alignment); the
// slug is the OpenText NT directory; `chapters` drives the per-chapter fetch.
export const OPENTEXT_BOOKS: OpenTextBook[] = (
  [
    [1, 'Matthew', 'Mat', 'matthew', 28],
    [2, 'Mark', 'Mrk', 'mark', 16],
    [3, 'Luke', 'Luk', 'luke', 24],
    [4, 'John', 'Jhn', 'john', 21],
    [5, 'Acts', 'Act', 'acts', 28],
    [6, 'Romans', 'Rom', 'romans', 16],
    [7, '1 Corinthians', '1Co', '1corinthians', 16],
    [8, '2 Corinthians', '2Co', '2corinthians', 13],
    [9, 'Galatians', 'Gal', 'galatians', 6],
    [10, 'Ephesians', 'Eph', 'ephesians', 6],
    [11, 'Philippians', 'Php', 'philippians', 4],
    [12, 'Colossians', 'Col', 'colossians', 4],
    [13, '1 Thessalonians', '1Th', '1thessalonians', 5],
    [14, '2 Thessalonians', '2Th', '2thessalonians', 3],
    [15, '1 Timothy', '1Ti', '1timothy', 6],
    [16, '2 Timothy', '2Ti', '2timothy', 4],
    [17, 'Titus', 'Tit', 'titus', 3],
    [18, 'Philemon', 'Phm', 'philemon', 1],
    [19, 'Hebrews', 'Heb', 'hebrews', 13],
    [20, 'James', 'Jas', 'james', 5],
    [21, '1 Peter', '1Pe', '1peter', 5],
    [22, '2 Peter', '2Pe', '2peter', 3],
    [23, '1 John', '1Jn', '1john', 5],
    [24, '2 John', '2Jn', '2john', 1],
    [25, '3 John', '3Jn', '3john', 1],
    [26, 'Jude', 'Jud', 'jude', 1],
    [27, 'Revelation', 'Rev', 'revelation', 22],
  ] as const
).map(([num, name, abbr, slug, chapters]) => ({ num, name, abbr, slug, chapters }));

const SOURCE_BASE =
  'https://raw.githubusercontent.com/OpenText-org/original_annotation/master/NT/';

function localBase(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.replace(/\/$/, '')}/opentext/`;
}

async function fetchText(paths: string[]): Promise<string> {
  for (const url of paths) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      /* try the next source */
    }
  }
  throw new Error(`Could not load ${paths[0]}. Check your connection and try again.`);
}

/** Fetch one of a book's standoff files, preferring the bundled copy. */
function fetchLayer(book: OpenTextBook, rel: string): Promise<string> {
  return fetchText([`${localBase()}${book.slug}/${rel}`, `${SOURCE_BASE}${book.slug}/${rel}`]);
}

/**
 * Load an OpenText book as aligned documents (one per primary clause). Surface
 * forms are filled from the parallel Nestle1904 book; if that book can't be
 * fetched the diagram still loads in lemma forms.
 */
export async function loadOpenTextBook(book: OpenTextBook): Promise<KrDocument[]> {
  // Parse the word layer ONCE for the whole book, then reuse it for each chapter.
  const base = parseBase(await fetchLayer(book, `base/${book.slug}.xml`));

  const docs: KrDocument[] = [];
  for (let ch = 1; ch <= book.chapters; ch++) {
    let wgXml: string;
    let clXml: string;
    try {
      wgXml = await fetchLayer(book, `wordgroup/${book.slug}-wg-ch${ch}.xml`);
      clXml = await fetchLayer(book, `clause/${book.slug}-cl-ch${ch}.xml`);
    } catch {
      continue; // a chapter missing upstream shouldn't sink the whole book
    }
    docs.push(...buildOpenTextDocuments(base, wgXml, clXml, { book: book.name, chapter: ch }));
  }
  if (!docs.length) throw new Error(`Could not load ${book.name} from OpenText.`);

  // Align to the Nestle1904 surface text (best-effort).
  try {
    const gnt = GNT_BOOKS.find((b) => b.num === book.num);
    if (gnt) {
      const nestle = await loadGntBook(gnt);
      const index = buildSurfaceIndex(nestle.flatMap((d) => d.tokens));
      return docs.map((d) => alignOpenTextSurface(d, index).doc);
    }
  } catch {
    /* fall through to lemma-form documents */
  }
  return docs;
}
