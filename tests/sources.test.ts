import { describe, it, expect } from 'vitest';
import { sourceOfDoc, sourceLabel, SYNTAX_SOURCES } from '@/io/sources';
import type { KrDocument } from '@/domain/schema';

/** A minimal doc carrying only the fields the source helpers read. */
const doc = (id: string): KrDocument =>
  ({ id, title: 'Philemon 1:1', tokens: [], syntax: { rootId: 'r', nodes: [], relations: [] } } as unknown as KrDocument);

describe('syntax sources', () => {
  it('lists both GNT sources with labels', () => {
    expect(SYNTAX_SOURCES.map((s) => s.id)).toEqual(['nestle1904', 'opentext']);
    expect(sourceLabel('opentext')).toMatch(/OpenText/);
    expect(sourceLabel('nestle1904')).toMatch(/Nestle/);
  });

  it('infers the source a passage came from by its document id prefix', () => {
    expect(sourceOfDoc(doc('gnt_philemon_0'))).toBe('nestle1904');
    expect(sourceOfDoc(doc('opentext_philemon_1_0'))).toBe('opentext');
    // A combined passage (combinePassage) prefixes the first sentence id.
    expect(sourceOfDoc(doc('passage_opentext_philippians_1_0_3'))).toBe('opentext');
    expect(sourceOfDoc(doc('passage_gnt_romans_5_2'))).toBe('nestle1904');
    // Anything else (fixtures, OT, custom) defaults to the base Nestle1904.
    expect(sourceOfDoc(doc('doc_sample_fox'))).toBe('nestle1904');
  });
});
