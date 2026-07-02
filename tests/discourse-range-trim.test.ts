import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import {
  buildDiscourseDocumentFromKrDocuments,
  buildDiscourseDocumentFromRange,
  discourseDocumentJson,
  discourseOutlineMarkdown,
  leafUnits,
  refInRange,
  type DiscourseDocument,
} from '@/domain/discourse';
import type { DiscourseGranularity } from '@/domain/schema';

/**
 * REGRESSION — verse-range trimming (Stage 1).
 *
 * The SBLGNT Lowfat Ephesians fixture has source sentences that span more than
 * one verse (sentence 0 = 5:3–4, sentence 5 = 5:8–10). Selecting a range that
 * STARTS and ENDS inside such a sentence must not leak the neighbouring verses:
 * an overlapping sentence contributes only its in-range words.
 */

const NOW = '2026-01-01T00:00:00.000Z';

function ephesiansDocs() {
  const xml = readFileSync('tests/fixtures-sblgnt-lowfat-eph-5-3-33.xml', 'utf8');
  return lowfatToDocuments(xml, {
    book: 'Ephesians',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });
}

const BUILD_OPTS = {
  sourceId: 'macula-greek-sblgnt-lowfat',
  editionId: 'sblgnt',
  book: 'Ephesians',
  now: NOW,
} as const;

function build(startRef: string, endRef: string, granularity?: DiscourseGranularity): DiscourseDocument {
  return buildDiscourseDocumentFromRange(ephesiansDocs(), {
    ...BUILD_OPTS,
    startRef,
    endRef,
    granularity,
  });
}

/** Every token's ref, resolved from its id. */
function unitTokenRefs(doc: DiscourseDocument): string[] {
  const refById = new Map(doc.tokens.map((t) => [t.id, t.ref]));
  return leafUnits(doc)
    .flatMap((u) => u.tokenIds)
    .map((id) => refById.get(id)!)
    .filter(Boolean);
}

describe('discourse range trimming — sentence granularity', () => {
  // 5:4–5:9 begins inside sentence 0 (5:3–4) and ends inside sentence 5
  // (5:8–10), crossing several whole sentences in between.
  const START = '5:4';
  const END = '5:9';

  it('drops out-of-range verses from tokens, units, and exports', () => {
    const doc = build(START, END);
    const full = buildDiscourseDocumentFromKrDocuments(ephesiansDocs(), { ...BUILD_OPTS });
    const outOfRange = full.tokens.filter((t) => !refInRange(t.ref, START, END));
    expect(outOfRange.length).toBeGreaterThan(0); // fixture really does overlap

    // doc.tokens — no out-of-range refs (5:3 and 5:10 in particular).
    for (const t of doc.tokens) expect(refInRange(t.ref, START, END)).toBe(true);
    expect(doc.tokens.some((t) => t.ref === '5:3')).toBe(false);
    expect(doc.tokens.some((t) => t.ref === '5:10')).toBe(false);

    // doc.units[].tokenIds — resolve every unit token back to its ref.
    for (const ref of unitTokenRefs(doc)) expect(refInRange(ref, START, END)).toBe(true);

    // rendered unit text (Markdown outline) is built from the retained unit
    // tokens; it must contain the heading refs but never a dropped ref
    // (5:3 / 5:10). (5:33 never appears in this range, so "5:3" is safe.)
    const md = discourseOutlineMarkdown(doc, { includeText: true });
    expect(md.includes('5:3')).toBe(false);
    expect(md.includes('5:10')).toBe(false);

    // exports (JSON) — none of the dropped token ids survive.
    const json = discourseDocumentJson(doc);
    for (const t of outOfRange) expect(json.includes(`"${t.id}"`)).toBe(false);
  });

  it('trims the boundary units and keeps document metadata consistent', () => {
    const doc = build(START, END);
    // The sentence that spanned 5:3–4 now starts at 5:4.
    const first = leafUnits(doc)[0]!;
    expect(first.id).toBe('du_sblgnt_ephesians_0'); // stable id preserved
    expect(first.refStart).toBe('5:4');
    // The sentence that spanned 5:8–10 now ends at 5:9.
    const last = leafUnits(doc).at(-1)!;
    expect(last.refEnd).toBe('5:9');
    // Document range / title reflect the retained span.
    expect(doc.range).toEqual({ book: 'Ephesians', startRef: '5:4', endRef: '5:9' });
    expect(doc.title).toBe('Ephesians 5:4–9');
    // sourceDocIds only names docs that still contribute tokens.
    const tokenDocIds = new Set(doc.tokens.map((t) => t.sourceDocId));
    for (const id of doc.sourceDocIds) expect(tokenDocIds.has(id)).toBe(true);
  });

  it('discards a sentence that trims to nothing', () => {
    // 5:5 is a whole sentence; selecting only it drops sentences 0 and 2+.
    const doc = build('5:5', '5:5');
    expect(leafUnits(doc).length).toBe(1);
    expect(doc.sourceDocIds).toEqual(['sblgnt_ephesians_1']);
    for (const t of doc.tokens) expect(t.ref).toBe('5:5');
  });

  it('markers and suggestions reference only retained tokens', () => {
    const doc = build(START, END);
    const tokenIds = new Set(doc.tokens.map((t) => t.id));
    for (const m of doc.markers) expect(tokenIds.has(m.tokenId)).toBe(true);
    for (const s of doc.suggestions) {
      for (const tid of s.tokenIds ?? []) expect(tokenIds.has(tid)).toBe(true);
    }
  });
});

describe('discourse range trimming — verse granularity', () => {
  const START = '5:4';
  const END = '5:9';

  it('produces one unit per in-range verse only', () => {
    const doc = build(START, END, 'verse');
    const leaves = leafUnits(doc);
    // Exactly verses 5:4, 5:5, 5:6, 5:7, 5:8, 5:9.
    expect(leaves.map((u) => u.refStart)).toEqual(['5:4', '5:5', '5:6', '5:7', '5:8', '5:9']);
    for (const u of leaves) expect(u.refStart).toBe(u.refEnd);
    for (const ref of unitTokenRefs(doc)) expect(refInRange(ref, START, END)).toBe(true);
    expect(doc.tokens.some((t) => t.ref === '5:3')).toBe(false);
    expect(doc.tokens.some((t) => t.ref === '5:10')).toBe(false);
  });
});
