/**
 * Canonical verse references for the discourse layer.
 *
 * The canonical form is `"chapter:verse"` (`"5:3"`) within one book. Source
 * data spells token references three ways:
 *   - SBLGNT Lowfat  `ref`     — `"EPH 1:1!1"` (book code, space, c:v, !word)
 *   - Nestle1904     `osisId`  — `"Phil.1.1!1"` (book.c.v!word)
 *   - OpenText       `extra.ref` — `"Phlm.1.1"` (book.c.v)
 * `normalizeTokenRef` maps all of them to the canonical form.
 */

export interface ParsedRef {
  chapter: number;
  verse: number;
}

/** Parse a canonical `"c:v"` ref. Returns null for anything else. */
export function parseRef(ref: string): ParsedRef | null {
  const m = /^(\d+):(\d+)$/.exec(ref.trim());
  return m ? { chapter: Number(m[1]), verse: Number(m[2]) } : null;
}

/** Compare two canonical refs (negative = a before b). Unparseable sorts first. */
export function compareRefs(a: string, b: string): number {
  const pa = parseRef(a);
  const pb = parseRef(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  return pa.chapter - pb.chapter || pa.verse - pb.verse;
}

/** Canonical `"c:v"` from any source token-ref spelling, or '' if unknown. */
export function normalizeTokenRef(raw: string | undefined): string {
  if (!raw) return '';
  // SBLGNT: "EPH 1:1!1"
  let m = /(\d+):(\d+)(?:!\d+)?\s*$/.exec(raw);
  if (m) return `${Number(m[1])}:${Number(m[2])}`;
  // osisId / OpenText: "Phil.1.1!1" / "Phlm.1.1"
  m = /\.(\d+)\.(\d+)(?:!\d+)?\s*$/.exec(raw);
  if (m) return `${Number(m[1])}:${Number(m[2])}`;
  return '';
}

/**
 * The verse RANGE a sentence-document title carries: `"Ephesians 5:3–5"` →
 * `{ start: "5:3", end: "5:5" }`. A cross-chapter range ("4:32–5:2") is also
 * handled. Null when the title has no reference (typed/custom sentences).
 */
export function rangeOfTitle(title: string): { start: string; end: string } | null {
  const m = /(\d+):(\d+)(?:[–-](?:(\d+):)?(\d+))?\s*$/.exec(title);
  if (!m) return null;
  const start = `${Number(m[1])}:${Number(m[2])}`;
  if (!m[4]) return { start, end: start };
  const endChapter = m[3] ? Number(m[3]) : Number(m[1]);
  return { start, end: `${endChapter}:${Number(m[4])}` };
}

/** Whether `ref` falls inside [start, end] (all canonical `"c:v"`). */
export function refInRange(ref: string, start: string, end: string): boolean {
  return compareRefs(ref, start) >= 0 && compareRefs(ref, end) <= 0;
}

/** Whether the ranges [aStart,aEnd] and [bStart,bEnd] overlap. */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return compareRefs(aStart, bEnd) <= 0 && compareRefs(aEnd, bStart) >= 0;
}

/** Human range label: "5:3–33", "5:3", or "4:32–5:2". */
export function formatRange(start: string, end: string): string {
  if (!start) return '';
  if (!end || start === end) return start;
  const ps = parseRef(start);
  const pe = parseRef(end);
  if (ps && pe && ps.chapter === pe.chapter) return `${start}–${pe.verse}`;
  return `${start}–${end}`;
}

/** Filesystem/key-safe spelling of a ref ("5:3" → "5.3"). */
export function refSlug(ref: string): string {
  return ref.replace(/:/g, '.');
}
