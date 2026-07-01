import type {
  Degree,
  Gender,
  GrammaticalCase,
  GrammaticalNumber,
  KrDocument,
  Mood,
  PartOfSpeech,
  Person,
  Tense,
  Token,
  Voice,
} from '@/domain/schema';

/**
 * Morphological corpus search — an Accordance-style "find every word matching a
 * lexeme AND/OR a morphology profile" (e.g. every optative verb, or every
 * genitive of λόγος) over an ALREADY-LOADED book.
 *
 * Pure and side-effect free: it scans the flat `tokens` array of each passage
 * document. Because a whole book's sentences already live in memory once loaded
 * (they back prev/next navigation), searching one is an in-memory scan — no
 * fetch, instant. This deliberately does NOT reach across books: the app loads
 * one book at a time, so the search unit is one loaded book.
 */

/** A set search criteria; an empty field means "don't constrain on it". */
export interface SearchQuery {
  /** Free text matched against surface, lemma, OR gloss (accent-insensitive). */
  text?: string;
  pos?: PartOfSpeech;
  case?: GrammaticalCase;
  gender?: Gender;
  number?: GrammaticalNumber;
  person?: Person;
  tense?: Tense;
  voice?: Voice;
  mood?: Mood;
  degree?: Degree;
}

/** One matched word, with enough context to open and highlight it. */
export interface SearchHit {
  /** The passage document the match belongs to. */
  doc: KrDocument;
  /** Index of that passage within the loaded book (for prev/next context). */
  docIndex: number;
  token: Token;
  /** The syntax node realizing the token, if any (for select-on-open). */
  nodeId?: string;
  /** Which book the hit came from — set only by a whole-corpus search, so opening
   *  the hit can RELOAD that one book (the sweep never keeps books in memory). */
  bookNum?: number;
}

export interface SearchResult {
  hits: SearchHit[];
  /** Total matches found across the book (may exceed `hits.length` when capped). */
  total: number;
  /** True when `total` exceeded the cap and `hits` is a prefix of the matches. */
  capped: boolean;
}

/**
 * Fold diacritics away and lowercase, so an unaccented query ("logos" / "λογος")
 * still finds the accented surface/lemma ("λόγος"). Decomposing (NFD) first turns
 * precomposed polytonic Greek and pointed Hebrew into base letter + combining
 * marks, then every NONSPACING mark (`\p{Mn}` — Greek accents/breathings/iota
 * subscript AND Hebrew vowel points / cantillation) is stripped, so the fold is
 * script-agnostic: both the query and the corpus it is matched against lose their
 * accents/points.
 */
export function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
}

/**
 * Whether a string carries any accent/point that `foldAccents` would strip — used
 * to note to the user that their accented query is matched without accents (so an
 * exact-accent expectation isn't silently ignored).
 */
export function hasAccents(s: string): boolean {
  return /\p{Mn}/u.test(s.normalize('NFD'));
}

/** True when the query has no active criteria (a search would match everything). */
export function isEmptyQuery(q: SearchQuery): boolean {
  return (
    !(q.text && q.text.trim()) &&
    !q.pos &&
    !q.case &&
    !q.gender &&
    !q.number &&
    !q.person &&
    !q.tense &&
    !q.voice &&
    !q.mood &&
    !q.degree
  );
}

/** Does one token satisfy every SET criterion of the query? */
export function matchToken(token: Token, q: SearchQuery): boolean {
  const text = q.text?.trim();
  if (text) {
    const needle = foldAccents(text);
    const fields = [token.surface, token.lemma, token.gloss];
    if (!fields.some((f) => f && foldAccents(f).includes(needle))) return false;
  }
  if (q.pos && token.pos !== q.pos) return false;
  const m = token.morphology ?? {};
  if (q.case && m.case !== q.case) return false;
  if (q.gender && m.gender !== q.gender) return false;
  if (q.number && m.number !== q.number) return false;
  if (q.person && m.person !== q.person) return false;
  if (q.tense && m.tense !== q.tense) return false;
  if (q.voice && m.voice !== q.voice) return false;
  if (q.mood && m.mood !== q.mood) return false;
  if (q.degree && m.degree !== q.degree) return false;
  return true;
}

/**
 * Cap on rendered hits so a broad query ("every noun in Matthew") reports its
 * true total but only materializes a manageable prefix. `total`/`capped` let the
 * UI say "showing the first N of M" rather than silently truncating.
 */
export const SEARCH_RESULT_CAP = 300;

/** Search a loaded book's passages for tokens matching the query. */
export function searchPassages(passages: KrDocument[], q: SearchQuery): SearchResult {
  const hits: SearchHit[] = [];
  let total = 0;
  for (let i = 0; i < passages.length; i++) {
    const doc = passages[i]!;
    // token id → the node that realizes it, so opening a hit can highlight it.
    const nodeOf = new Map<string, string>();
    for (const n of doc.syntax.nodes) for (const t of n.tokenIds) nodeOf.set(t, n.id);
    for (const token of doc.tokens) {
      if (!matchToken(token, q)) continue;
      total += 1;
      if (hits.length < SEARCH_RESULT_CAP) {
        hits.push({ doc, docIndex: i, token, nodeId: nodeOf.get(token.id) });
      }
    }
  }
  return { hits, total, capped: total > hits.length };
}

/** One book of a corpus, with a loader to fetch+parse it on demand. */
export interface CorpusBook {
  num: number;
  name: string;
}

/** Live progress of a whole-corpus (testament) sweep. */
export interface CorpusProgress {
  /** Books fully searched so far. */
  done: number;
  /** Books in the corpus. */
  total: number;
  /** The book currently loading/searching (empty when finished). */
  current: string;
  /** Running match total across finished books. */
  matches: number;
}

/**
 * Search a WHOLE corpus (a testament) book by book, keeping memory flat: each book
 * is loaded, searched, its matching hits merged in (capped), and then its parsed
 * documents are DROPPED before the next book — only the ≤`SEARCH_RESULT_CAP` hit
 * sentences and the running totals survive. The book loader is injected (so this
 * stays pure/testable); `afterBook` lets the caller free that book's fetch cache,
 * and `signal` cancels a running sweep. Hits are stamped with their `bookNum` so
 * opening one can reload just that book for prev/next context.
 */
export async function searchCorpus(
  books: CorpusBook[],
  load: (num: number) => Promise<KrDocument[]>,
  q: SearchQuery,
  opts: {
    signal?: AbortSignal;
    onProgress?: (p: CorpusProgress) => void;
    onPartial?: (r: SearchResult) => void;
    afterBook?: (num: number) => void | Promise<void>;
  } = {},
): Promise<SearchResult> {
  const hits: SearchHit[] = [];
  let total = 0;
  for (let i = 0; i < books.length; i++) {
    if (opts.signal?.aborted) break;
    const b = books[i]!;
    opts.onProgress?.({ done: i, total: books.length, current: b.name, matches: total });
    let docs: KrDocument[] | null = null;
    try {
      docs = await load(b.num);
    } catch {
      await opts.afterBook?.(b.num); // a book that won't load shouldn't sink the sweep
      continue;
    }
    if (opts.signal?.aborted) break;
    const res = searchPassages(docs, q);
    total += res.total;
    for (const h of res.hits) {
      if (hits.length >= SEARCH_RESULT_CAP) break;
      hits.push({ ...h, bookNum: b.num });
    }
    docs = null; // drop the book's docs; only matched hit sentences are retained
    opts.onPartial?.({ hits: [...hits], total, capped: total > hits.length });
    await opts.afterBook?.(b.num);
  }
  opts.onProgress?.({ done: books.length, total: books.length, current: '', matches: total });
  return { hits, total, capped: total > hits.length };
}
