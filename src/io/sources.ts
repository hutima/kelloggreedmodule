import type { KrDocument } from '@/domain/schema';
import { GNT_BOOKS, loadGntBook } from './gnt';
import { SBLGNT_BOOKS, loadSblgntBook } from './gnt-sblgnt';
import { OPENTEXT_BOOKS, loadOpenTextBook } from './opentext-source';
import { combinePassage } from './passage';

/**
 * Syntax SOURCES — the published analyses a passage can be read from. Each
 * yields ordinary `KrDocument`s, so any of them can be the editable base or a
 * side-by-side comparison pane.
 *
 * Ids are deliberately EXPLICIT (edition-aware), never a vague `greek` or
 * `default`: they distinguish the corpus (Greek NT / Hebrew Bible), the TEXT
 * EDITION (SBLGNT / Nestle1904 / WLC), and the SYNTAX FAMILY (macula Lowfat /
 * OpenText). They also serve as the `sourceId` stamped on patch bases, so a
 * user patch can never silently cross editions (see
 * docs/sblgnt-kellogg-reed-plan.md).
 */
export type SyntaxSourceId =
  | 'macula-greek-sblgnt-lowfat' // incoming primary Greek edition (loader lands in plan phase 7)
  | 'macula-greek-nestle1904-lowfat' // legacy/alternate Greek edition
  | 'opentext' // secondary/alternate Greek syntax analysis
  | 'macula-hebrew-wlc-lowfat'; // Hebrew Bible (unchanged by the Greek rebase)

export interface SyntaxSourceInfo {
  id: SyntaxSourceId;
  /** User-facing label — the active source is always visibly named. */
  label: string;
  corpus: 'gnt' | 'ot';
  /** The text edition underlying the analysis. OpenText's own annotation is
   *  lemma-only; its displayed surface is aligned from Nestle 1904. */
  edition: 'sblgnt' | 'nestle1904' | 'wlc';
  /** Whether the app can load this source today (SBLGNT joins in phase 7). */
  available: boolean;
}

export const ALL_SYNTAX_SOURCES: SyntaxSourceInfo[] = [
  {
    id: 'macula-greek-sblgnt-lowfat',
    label: 'SBLGNT Lowfat',
    corpus: 'gnt',
    edition: 'sblgnt',
    available: true,
  },
  {
    id: 'macula-greek-nestle1904-lowfat',
    label: 'Nestle 1904 Lowfat',
    corpus: 'gnt',
    edition: 'nestle1904',
    available: true,
  },
  { id: 'opentext', label: 'OpenText syntax', corpus: 'gnt', edition: 'nestle1904', available: true },
  {
    id: 'macula-hebrew-wlc-lowfat',
    label: 'WLC Lowfat',
    corpus: 'ot',
    edition: 'wlc',
    available: true,
  },
];

/** The GNT sources selectable in the UI (loadable today). */
export const SYNTAX_SOURCES: { id: SyntaxSourceId; label: string }[] = ALL_SYNTAX_SOURCES.filter(
  (s) => s.corpus === 'gnt' && s.available,
).map(({ id, label }) => ({ id, label }));

export function sourceLabel(id: SyntaxSourceId): string {
  return ALL_SYNTAX_SOURCES.find((s) => s.id === id)?.label ?? id;
}

/** Which source a loaded passage came from, inferred from its document id.
 *  Handles both a single sentence (`opentext_…`) and a combined passage
 *  (`combinePassage` prefixes the first sentence's id with `passage_`). */
export function sourceOfDoc(doc: KrDocument): SyntaxSourceId {
  const id = doc.id.replace(/^passage_/, '');
  if (id.startsWith('opentext_')) return 'opentext';
  if (id.startsWith('sblgnt_')) return 'macula-greek-sblgnt-lowfat';
  return 'macula-greek-nestle1904-lowfat';
}

/** The `sourceId` a patch base should carry for a document of this corpus —
 *  explicit and edition-aware, so saved edits never silently cross editions.
 *  Custom/typed documents have no published source, hence undefined. */
export function sourceIdForCorpus(
  doc: KrDocument,
  corpus: 'gnt' | 'ot' | 'custom',
): SyntaxSourceId | undefined {
  if (corpus === 'gnt') return sourceOfDoc(doc);
  if (corpus === 'ot') return 'macula-hebrew-wlc-lowfat';
  return undefined;
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
  if (source === 'macula-greek-nestle1904-lowfat') {
    const book = GNT_BOOKS.find((b) => norm(b.name) === norm(r.book));
    return book ? pick(await loadGntBook(book)) : null;
  }
  if (source === 'macula-greek-sblgnt-lowfat') {
    const book = SBLGNT_BOOKS.find((b) => norm(b.name) === norm(r.book));
    return book ? pick(await loadSblgntBook(book)) : null;
  }
  // Hebrew is not loadable through this GNT-compare path — say so honestly
  // instead of silently serving another edition.
  return null;
}
