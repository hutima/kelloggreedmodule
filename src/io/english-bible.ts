import type { EnglishBibleBook, EnglishBibleVerse, EnglishBibleWord } from '@/domain/discourse';
import { GNT_BOOKS, type GntBook } from './gnt';
import { OT_BOOKS, type OtBook } from './ot';
import { loadParallelBook, loadParallelOtBook, type OtParallelBook, type ParallelBook } from './parallel';
import {
  REMOTE_ENGLISH_SOURCES,
  REMOTE_ENGLISH_BOOKS,
  isRemoteEnglishSource,
  loadRemoteEnglishBibleBook,
  type RemoteEnglishSourceId,
} from './english-bible-remote';

/**
 * ENGLISH BIBLE LOADER — turns the bundled parallel corpora into a normalized
 * `EnglishBibleBook` for Discourse mode, WITHOUT going through a Greek/Hebrew
 * syntax parse. Reuses the existing BSB parallel JSON (NT: `public/parallel/bsb`,
 * OT: `public/parallel/bsb/ot`) so no new data is fetched.
 *
 * Tagging is copied ONLY where the source carries it — never invented:
 *   - BSB NT words aligned to the Greek keep their Strong's number + lemma
 *     (`alignmentMethod: 'greek'`);
 *   - BSB OT words aligned to the Hebrew keep the morpheme id they map to
 *     (`alignmentMethod: 'hebrew'`); the Hebrew alignment carries no Strong's,
 *     so none is added;
 *   - unaligned words (function words, punctuation) are honestly `'none'`.
 *
 * KJV / ASV are NOT bundled either — but they ARE offered as REMOTE, English-ONLY
 * sources (see `english-bible-remote.ts`): fetched on demand from public-domain
 * data and cached, with NO Strong's/lemma/morphology/alignment (adding those
 * would mean fabricating tags, which is out of scope).
 */

/** English Bible sources offered in Discourse mode (bundled BSB + remote KJV/ASV). */
export type EnglishBibleSourceId = 'english-bsb' | 'english-bsb-ot' | RemoteEnglishSourceId;

export interface EnglishBibleSourceInfo {
  id: EnglishBibleSourceId;
  label: string;
  version: 'bsb' | 'kjv' | 'asv';
  /** `full` = the whole 66-book canon (remote KJV/ASV cover both testaments). */
  corpus: 'nt' | 'ot' | 'full';
}

export const ENGLISH_BIBLE_SOURCES: EnglishBibleSourceInfo[] = [
  { id: 'english-bsb', label: 'BSB English', version: 'bsb', corpus: 'nt' },
  { id: 'english-bsb-ot', label: 'BSB English OT', version: 'bsb', corpus: 'ot' },
  // Remote, English-only whole-Bible sources (KJV, ASV).
  ...REMOTE_ENGLISH_SOURCES.map(
    (s): EnglishBibleSourceInfo => ({ id: s.id, label: s.label, version: s.version, corpus: 'full' }),
  ),
];

export function isEnglishBibleSource(id: string): id is EnglishBibleSourceId {
  return ENGLISH_BIBLE_SOURCES.some((s) => s.id === id);
}

export function englishBibleSourceInfo(id: EnglishBibleSourceId): EnglishBibleSourceInfo {
  return ENGLISH_BIBLE_SOURCES.find((s) => s.id === id)!;
}

/** Books offered for an English Bible source (all books its corpus has data for). */
export function englishBibleBooksFor(id: EnglishBibleSourceId): { num: number; name: string }[] {
  if (isRemoteEnglishSource(id)) return REMOTE_ENGLISH_BOOKS.map((b) => ({ num: b.num, name: b.name }));
  return englishBibleSourceInfo(id).corpus === 'ot'
    ? OT_BOOKS.map((b) => ({ num: b.num, name: b.name }))
    : GNT_BOOKS.map((b) => ({ num: b.num, name: b.name }));
}

/** Convert a "c.v" key to canonical "c:v". */
function canonRef(key: string): string {
  const [c, v] = key.split('.');
  return `${Number(c)}:${Number(v)}`;
}

/** Rebuild a verse's readable text from its word list + no-space indices. */
function verseText(words: string[], nosp: number[] | undefined): string {
  const noSpaceAfter = new Set(nosp ?? []);
  let out = '';
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && !noSpaceAfter.has(i - 1)) out += ' ';
    out += words[i];
  }
  return out.trim();
}

interface NoSpaceGroup {
  surface: string;
  /** Original word indices this display token was joined from. */
  origIndices: number[];
}

/**
 * Group words written with no space between them (per `nosp`) into a single
 * display token, so punctuation ATTACHES to its word — `["Christ", ","]` →
 * `"Christ,"` — instead of standing as its own token in Discourse mode. This is
 * exactly the join {@link verseText} already uses for the readable string, so
 * the tokens and the text stay in step. KJV/ASV/plaintext already keep
 * punctuation attached (whitespace tokenization); this brings BSB in line.
 */
function mergeNoSpaceGroups(words: string[], nosp: number[] | undefined): NoSpaceGroup[] {
  const noSpaceAfter = new Set(nosp ?? []);
  const groups: NoSpaceGroup[] = [];
  let cur: NoSpaceGroup | null = null;
  for (let i = 0; i < words.length; i++) {
    if (!cur) cur = { surface: '', origIndices: [] };
    cur.surface += words[i];
    cur.origIndices.push(i);
    if (!noSpaceAfter.has(i)) {
      groups.push(cur);
      cur = null;
    }
  }
  if (cur) groups.push(cur);
  return groups;
}

/** The alignment tag for a merged group: the first aligned member wins (the real
 *  word; attached punctuation carries none). */
function groupTag(
  origIndices: number[],
  tags: Map<number, Partial<EnglishBibleWord>>,
): Partial<EnglishBibleWord> | undefined {
  for (const i of origIndices) {
    const t = tags.get(i);
    if (t) return t;
  }
  return undefined;
}

/**
 * Map English word index → tag, from a verse's alignment links.
 * `linkOf(link)` extracts the per-word tag; `enOf(link)` its English indices.
 */
function tagByEnglishIndex<L>(
  links: L[],
  enOf: (l: L) => number[],
  tagOf: (l: L) => Partial<EnglishBibleWord>,
): Map<number, Partial<EnglishBibleWord>> {
  const out = new Map<number, Partial<EnglishBibleWord>>();
  for (const link of links) {
    const tag = tagOf(link);
    for (const en of enOf(link)) if (!out.has(en)) out.set(en, tag);
  }
  return out;
}

interface GreekLinkLike {
  s?: number;
  en?: number[];
  lem?: string;
}
interface HebrewLinkLike {
  i?: string;
  e?: number[];
}

function wordId(sourceId: string, book: string, ref: string, index: number): string {
  return `${sourceId}_${book.toLowerCase().replace(/[^a-z0-9]+/g, '')}_${ref.replace(/:/g, '.')}_${index}`;
}

/** Pure conversion of a BSB NT parallel book → normalized English book. */
export function bsbNtToEnglishBook(
  sourceId: string,
  book: { name: string; num: number },
  pb: ParallelBook,
): EnglishBibleBook {
  const verses: Record<string, EnglishBibleVerse> = {};
  for (const [key, words] of Object.entries(pb.verses)) {
    const ref = canonRef(key);
    const links = (pb.links[key] ?? []) as GreekLinkLike[];
    const tags = tagByEnglishIndex<GreekLinkLike>(
      links,
      (l) => l.en ?? [],
      (l) => ({
        strong: l.s && l.s > 0 ? String(l.s) : undefined,
        lemma: l.lem,
        alignmentMethod: 'greek',
      }),
    );
    verses[ref] = {
      ref,
      text: verseText(words, pb.nosp?.[key]),
      words: mergeNoSpaceGroups(words, pb.nosp?.[key]).map((g, index) => {
        const tag = groupTag(g.origIndices, tags);
        return {
          id: wordId(sourceId, book.name, ref, index),
          surface: g.surface,
          ref,
          index,
          strong: tag?.strong,
          lemma: tag?.lemma,
          alignmentMethod: tag?.alignmentMethod ?? 'none',
        };
      }),
    };
  }
  return { sourceId, version: 'bsb', corpus: 'nt', book: book.name, bookNum: book.num, verses };
}

/** Pure conversion of a BSB OT parallel book → normalized English book. */
export function bsbOtToEnglishBook(
  sourceId: string,
  book: { name: string; num: number },
  pb: OtParallelBook,
): EnglishBibleBook {
  const verses: Record<string, EnglishBibleVerse> = {};
  for (const [key, words] of Object.entries(pb.verses)) {
    const ref = canonRef(key);
    const links = (pb.links[key] ?? []) as HebrewLinkLike[];
    const tags = tagByEnglishIndex<HebrewLinkLike>(
      links,
      (l) => l.e ?? [],
      (l) => ({
        sourceTokenIds: l.i ? [l.i] : undefined,
        alignmentMethod: 'hebrew',
      }),
    );
    verses[ref] = {
      ref,
      text: verseText(words, pb.nosp?.[key]),
      words: mergeNoSpaceGroups(words, pb.nosp?.[key]).map((g, index) => {
        const tag = groupTag(g.origIndices, tags);
        return {
          id: wordId(sourceId, book.name, ref, index),
          surface: g.surface,
          ref,
          index,
          sourceTokenIds: tag?.sourceTokenIds,
          alignmentMethod: tag?.alignmentMethod ?? 'none',
        };
      }),
    };
  }
  return { sourceId, version: 'bsb', corpus: 'ot', book: book.name, bookNum: book.num, verses };
}

/** Fetch + convert a BSB NT book. */
async function loadBsbNt(sourceId: string, book: GntBook): Promise<EnglishBibleBook> {
  const pb = await loadParallelBook(book, 'bsb');
  if (!pb) throw new Error(`No BSB English data bundled for ${book.name}.`);
  return bsbNtToEnglishBook(sourceId, book, pb);
}

/** Fetch + convert a BSB OT book (Hebrew-aligned; no Strong's in the data). */
async function loadBsbOt(sourceId: string, book: OtBook): Promise<EnglishBibleBook> {
  const pb = await loadParallelOtBook(book);
  if (!pb) throw new Error(`No BSB English OT data bundled for ${book.name}.`);
  return bsbOtToEnglishBook(sourceId, book, pb);
}

/** Load a normalized English Bible book for an English discourse source. */
export async function loadEnglishBibleBook(
  sourceId: EnglishBibleSourceId,
  bookNum: number,
): Promise<EnglishBibleBook> {
  if (isRemoteEnglishSource(sourceId)) return loadRemoteEnglishBibleBook(sourceId, bookNum);
  const info = englishBibleSourceInfo(sourceId);
  if (info.corpus === 'ot') {
    const book = OT_BOOKS.find((b) => b.num === bookNum);
    if (!book) throw new Error('Unknown OT book for this source.');
    return loadBsbOt(sourceId, book);
  }
  const book = GNT_BOOKS.find((b) => b.num === bookNum);
  if (!book) throw new Error('Unknown NT book for this source.');
  return loadBsbNt(sourceId, book);
}
