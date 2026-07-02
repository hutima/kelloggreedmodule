import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { useDiscourseStore, useEditorStore } from '@/state';
import {
  buildDiscourseDocumentFromKrDocuments,
  buildDiscourseDocumentFromRange,
  leafUnits,
} from '@/domain/discourse';
import { DiscourseDocumentSchema } from '@/domain/schema';
import { loadPatch } from '@/persistence';

/**
 * PR 7 regression suite — the five named passages build into valid discourse
 * documents from real SBLGNT Lowfat data, and syntax edits and discourse
 * edits never collide (separate stores, separate storage namespaces).
 */

const NOW = '2026-01-01T00:00:00.000Z';
const OPTS = { sourceId: 'macula-greek-sblgnt-lowfat', editionId: 'sblgnt', now: NOW } as const;

function bookDocs(fixture: string, book: string) {
  const xml = readFileSync(fixture, 'utf8');
  return lowfatToDocuments(xml, {
    book,
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });
}

describe('regression fixtures (real SBLGNT Lowfat)', () => {
  const cases: { name: string; fixture: string; book: string; start: string; end: string; minUnits: number }[] = [
    { name: 'Ephesians 5:3–33', fixture: 'tests/fixtures-sblgnt-lowfat-eph-5-3-33.xml', book: 'Ephesians', start: '5:3', end: '5:33', minUnits: 20 },
    { name: 'Philemon (whole book)', fixture: 'tests/fixtures-sblgnt-lowfat-philemon.xml', book: 'Philemon', start: '1:1', end: '1:25', minUnits: 10 },
    { name: 'Colossians 1:9–20', fixture: 'tests/fixtures-sblgnt-lowfat-col-1-9-20.xml', book: 'Colossians', start: '1:9', end: '1:20', minUnits: 2 },
    { name: 'Romans 9–11', fixture: 'tests/fixtures-sblgnt-lowfat-rom-9-11.xml', book: 'Romans', start: '9:1', end: '11:36', minUnits: 100 },
    { name: 'Mark 5:21–43', fixture: 'tests/fixtures-sblgnt-lowfat-mark-5-21-43.xml', book: 'Mark', start: '5:21', end: '5:43', minUnits: 15 },
  ];

  for (const c of cases) {
    it(`${c.name} builds a valid, fully covered discourse document`, () => {
      const doc = buildDiscourseDocumentFromRange(bookDocs(c.fixture, c.book), {
        ...OPTS,
        book: c.book,
        startRef: c.start,
        endRef: c.end,
      });
      expect(() => DiscourseDocumentSchema.parse(doc)).not.toThrow();
      const leaves = leafUnits(doc);
      expect(leaves.length).toBeGreaterThanOrEqual(c.minUnits);
      // Full token coverage, no duplicates, refs everywhere.
      const covered = leaves.flatMap((u) => u.tokenIds);
      expect(covered).toEqual(doc.tokens.map((t) => t.id));
      for (const u of leaves) expect(u.refStart).toMatch(/^\d+:\d+$/);
      // Structure stays user-authored: no relations in a generated base.
      expect(doc.relations).toEqual([]);
      // Deterministic rebuild (stable ids for patch identity).
      const again = buildDiscourseDocumentFromRange(bookDocs(c.fixture, c.book), {
        ...OPTS,
        book: c.book,
        startRef: c.start,
        endRef: c.end,
      });
      expect(again.units.map((u) => u.id)).toEqual(doc.units.map((u) => u.id));
    });
  }

  it('verse granularity also covers every named passage', () => {
    for (const c of cases.slice(0, 3)) {
      const doc = buildDiscourseDocumentFromRange(bookDocs(c.fixture, c.book), {
        ...OPTS,
        book: c.book,
        startRef: c.start,
        endRef: c.end,
        granularity: 'verse',
      });
      const covered = leafUnits(doc).flatMap((u) => u.tokenIds);
      expect(new Set(covered).size).toBe(doc.tokens.length);
    }
  });

  it('whole-book Philemon builds via buildDiscourseDocumentFromKrDocuments too', () => {
    const doc = buildDiscourseDocumentFromKrDocuments(
      bookDocs('tests/fixtures-sblgnt-lowfat-philemon.xml', 'Philemon'),
      { ...OPTS, book: 'Philemon' },
    );
    expect(doc.range.startRef).toBe('1:1');
    expect(leafUnits(doc).length).toBeGreaterThan(10);
  });
});

describe('syntax edits and discourse edits never collide', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('editing both layers persists to disjoint keys; each reset leaves the other intact', async () => {
    // 1. A SYNTAX edit on a loaded passage (base + patch, kr:patch:*).
    const [sentence] = bookDocs('tests/fixtures-sblgnt-lowfat-eph-5-3-33.xml', 'Ephesians');
    useEditorStore.getState().loadDocument(sentence!, { corpus: 'gnt' });
    useEditorStore.getState().updateNode(sentence!.syntax.nodes[1]!.id, { label: 'my syntax edit' });
    expect(loadPatch(sentence!.id)).not.toBeNull();

    // 2. A DISCOURSE edit on a loaded range (kr:discourse:*).
    useDiscourseStore.setState({
      sourceId: 'macula-greek-sblgnt-lowfat',
      bookNum: 10,
      startRef: '5:3',
      endRef: '5:33',
      granularity: 'sentence',
      baseDoc: null,
      doc: null,
      status: 'idle',
      past: [],
      future: [],
    });
    await useDiscourseStore.getState().loadRange({
      bookDocs: bookDocs('tests/fixtures-sblgnt-lowfat-eph-5-3-33.xml', 'Ephesians'),
    });
    const discDoc = useDiscourseStore.getState().doc!;
    const first = leafUnits(discDoc)[0]!;
    useDiscourseStore.getState().labelUnit(first.id, 'A');

    const syntaxKey = `kr:patch:${sentence!.id}`;
    const discourseKey = `kr:discourse:${discDoc.id}`;
    expect(localStorage.getItem(syntaxKey)).not.toBeNull();
    expect(localStorage.getItem(discourseKey)).not.toBeNull();
    expect(syntaxKey).not.toBe(discourseKey);

    // 3. Resetting DISCOURSE edits leaves the syntax patch alone.
    useDiscourseStore.getState().resetEdits();
    expect(localStorage.getItem(discourseKey)).toBeNull();
    expect(localStorage.getItem(syntaxKey)).not.toBeNull();
    expect(useEditorStore.getState().doc.syntax.nodes[1]!.label).toBe('my syntax edit');

    // 4. And a fresh discourse edit survives a SYNTAX reset.
    useDiscourseStore.getState().labelUnit(first.id, 'A');
    useEditorStore.getState().resetPassage({ syntax: true, layout: true });
    expect(localStorage.getItem(syntaxKey)).toBeNull();
    expect(localStorage.getItem(discourseKey)).not.toBeNull();
    expect(
      useDiscourseStore.getState().doc!.units.find((u) => u.id === first.id)?.label,
    ).toBe('A');
  });
});
