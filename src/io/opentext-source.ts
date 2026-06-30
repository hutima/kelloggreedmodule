import type { KrDocument } from '@/domain/schema';
import { openTextToDocuments } from './opentext';
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
 * Books are fetched on demand and cached by the service worker; Philemon is
 * bundled for first-run / offline use. (Only single-chapter Philemon is wired so
 * far — multi-chapter books additionally need each chapter's wordgroup/clause
 * file, which this loader is shaped to loop over.)
 */

export interface OpenTextBook {
  /** Canonical NT order (matches the GNT catalogue). */
  num: number;
  name: string;
  abbr: string;
  /** Directory slug under /opentext, e.g. "philemon". */
  slug: string;
  /** OpenText book code used in filenames/ids, e.g. "Phlm". */
  code: string;
  /** Number of chapters (drives how many wordgroup/clause files to fetch). */
  chapters: number;
}

export const OPENTEXT_BOOKS: OpenTextBook[] = [
  { num: 18, name: 'Philemon', abbr: 'Phm', slug: 'philemon', code: 'Phlm', chapters: 1 },
];

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
  const baseXml = await fetchLayer(book, `base/${book.slug}.xml`);

  const docs: KrDocument[] = [];
  for (let ch = 1; ch <= book.chapters; ch++) {
    const wgXml = await fetchLayer(book, `wordgroup/${book.slug}-wg-ch${ch}.xml`);
    const clXml = await fetchLayer(book, `clause/${book.slug}-cl-ch${ch}.xml`);
    docs.push(...openTextToDocuments(baseXml, wgXml, clXml, { book: book.name }));
  }

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
