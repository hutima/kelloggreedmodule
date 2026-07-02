import type {
  DiscourseDocument,
  DiscourseGranularity,
  DiscourseToken,
  DiscourseUnit,
  KrDocument,
  Provenance,
} from '@/domain/schema';
import { detectDiscourseMarkers } from './markers';
import { buildInitialSuggestions } from './suggest';
import {
  compareRefs,
  formatRange,
  normalizeTokenRef,
  parseRef,
  rangeOfTitle,
  rangesOverlap,
  refSlug,
} from './refs';

/**
 * DISCOURSE DOCUMENT BUILDER — turns an array of source sentence `KrDocument`s
 * into one `DiscourseDocument`, deterministically:
 *
 *   - same source docs + range + granularity  →  the same document, with the
 *     same ids, every time (unit/marker ids derive from the stable source
 *     sentence/token ids, so user patches survive reloads);
 *   - source syntax is READ, never written — only refs, token surfaces,
 *     lemmas, glosses, and part-of-speech cross the boundary;
 *   - everything generated is provenance-stamped as source-derived; nothing
 *     here creates a discourse RELATION (relations are user-authored, or
 *     accepted from an explicit suggestion).
 */

export interface BuildDiscourseOptions {
  /** Which syntax source the sentences came from (e.g. `macula-greek-sblgnt-lowfat`). */
  sourceId: string;
  editionId?: string;
  /** Book display name ("Ephesians"). */
  book: string;
  /** How to cut the initial units. Defaults to `sentence`. */
  granularity?: DiscourseGranularity;
  /** Clock injection for deterministic tests. */
  now?: string;
}

const GIVEN: Provenance = {
  source: 'given',
  confidence: 'high',
  reason: 'Generated from source sentence/verse boundaries.',
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Flatten a source doc's tokens into compact discourse tokens (reading order). */
function discourseTokensOf(doc: KrDocument): DiscourseToken[] {
  const fallback = rangeOfTitle(doc.title)?.start ?? '';
  let lastRef = fallback;
  return [...doc.tokens]
    .sort((a, b) => a.index - b.index)
    .map((t) => {
      const ref = normalizeTokenRef(t.morphology?.extra?.ref) || lastRef;
      lastRef = ref;
      return {
        id: t.id,
        surface: t.surface,
        lemma: t.lemma,
        pos: t.pos,
        mood: t.morphology?.mood,
        gloss: t.gloss,
        ref,
        sourceDocId: doc.id,
      };
    });
}

/** First/last refs among a unit's tokens (they are in reading order). */
function refSpan(tokens: DiscourseToken[]): { start: string; end: string } {
  const refs = tokens.map((t) => t.ref).filter(Boolean);
  if (!refs.length) return { start: '', end: '' };
  let start = refs[0]!;
  let end = refs[0]!;
  for (const r of refs) {
    if (compareRefs(r, start) < 0) start = r;
    if (compareRefs(r, end) > 0) end = r;
  }
  return { start, end };
}

/**
 * Cut the range's tokens into the initial LEAF units.
 *
 *   - `sentence` (default): one unit per source sentence document — ids derive
 *     from the sentence document id (`du_<docId>`), which is stable per source
 *     file.
 *   - `verse`: one unit per distinct verse ref — a verse split across two
 *     source sentences is merged into one unit (ids `du_v<c.v>`).
 *   - `paragraph` / `clauseCluster`: not derivable from the currently
 *     converted data (see docs/discourse-mode-plan.md) — they fall back to
 *     sentence units rather than fail.
 *
 * Depth/order/parents are assigned by the chapter-grouping step in the
 * builder; here every unit is emitted flat (depth 0, order = position).
 */
export function splitRangeIntoInitialUnits(
  docs: KrDocument[],
  tokensByDoc: Map<string, DiscourseToken[]>,
  granularity: DiscourseGranularity,
): DiscourseUnit[] {
  if (granularity === 'verse') {
    // Group tokens by verse across sentence boundaries, preserving order.
    const byRef = new Map<string, { tokens: DiscourseToken[]; docIds: string[] }>();
    const order: string[] = [];
    for (const doc of docs) {
      for (const t of tokensByDoc.get(doc.id) ?? []) {
        const key = t.ref || '?';
        let entry = byRef.get(key);
        if (!entry) {
          entry = { tokens: [], docIds: [] };
          byRef.set(key, entry);
          order.push(key);
        }
        entry.tokens.push(t);
        if (!entry.docIds.includes(doc.id)) entry.docIds.push(doc.id);
      }
    }
    return order.map((ref, i) => {
      const { tokens, docIds } = byRef.get(ref)!;
      return {
        id: `du_v${refSlug(ref)}`,
        kind: 'sentence' as const,
        refStart: ref === '?' ? '' : ref,
        refEnd: ref === '?' ? '' : ref,
        tokenIds: tokens.map((t) => t.id),
        sourceDocIds: docIds,
        order: i,
        depth: 0,
        provenance: GIVEN,
      };
    });
  }

  // sentence (and fallbacks): one unit per source sentence document.
  return docs.map((doc, i) => {
    const tokens = tokensByDoc.get(doc.id) ?? [];
    const span = refSpan(tokens);
    const titleRange = rangeOfTitle(doc.title);
    return {
      id: `du_${doc.id}`,
      kind: 'sentence' as const,
      refStart: span.start || titleRange?.start || '',
      refEnd: span.end || titleRange?.end || '',
      tokenIds: tokens.map((t) => t.id),
      sourceDocIds: [doc.id],
      order: i,
      depth: 0,
      provenance: GIVEN,
    };
  });
}

/**
 * Group leaf units under per-chapter container units when the range spans
 * more than one chapter (so a whole book opens as a navigable outline instead
 * of a hundreds-long flat list). Single-chapter ranges stay flat.
 */
function groupUnderChapters(leaves: DiscourseUnit[]): DiscourseUnit[] {
  const chapters: number[] = [];
  for (const u of leaves) {
    const c = parseRef(u.refStart)?.chapter;
    if (c != null && !chapters.includes(c)) chapters.push(c);
  }
  if (chapters.length <= 1) return leaves;

  const containers = new Map<number, DiscourseUnit>();
  const childCount = new Map<number, number>();
  const out: DiscourseUnit[] = [];
  let lastChapter: number | null = null;
  for (const leaf of leaves) {
    const c: number = parseRef(leaf.refStart)?.chapter ?? lastChapter ?? chapters[0]!;
    lastChapter = c;
    let container = containers.get(c);
    if (!container) {
      container = {
        id: `du_ch${c}`,
        kind: 'chapter',
        label: `Chapter ${c}`,
        refStart: leaf.refStart,
        refEnd: leaf.refEnd,
        tokenIds: [],
        sourceDocIds: [],
        order: containers.size,
        depth: 0,
        provenance: GIVEN,
      };
      containers.set(c, container);
      out.push(container);
    }
    const order = childCount.get(c) ?? 0;
    childCount.set(c, order + 1);
    out.push({ ...leaf, parentId: container.id, depth: 1, order });
    if (leaf.refEnd && compareRefs(leaf.refEnd, container.refEnd) > 0) {
      container.refEnd = leaf.refEnd;
    }
  }
  return out;
}

/**
 * Build a `DiscourseDocument` from source sentence documents (already
 * range-filtered, in reading order). Pure and deterministic — see the module
 * doc. This is the ONLY place a discourse base document is created.
 */
export function buildDiscourseDocumentFromKrDocuments(
  docs: KrDocument[],
  opts: BuildDiscourseOptions,
): DiscourseDocument {
  const granularity = opts.granularity ?? 'sentence';
  const now = opts.now ?? new Date().toISOString();
  const tokensByDoc = new Map(docs.map((d) => [d.id, discourseTokensOf(d)]));
  const tokens = docs.flatMap((d) => tokensByDoc.get(d.id)!);

  const leaves = splitRangeIntoInitialUnits(docs, tokensByDoc, granularity);
  const units = groupUnderChapters(leaves);

  const span = refSpan(tokens);
  const startRef = span.start || rangeOfTitle(docs[0]?.title ?? '')?.start || '';
  const endRef = span.end || rangeOfTitle(docs[docs.length - 1]?.title ?? '')?.end || '';

  const scopeByToken = new Map<string, string>();
  for (const u of units) for (const tid of u.tokenIds) scopeByToken.set(tid, u.id);
  const markers = detectDiscourseMarkers(tokens, (tid) => scopeByToken.get(tid));

  const language = docs[0]?.language ?? 'grc';
  const id = `disc_${slug(opts.sourceId)}_${slug(opts.book)}_${refSlug(startRef)}-${refSlug(endRef)}_${granularity}`;

  const doc: DiscourseDocument = {
    schemaVersion: 1,
    id,
    sourceDocIds: docs.map((d) => d.id),
    sourceId: opts.sourceId,
    editionId: opts.editionId,
    language,
    title: `${opts.book} ${formatRange(startRef, endRef)}`.trim(),
    range: { book: opts.book, startRef, endRef },
    granularity,
    text: docs.map((d) => d.text).join(' '),
    tokens,
    units,
    relations: [],
    markers,
    suggestions: [],
    layoutHints: {},
    provenance: {
      source: 'given',
      confidence: 'high',
      reason: `Generated from ${docs.length} source sentence document(s); discourse structure is user-authored.`,
    },
    createdAt: now,
    updatedAt: now,
  };
  return { ...doc, suggestions: buildInitialSuggestions(doc) };
}

/**
 * Filter a BOOK's sentence documents down to a verse range, then build. The
 * range is inclusive; a sentence overlapping either endpoint is included whole
 * (sentences are the smallest source unit — we never cut one off mid-load).
 */
export function buildDiscourseDocumentFromRange(
  bookDocs: KrDocument[],
  opts: BuildDiscourseOptions & { startRef: string; endRef: string },
): DiscourseDocument {
  const selected = bookDocs.filter((d) => {
    const r = rangeOfTitle(d.title);
    return r && rangesOverlap(r.start, r.end, opts.startRef, opts.endRef);
  });
  return buildDiscourseDocumentFromKrDocuments(selected, opts);
}

/**
 * Cheap structural fingerprint of a generated base (djb2, mirroring
 * `hashBase`), used to skip a stored patch authored against different source
 * data instead of misapplying it.
 */
export function hashDiscourseBase(doc: DiscourseDocument): string {
  const parts = [
    doc.tokens.map((t) => t.id).join('|'),
    doc.units.map((u) => u.id).join('|'),
    doc.sourceDocIds.join('|'),
  ].join('::');
  let h = 5381;
  for (let i = 0; i < parts.length; i++) h = ((h << 5) + h + parts.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
