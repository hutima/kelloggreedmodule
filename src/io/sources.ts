import type { KrDocument } from '@/domain/schema';
import { GNT_BOOKS, loadGntBook } from './gnt';
import { OPENTEXT_BOOKS, loadOpenTextBook } from './opentext-source';
import { combinePassage } from './passage';

/**
 * Syntax SOURCES — the published analyses a GNT passage can be read from. Each
 * yields ordinary `KrDocument`s, so any of them can be the editable base or a
 * side-by-side comparison pane. (Currently the two GNT parses; Hebrew/other
 * sources can join this list.)
 */
export type SyntaxSourceId = 'nestle1904' | 'opentext';

export const SYNTAX_SOURCES: { id: SyntaxSourceId; label: string }[] = [
  { id: 'nestle1904', label: 'Nestle 1904 (Lowfat)' },
  { id: 'opentext', label: 'OpenText.org' },
];

export function sourceLabel(id: SyntaxSourceId): string {
  return SYNTAX_SOURCES.find((s) => s.id === id)?.label ?? id;
}

/** Which source a loaded passage came from, inferred from its document id. */
export function sourceOfDoc(doc: KrDocument): SyntaxSourceId {
  return doc.id.startsWith('opentext_') ? 'opentext' : 'nestle1904';
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Book + chapter + verse RANGE from a passage title ("Philemon 1:1–2"). */
function bookAndRange(
  title: string,
): { book: string; chap: number; v0: number; v1: number } | null {
  const m = title.match(/^(.*?)\s+(\d+):(\d+)(?:[–-](\d+))?/);
  if (!m) return null;
  const v0 = Number(m[3]);
  return { book: m[1]!.trim(), chap: Number(m[2]), v0, v1: m[4] ? Number(m[4]) : v0 };
}

/** Whether a sentence title's verse span OVERLAPS [v0,v1] in the given chapter. */
function overlaps(title: string, chap: number, v0: number, v1: number): boolean {
  const m = title.match(/(\d+):(\d+)(?:[–-](\d+))?\s*$/);
  if (!m) return false;
  const c = Number(m[1]);
  const s0 = Number(m[2]);
  const s1 = m[3] ? Number(m[3]) : s0;
  return c === chap && s1 >= v0 && s0 <= v1;
}

/**
 * Load `source`'s parse of the SAME passage a reference document shows, matched
 * by book + the reference's full verse RANGE. Every sentence in the source that
 * OVERLAPS that range is combined into one document, so the comparison pane
 * covers the same verses even when the two sources split sentences differently
 * (e.g. OpenText splits Eph 1:7–10 into 1:7 / 1:8–9 / 1:9–10 where Nestle1904
 * keeps one 1:7–10 sentence). The combined document's title reports the verses it
 * actually spans, so each pane can label its own reference. Returns null when the
 * source has no overlapping passage. Whole-book loads are cached.
 */
export async function loadSourcePassage(
  source: SyntaxSourceId,
  ref: KrDocument,
): Promise<KrDocument | null> {
  const r = bookAndRange(ref.title);
  if (!r) return null;
  const pick = (docs: KrDocument[]) => {
    const sel = docs.filter((d) => overlaps(d.title, r.chap, r.v0, r.v1));
    return sel.length ? combinePassage(sel) : null;
  };

  if (source === 'opentext') {
    const book = OPENTEXT_BOOKS.find((b) => norm(b.name) === norm(r.book));
    return book ? pick(await loadOpenTextBook(book)) : null;
  }
  const book = GNT_BOOKS.find((b) => norm(b.name) === norm(r.book));
  return book ? pick(await loadGntBook(book)) : null;
}
