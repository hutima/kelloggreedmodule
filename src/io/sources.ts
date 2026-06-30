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

/** Book name + first verse from a passage title ("Philemon 1:1–2" → Philemon 1:1). */
function bookAndVerse(title: string): { book: string; chap: number; verse: number } | null {
  const m = title.match(/^(.*?)\s+(\d+):(\d+)/);
  return m ? { book: m[1]!.trim(), chap: Number(m[2]), verse: Number(m[3]) } : null;
}

/** Whether a sentence/passage title's verse span covers chapter:verse. */
function covers(title: string, chap: number, verse: number): boolean {
  const m = title.match(/(\d+):(\d+)(?:[–-](\d+))?\s*$/);
  if (!m) return false;
  const c = Number(m[1]);
  const v0 = Number(m[2]);
  const v1 = m[3] ? Number(m[3]) : v0;
  return c === chap && verse >= v0 && verse <= v1;
}

/**
 * Load `source`'s parse of the SAME passage a reference document shows, matched
 * by book + first verse. The matching sentence(s) are combined into one document
 * so the comparison pane lines up with the primary. Returns null when the source
 * has no matching passage (e.g. a book OpenText doesn't cover, or a verse split
 * differently). Whole-book loads are cached by the loaders / service worker.
 */
export async function loadSourcePassage(
  source: SyntaxSourceId,
  ref: KrDocument,
): Promise<KrDocument | null> {
  const bv = bookAndVerse(ref.title);
  if (!bv) return null;

  if (source === 'opentext') {
    const book = OPENTEXT_BOOKS.find((b) => norm(b.name) === norm(bv.book));
    if (!book) return null;
    const docs = await loadOpenTextBook(book);
    const sel = docs.filter((d) => covers(d.title, bv.chap, bv.verse));
    return sel.length ? combinePassage(sel) : null;
  }

  const book = GNT_BOOKS.find((b) => norm(b.name) === norm(bv.book));
  if (!book) return null;
  const docs = await loadGntBook(book);
  const sel = docs.filter((d) => covers(d.title, bv.chap, bv.verse));
  return sel.length ? combinePassage(sel) : null;
}
