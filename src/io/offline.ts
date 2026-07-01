import { GNT_BOOKS, cacheGntBook } from './gnt';
import { OT_BOOKS, cacheOtChapter } from './ot';

/**
 * Opt-in OFFLINE download of a whole testament. The corpus is far too large to
 * precache (the GNT alone is ~80 MB — see src/sw.ts), so this instead WARMS the
 * service worker's runtime cache on demand: every book's XML is fetched (fetch
 * only — never parsed, so memory stays flat) so a later search / reading works
 * with no network. This is a CACHE, not a guarantee — the browser may evict it
 * under storage pressure (iOS especially), so every reader still falls back to a
 * network fetch on a miss. `requestPersistentStorage` asks the browser to keep it
 * durable; `storageEstimate` reports how much room is used/left.
 */

/** The runtime cache the service worker stores corpus XML in (see src/sw.ts). */
const CORPUS_CACHE = 'gnt-books-v1';

/** A downloadable testament. */
export type OfflineCorpus = 'nt' | 'ot';

export interface WarmProgress {
  /** Units (books, or OT chapters) fetched so far. */
  done: number;
  /** Total units in the testament. */
  total: number;
  /** The unit currently being fetched ("" when finished). */
  label: string;
}

export interface WarmOptions {
  signal?: AbortSignal;
  onProgress?: (p: WarmProgress) => void;
}

/**
 * Fetch every file of a testament into the runtime cache. The GNT is one file per
 * book; the OT (macula-hebrew) is one file per chapter. Each unit is fetch-only,
 * so peak memory is one file; a unit that fails is skipped (the cache functions
 * swallow errors) so a single 404 doesn't sink the whole download.
 */
export async function downloadCorpus(corpus: OfflineCorpus, opts: WarmOptions = {}): Promise<void> {
  if (corpus === 'nt') {
    const books = GNT_BOOKS;
    for (let i = 0; i < books.length; i++) {
      if (opts.signal?.aborted) return;
      opts.onProgress?.({ done: i, total: books.length, label: books[i]!.name });
      await cacheGntBook(books[i]!);
    }
    opts.onProgress?.({ done: books.length, total: books.length, label: '' });
    return;
  }
  // The OT ships one file per CHAPTER, so warm every chapter of every book.
  const units = OT_BOOKS.flatMap((b) =>
    Array.from({ length: b.chapters }, (_, c) => ({ book: b, ch: c + 1 })),
  );
  for (let i = 0; i < units.length; i++) {
    if (opts.signal?.aborted) return;
    const u = units[i]!;
    opts.onProgress?.({ done: i, total: units.length, label: `${u.book.name} ${u.ch}` });
    await cacheOtChapter(u.book, u.ch);
  }
  opts.onProgress?.({ done: units.length, total: units.length, label: '' });
}

/**
 * Ask the browser to keep this origin's storage DURABLE (exempt from best-effort
 * eviction). Best-effort — most likely granted for an installed PWA, often
 * declined in a plain tab. Returns whether storage is now persisted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* Storage API unavailable (older engine / insecure context) */
  }
  return false;
}

/** Current storage usage + quota in bytes (Cache + IndexedDB…), or null if the
 *  Storage API isn't available — so the UI can show "42 MB of ~1.1 GB". */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    }
  } catch {
    /* not supported */
  }
  return null;
}

/** Delete the downloaded corpus cache, freeing the space it used. Best-effort. */
export async function clearCorpusCache(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') await caches.delete(CORPUS_CACHE);
  } catch {
    /* best-effort */
  }
}
