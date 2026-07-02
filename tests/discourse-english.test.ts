import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  addDiscourseRelation,
  buildDiscourseDocumentFromEnglishBibleRange,
  deleteDiscourseUnit,
  discourseOutlineMarkdown,
  indentDiscourseUnit,
  labelDiscourseUnit,
  leafUnits,
  refInRange,
  splitDiscourseUnit,
  type EnglishBibleBook,
  type EnglishBibleVerse,
} from '@/domain/discourse';
import { DiscourseDocumentSchema } from '@/domain/schema';
import {
  ALL_SYNTAX_SOURCES,
  SYNTAX_SOURCES,
  DISCOURSE_SOURCES,
  ENGLISH_BIBLE_SOURCES,
  isEnglishBibleSource,
  bsbNtToEnglishBook,
  bsbOtToEnglishBook,
} from '@/io';
import type { ParallelBook, OtParallelBook } from '@/io/parallel';

/**
 * Stages 3–5 acceptance — English Bible sources in Discourse mode.
 *
 * Discourse mode can load an English Bible directly (no Greek/Hebrew syntax
 * parse). BSB is data-backed (NT: Greek-tagged with Strong's; OT: Hebrew
 * aligned). Every discourse operation works over English tokens. English
 * sources appear ONLY in Discourse mode, never in the syntax source lists.
 */

const NOW = '2026-01-01T00:00:00.000Z';

/** A tiny synthetic English book (no external data). */
function syntheticBook(): EnglishBibleBook {
  const verse = (ref: string, words: string[]): EnglishBibleVerse => ({
    ref,
    text: words.join(' '),
    words: words.map((surface, index) => ({
      id: `english-bsb_test_${ref.replace(':', '.')}_${index}`,
      surface,
      ref,
      index,
    })),
  });
  return {
    sourceId: 'english-bsb',
    version: 'bsb',
    corpus: 'nt',
    book: 'Test',
    bookNum: 1,
    verses: {
      '1:1': verse('1:1', ['In', 'the', 'beginning', 'was', 'the', 'Word', '.']),
      '1:2': verse('1:2', ['He', 'was', 'with', 'God', '.']),
      '1:3': verse('1:3', ['All', 'things', 'were', 'made', 'through', 'Him', '.']),
      '1:4': verse('1:4', ['In', 'Him', 'was', 'life', '.']),
    },
  };
}

describe('English Bible discourse builder (pure)', () => {
  it('builds an en-language document trimmed to the range', () => {
    const doc = buildDiscourseDocumentFromEnglishBibleRange(syntheticBook(), {
      startRef: '1:2',
      endRef: '1:3',
      granularity: 'verse',
      now: NOW,
    });
    expect(() => DiscourseDocumentSchema.parse(doc)).not.toThrow();
    expect(doc.language).toBe('en');
    expect(doc.range).toEqual({ book: 'Test', startRef: '1:2', endRef: '1:3' });
    // Only the selected verses — no 1:1 or 1:4.
    for (const t of doc.tokens) expect(refInRange(t.ref, '1:2', '1:3')).toBe(true);
    expect(doc.tokens.some((t) => t.ref === '1:1')).toBe(false);
    expect(doc.tokens.some((t) => t.ref === '1:4')).toBe(false);
    // Verse granularity → one unit per in-range verse.
    expect(leafUnits(doc).map((u) => u.refStart)).toEqual(['1:2', '1:3']);
  });

  it('cuts sentence units at English sentence boundaries', () => {
    const doc = buildDiscourseDocumentFromEnglishBibleRange(syntheticBook(), {
      startRef: '1:1',
      endRef: '1:4',
      granularity: 'sentence',
      now: NOW,
    });
    // Four sentences, each ending in a period.
    expect(leafUnits(doc).length).toBe(4);
  });

  it('supports split / label / indent / relate / delete / export over English', () => {
    let doc = buildDiscourseDocumentFromEnglishBibleRange(syntheticBook(), {
      startRef: '1:1',
      endRef: '1:4',
      granularity: 'verse',
      now: NOW,
    });
    const first = leafUnits(doc)[0]!;
    // split at an English word boundary
    const at = first.tokenIds[3]!;
    doc = splitDiscourseUnit(doc, first.id, at, NOW);
    expect(leafUnits(doc).length).toBe(5);
    // label + indent
    doc = labelDiscourseUnit(doc, first.id, 'A', NOW);
    expect(doc.units.find((u) => u.id === first.id)?.label).toBe('A');
    const second = leafUnits(doc)[1]!;
    doc = indentDiscourseUnit(doc, second.id, NOW);
    expect(doc.units.find((u) => u.id === second.id)?.depth).toBe(1);
    // relate
    const [a, b] = leafUnits(doc);
    doc = addDiscourseRelation(doc, { id: 'dr_x', sourceUnitId: b!.id, targetUnitId: a!.id, type: 'ground' }, NOW);
    expect(doc.relations.length).toBe(1);
    // export
    const md = discourseOutlineMarkdown(doc, { includeText: true });
    expect(md).toContain('# Test');
    // delete
    const before = leafUnits(doc).length;
    doc = deleteDiscourseUnit(doc, leafUnits(doc).at(-1)!.id, NOW);
    expect(leafUnits(doc).length).toBe(before - 1);
  });
});

describe('BSB English NT (real data, Greek-tagged)', () => {
  const pb = (): ParallelBook =>
    JSON.parse(readFileSync('public/parallel/bsb/10-ephesians.json', 'utf8'));

  it('carries Strong’s tags on aligned words and trims to the range', () => {
    const book = bsbNtToEnglishBook('english-bsb', { name: 'Ephesians', num: 10 }, pb());
    const doc = buildDiscourseDocumentFromEnglishBibleRange(book, {
      startRef: '1:3',
      endRef: '1:4',
      granularity: 'verse',
      now: NOW,
    });
    expect(doc.language).toBe('en');
    // range trimming — no 1:2 or 1:5.
    for (const t of doc.tokens) expect(refInRange(t.ref, '1:3', '1:4')).toBe(true);
    expect(doc.tokens.some((t) => t.ref === '1:2')).toBe(false);
    expect(doc.tokens.some((t) => t.ref === '1:5')).toBe(false);
    // "God" in 1:3 aligns to Strong's 2316.
    const god = doc.tokens.find((t) => t.ref === '1:3' && t.surface === 'God');
    expect(god?.strong).toBe('2316');
    expect(god?.alignmentMethod).toBe('greek');
    // Some words are unaligned (function words) — honestly 'none', no strong.
    const none = doc.tokens.find((t) => t.alignmentMethod === 'none');
    expect(none).toBeTruthy();
    expect(none?.strong).toBeUndefined();
  });
});

describe('BSB English OT (real data, Hebrew-aligned, no Strong’s)', () => {
  const pb = (): OtParallelBook =>
    JSON.parse(readFileSync('public/parallel/bsb/ot/01-genesis.json', 'utf8'));

  it('loads plain English with Hebrew alignment ids and no fabricated Strong’s', () => {
    const book = bsbOtToEnglishBook('english-bsb-ot', { name: 'Genesis', num: 1 }, pb());
    expect(book.corpus).toBe('ot');
    const doc = buildDiscourseDocumentFromEnglishBibleRange(book, {
      startRef: '1:1',
      endRef: '1:2',
      granularity: 'verse',
      now: NOW,
    });
    expect(doc.language).toBe('en');
    expect(leafUnits(doc).map((u) => u.refStart)).toEqual(['1:1', '1:2']);
    // No Strong's anywhere (the Hebrew alignment carries none).
    expect(doc.tokens.every((t) => t.strong === undefined)).toBe(true);
    // Aligned words carry the hebrew method; the document still builds whole.
    expect(doc.tokens.some((t) => t.alignmentMethod === 'hebrew')).toBe(true);
  });
});

describe('English Bible source visibility', () => {
  it('appears in the Discourse source list only, never in syntax source lists', () => {
    const discIds = DISCOURSE_SOURCES.map((s) => s.id);
    for (const s of ENGLISH_BIBLE_SOURCES) {
      expect(discIds).toContain(s.id);
      expect(isEnglishBibleSource(s.id)).toBe(true);
      // Never in the syntax selectors.
      expect(SYNTAX_SOURCES.some((x) => x.id === (s.id as unknown))).toBe(false);
      expect(ALL_SYNTAX_SOURCES.some((x) => x.id === (s.id as unknown))).toBe(false);
    }
    // KJV / ASV ARE offered now — as remote, English-only Discourse sources —
    // but still ONLY in Discourse mode, never in the syntax selectors.
    expect(discIds).toContain('english-kjv');
    expect(discIds).toContain('english-asv');
    expect(SYNTAX_SOURCES.some((x) => (x.id as unknown) === 'english-kjv')).toBe(false);
    expect(ALL_SYNTAX_SOURCES.some((x) => (x.id as unknown) === 'english-asv')).toBe(false);
  });
});
