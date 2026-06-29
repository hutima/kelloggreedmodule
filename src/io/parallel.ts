import type { KrDocument, Token } from '@/domain/schema';
import { GNT_BOOKS, type GntBook } from './gnt';
import { OT_BOOKS, type OtBook } from './ot';

/**
 * Parallel English text for the GNT. Each book is the Berean Standard Bible
 * (public domain), manually word-aligned to the Greek by Clear-Bible, and
 * preprocessed (see `scripts/fetch-parallel.mjs`) into one compact JSON per book.
 *
 * The alignment's Greek base is SBLGNT, ~99% identical to our Nestle1904 but not
 * byte-for-byte. So we never trust word POSITION across the two texts: every
 * Greek word carries a Strong's number (`s`), and `alignParallel` matches our
 * Nestle1904 tokens to the aligned words by LEXEME (Strong's), nearest position
 * breaking ties. A textual variant typically shifts only a word or two, so the
 * rest of the verse still links correctly.
 */

interface GreekLink {
  /** Word position within the verse (1-based), per the SBLGNT base. */
  g: number;
  /** Strong's number (0 when none). */
  s: number;
  /** Indices into the verse's English `words` this Greek word maps to. */
  en: number[];
  /** Lemma, kept only as a fallback when `s` is 0. */
  lem?: string;
}

export interface ParallelBook {
  version: string;
  book: string;
  bookNum: number;
  /** "chapter.verse" → English words (surface strings, in reading order). */
  verses: Record<string, string[]>;
  /** "chapter.verse" → indices after which no space is written. */
  nosp?: Record<string, number[]>;
  /** "chapter.verse" → indices that are punctuation / excluded from alignment. */
  excl?: Record<string, number[]>;
  /** "chapter.verse" → the Greek words of that verse with their English links. */
  links: Record<string, GreekLink[]>;
}

const cache = new Map<string, Promise<ParallelBook | null>>();

function base(): string {
  const b = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${b.replace(/\/$/, '')}/parallel/`;
}

/** The GNT book a passage belongs to, from its title ("Philippians 1:1–3"). */
export function bookForDoc(doc: KrDocument): GntBook | undefined {
  const title = doc.title ?? '';
  // Prefer the longest matching name so "1 John" wins over "John".
  return [...GNT_BOOKS]
    .sort((a, b) => b.name.length - a.name.length)
    .find((b) => title === b.name || title.startsWith(`${b.name} `));
}

/** Fetch and cache a parallel book by its GNT book number (1-27). */
export async function loadParallelBook(
  book: GntBook,
  version = 'bsb',
): Promise<ParallelBook | null> {
  const file = `${book.file.replace(/\.xml$/, '')}.json`;
  const key = `${version}/${file}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(base() + key)
        .then((r) => (r.ok ? (r.json() as Promise<ParallelBook>) : null))
        .catch(() => null),
    );
  }
  return cache.get(key)!;
}

// --- Old Testament (Hebrew) parallel -----------------------------------------
// macula-hebrew and the WLC alignment share the SAME word ids, so OT links carry
// the morpheme id and the runtime matches EXACTLY by id — no lexeme guessing.

/** A Hebrew word's English link: `i` = morpheme key (word+morpheme), `e` = English indices. */
interface HebrewLink {
  i: string;
  e: number[];
}

export interface OtParallelBook {
  version: string;
  book: string;
  bookNum: number;
  verses: Record<string, string[]>;
  nosp?: Record<string, number[]>;
  excl?: Record<string, number[]>;
  links: Record<string, HebrewLink[]>;
}

const otCache = new Map<string, Promise<OtParallelBook | null>>();

function otSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The OT book a passage belongs to, from its title ("Genesis 1:1"). */
export function bookForOtDoc(doc: KrDocument): OtBook | undefined {
  const title = doc.title ?? '';
  return [...OT_BOOKS]
    .sort((a, b) => b.name.length - a.name.length)
    .find((b) => title === b.name || title.startsWith(`${b.name} `));
}

/** Fetch and cache a Hebrew parallel book (one JSON per OT book). */
export async function loadParallelOtBook(book: OtBook): Promise<OtParallelBook | null> {
  const key = `bsb/ot/${String(book.num).padStart(2, '0')}-${otSlug(book.name)}.json`;
  if (!otCache.has(key)) {
    otCache.set(
      key,
      fetch(base() + key)
        .then((r) => (r.ok ? (r.json() as Promise<OtParallelBook>) : null))
        .catch(() => null),
    );
  }
  return otCache.get(key)!;
}

export interface ParallelWord {
  /** Index within the verse's word list. */
  i: number;
  /** Surface text. */
  t: string;
  /** Punctuation / non-aligned: rendered attached, never a hover target. */
  excl: boolean;
  /** No space is written before this word. */
  joinLeft: boolean;
}

export interface ParallelVerse {
  /** "chapter.verse" key. */
  key: string;
  /** Display label "chapter:verse". */
  label: string;
  words: ParallelWord[];
}

export interface ParallelView {
  verses: ParallelVerse[];
  /** "verseKey#wordIndex" → diagram node ids that word translates. */
  enToNodes: Map<string, string[]>;
  /** Diagram node id → English word keys ("verseKey#wordIndex"). */
  nodeToEn: Map<string, string[]>;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** ".1.1!3" style ref → ["1.1", 3]; undefined if it isn't a verse-word ref. */
function parseRef(ref: string | undefined): [string, number] | undefined {
  if (!ref) return undefined;
  const m = /\.(\d+)\.(\d+)!(\d+)/.exec(ref);
  return m ? [`${m[1]}.${m[2]}`, Number(m[3])] : undefined;
}

/**
 * Align a (Greek) passage document to a parallel English book: produce the
 * English verses to render plus the two-way Greek-node ↔ English-word maps used
 * for hover linking. Matching is by Strong's lexeme, nearest position breaking
 * ties, with a bare positional fallback.
 */
export function alignParallel(doc: KrDocument, book: ParallelBook): ParallelView {
  const tokenToNode = new Map<string, string>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);

  // Bucket the document's tokens by verse, in first-seen order.
  const byVerse = new Map<string, { token: Token; pos: number; strong: number }[]>();
  const order: string[] = [];
  for (const t of doc.tokens) {
    const parsed = parseRef(t.morphology?.extra?.ref);
    if (!parsed) continue;
    const [key, pos] = parsed;
    const strong = Number(t.morphology?.extra?.strong ?? 0);
    let list = byVerse.get(key);
    if (!list) {
      byVerse.set(key, (list = []));
      order.push(key);
    }
    list.push({ token: t, pos, strong });
  }

  const enToNodes = new Map<string, string[]>();
  const nodeToEn = new Map<string, string[]>();
  const verses: ParallelVerse[] = [];

  for (const key of order) {
    const words = book.verses[key];
    if (!words) continue;
    const exclSet = new Set(book.excl?.[key] ?? []);
    const nospSet = new Set(book.nosp?.[key] ?? []);
    const links = (book.links[key] ?? []).map((l) => ({ ...l, used: false }));
    const toks = byVerse.get(key) ?? [];

    for (const { token, pos, strong } of toks) {
      // Best lexeme match: same Strong's number, nearest position.
      let best = -1;
      let bestDist = Infinity;
      if (strong) {
        for (let i = 0; i < links.length; i++) {
          const l = links[i]!;
          if (l.used || l.s !== strong) continue;
          const d = Math.abs(l.g - pos);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
      }
      // Fall back to an exact position match when no lexeme match remains.
      if (best < 0) {
        for (let i = 0; i < links.length; i++) {
          if (!links[i]!.used && links[i]!.g === pos) {
            best = i;
            break;
          }
        }
      }
      if (best < 0) continue;
      links[best]!.used = true;
      const node = tokenToNode.get(token.id);
      if (!node) continue;
      for (const ei of links[best]!.en) {
        if (exclSet.has(ei)) continue;
        const ek = `${key}#${ei}`;
        push(enToNodes, ek, node);
        push(nodeToEn, node, ek);
      }
    }

    verses.push({
      key,
      label: key.replace('.', ':'),
      words: words.map((t, i) => ({
        i,
        t,
        excl: exclSet.has(i),
        joinLeft: i > 0 && nospSet.has(i - 1),
      })),
    });
  }

  return { verses, enToNodes, nodeToEn };
}

/** A macula-hebrew token id "t_o<bb ccc vvv www m>" → [verseKey, morphemeKey]. */
function parseHebrewId(id: string): [string, string] | undefined {
  const m = /^t_o(\d{12})$/.exec(id);
  if (!m) return undefined;
  const d = m[1]!;
  return [`${Number(d.slice(2, 5))}.${Number(d.slice(5, 8))}`, d.slice(8)];
}

/**
 * Align a Hebrew passage to its parallel English book. Because macula-hebrew and
 * the WLC alignment share word ids, this is a direct id lookup (no lexeme/
 * position matching): each token's morpheme key selects its English words.
 */
export function alignParallelHebrew(doc: KrDocument, book: OtParallelBook): ParallelView {
  const tokenToNode = new Map<string, string>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);

  const byVerse = new Map<string, { token: Token; mkey: string }[]>();
  const order: string[] = [];
  for (const t of doc.tokens) {
    const parsed = parseHebrewId(t.id);
    if (!parsed) continue;
    const [key, mkey] = parsed;
    let list = byVerse.get(key);
    if (!list) {
      byVerse.set(key, (list = []));
      order.push(key);
    }
    list.push({ token: t, mkey });
  }

  const enToNodes = new Map<string, string[]>();
  const nodeToEn = new Map<string, string[]>();
  const verses: ParallelVerse[] = [];

  for (const key of order) {
    const words = book.verses[key];
    if (!words) continue;
    const exclSet = new Set(book.excl?.[key] ?? []);
    const nospSet = new Set(book.nosp?.[key] ?? []);
    const enByMorpheme = new Map<string, number[]>();
    for (const l of book.links[key] ?? []) enByMorpheme.set(l.i, l.e);

    for (const { token, mkey } of byVerse.get(key) ?? []) {
      const en = enByMorpheme.get(mkey);
      const node = tokenToNode.get(token.id);
      if (!en || !node) continue;
      for (const ei of en) {
        if (exclSet.has(ei)) continue;
        const ek = `${key}#${ei}`;
        push(enToNodes, ek, node);
        push(nodeToEn, node, ek);
      }
    }

    verses.push({
      key,
      label: key.replace('.', ':'),
      words: words.map((t, i) => ({
        i,
        t,
        excl: exclSet.has(i),
        joinLeft: i > 0 && nospSet.has(i - 1),
      })),
    });
  }

  return { verses, enToNodes, nodeToEn };
}
