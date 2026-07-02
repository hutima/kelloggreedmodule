import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ASV_URL,
  REMOTE_ENGLISH_SOURCES,
  REMOTE_ENGLISH_BOOKS,
  clearRemoteEnglishCache,
  isRemoteEnglishSource,
  kjvBookUrl,
  kjvJsonToEnglishBook,
  loadRemoteEnglishBibleBook,
  remoteEnglishSourceInfo,
  scrollmapperBookToEnglishBook,
  loadEnglishBibleBook,
} from '@/io';
import { buildDiscourseDocumentFromEnglishBibleRange, refInRange } from '@/domain/discourse';

/**
 * Phase 1/5 — remote English Bible source IO (KJV, ASV). Every fetch is mocked;
 * NO live network. Covers range normalization, exact start/end filtering,
 * cross-chapter loading, fetch-failure handling, and provenance/licence.
 */

const NOW = '2026-01-01T00:00:00.000Z';

/** aruljohn-shaped KJV book JSON for John, chapters 3 (16–18) and 4 (1). */
function kjvJohnJson() {
  return {
    book: 'John',
    chapters: [
      {
        chapter: '3',
        verses: [
          { verse: '16', text: 'For God so loved the world.' },
          { verse: '17', text: 'For God sent not his Son to condemn the world.' },
          { verse: '18', text: 'He that believeth on him is not condemned.' },
        ],
      },
      { chapter: '4', verses: [{ verse: '1', text: 'When therefore the Lord knew.' }] },
    ],
  };
}

/** scrollmapper-shaped whole-Bible ASV JSON: 66 books, John (index 42) populated. */
function asvBibleJson() {
  const books = REMOTE_ENGLISH_BOOKS.map((b) => ({ name: b.name, chapters: [] as unknown[] }));
  books[42] = {
    name: 'John',
    chapters: [
      {
        chapter: 3,
        verses: [
          { verse: 16, text: 'For God so loved the world, that he gave his only begotten Son.' },
          { verse: 17, text: 'For God sent not the Son into the world to judge the world.' },
          { verse: 18, text: 'He that believeth on him is not judged.' },
        ],
      },
    ],
  };
  return { translation: 'ASV: American Standard Version (1901)', books };
}

/** A fetch stub that routes by URL to KJV/ASV fixtures. */
function stubFetch() {
  const fn = vi.fn(async (url: string) => {
    if (url === ASV_URL) return jsonResponse(asvBibleJson());
    if (url.includes('aruljohn') && url.endsWith('John.json')) return jsonResponse(kjvJohnJson());
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  clearRemoteEnglishCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('remote English source manifest / provenance', () => {
  it('exposes KJV and ASV as remote English sources with licence + repo', () => {
    const ids = REMOTE_ENGLISH_SOURCES.map((s) => s.id);
    expect(ids).toEqual(['english-kjv', 'english-asv']);
    for (const s of REMOTE_ENGLISH_SOURCES) {
      expect(isRemoteEnglishSource(s.id)).toBe(true);
      expect(s.license).toMatch(/public domain/i);
      expect(s.repo).toMatch(/^https:\/\/github\.com\//);
    }
    expect(remoteEnglishSourceInfo('english-kjv').strategy).toBe('per-book');
    expect(remoteEnglishSourceInfo('english-asv').strategy).toBe('whole-bible');
    // Canonical 66-book list, John at #43.
    expect(REMOTE_ENGLISH_BOOKS).toHaveLength(66);
    expect(REMOTE_ENGLISH_BOOKS.find((b) => b.name === 'John')?.num).toBe(43);
  });

  it('builds the KJV per-book URL with spaces stripped', () => {
    expect(kjvBookUrl('John')).toMatch(/\/John\.json$/);
    expect(kjvBookUrl('1 Samuel')).toMatch(/\/1Samuel\.json$/);
    expect(kjvBookUrl('Song of Solomon')).toMatch(/\/SongofSolomon\.json$/);
  });
});

describe('KJV loading (mocked fetch)', () => {
  it('normalizes a KJV book and carries NO original-language tags', async () => {
    stubFetch();
    const book = await loadRemoteEnglishBibleBook('english-kjv', 43);
    expect(book.version).toBe('kjv');
    expect(book.book).toBe('John');
    expect(book.corpus).toBe('nt');
    expect(book.verses['3:16']?.text).toBe('For God so loved the world.');
    for (const v of Object.values(book.verses)) {
      for (const w of v.words) {
        expect(w.alignmentMethod).toBe('none');
        expect(w.strong).toBeUndefined();
        expect(w.lemma).toBeUndefined();
      }
    }
  });

  it('obeys an exact intra-chapter verse range (discards out-of-range verses)', async () => {
    stubFetch();
    const book = await loadRemoteEnglishBibleBook('english-kjv', 43);
    const doc = buildDiscourseDocumentFromEnglishBibleRange(book, {
      startRef: '3:16',
      endRef: '3:18',
      granularity: 'verse',
      now: NOW,
    });
    expect(doc.language).toBe('en');
    for (const t of doc.tokens) expect(refInRange(t.ref, '3:16', '3:18')).toBe(true);
    // 4:1 is out of range.
    expect(doc.tokens.some((t) => t.ref === '4:1')).toBe(false);
  });

  it('loads a cross-chapter range', async () => {
    stubFetch();
    const book = await loadRemoteEnglishBibleBook('english-kjv', 43);
    const doc = buildDiscourseDocumentFromEnglishBibleRange(book, {
      startRef: '3:17',
      endRef: '4:1',
      granularity: 'verse',
      now: NOW,
    });
    const refs = doc.units.filter((u) => u.tokenIds.length).map((u) => u.refStart);
    expect(refs).toEqual(['3:17', '3:18', '4:1']);
    expect(doc.tokens.some((t) => t.ref === '3:16')).toBe(false);
  });

  it('caches the per-book fetch (one network call for repeat loads)', async () => {
    const fn = stubFetch();
    await loadRemoteEnglishBibleBook('english-kjv', 43);
    await loadRemoteEnglishBibleBook('english-kjv', 43);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('ASV loading (mocked fetch)', () => {
  it('slices the whole-Bible JSON by canonical index into a plain English book', async () => {
    stubFetch();
    const book = await loadRemoteEnglishBibleBook('english-asv', 43);
    expect(book.version).toBe('asv');
    expect(book.book).toBe('John');
    expect(book.verses['3:16']?.text).toContain('only begotten Son');
    expect(book.verses['3:16']?.words.every((w) => w.alignmentMethod === 'none')).toBe(true);
    expect(book.verses['3:16']?.words.every((w) => w.strong === undefined)).toBe(true);
  });

  it('fetches the whole bible only once, then serves other books from cache', async () => {
    const fn = stubFetch();
    await loadRemoteEnglishBibleBook('english-asv', 43);
    await loadRemoteEnglishBibleBook('english-asv', 43);
    expect(fn.mock.calls.filter((c) => c[0] === ASV_URL)).toHaveLength(1);
  });

  it('flows through the unified loadEnglishBibleBook entry point', async () => {
    stubFetch();
    const book = await loadEnglishBibleBook('english-asv', 43);
    expect(book.sourceId).toBe('english-asv');
  });
});

describe('fetch failure handling', () => {
  it('rejects with a readable error on an HTTP error and does not cache the failure', async () => {
    const fn = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response);
    vi.stubGlobal('fetch', fn);
    await expect(loadRemoteEnglishBibleBook('english-kjv', 43)).rejects.toThrow(/KJV/);
    // A later successful attempt still works (failure wasn't cached).
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(kjvJohnJson())));
    const book = await loadRemoteEnglishBibleBook('english-kjv', 43);
    expect(book.book).toBe('John');
  });

  it('rejects when the network is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await expect(loadRemoteEnglishBibleBook('english-asv', 43)).rejects.toThrow(/ASV/);
  });
});

describe('pure normalizers (no fetch)', () => {
  it('kjvJsonToEnglishBook is deterministic and OT/NT aware', () => {
    const book = kjvJsonToEnglishBook('english-kjv', { name: 'John', num: 43 }, kjvJohnJson());
    const again = kjvJsonToEnglishBook('english-kjv', { name: 'John', num: 43 }, kjvJohnJson());
    expect(book).toEqual(again);
    expect(book.corpus).toBe('nt');
    const gen = kjvJsonToEnglishBook('english-kjv', { name: 'Genesis', num: 1 }, {
      book: 'Genesis',
      chapters: [{ chapter: '1', verses: [{ verse: '1', text: 'In the beginning.' }] }],
    });
    expect(gen.corpus).toBe('ot');
  });

  it('scrollmapperBookToEnglishBook copies verses without fabricating tags', () => {
    const src = asvBibleJson().books[42] as { name: string; chapters: { chapter: number; verses: { verse: number; text: string }[] }[] };
    const book = scrollmapperBookToEnglishBook('english-asv', 'asv', { name: 'John', num: 43 }, src);
    expect(Object.keys(book.verses)).toContain('3:18');
    expect(book.verses['3:18']?.words.every((w) => w.lemma === undefined)).toBe(true);
  });
});
