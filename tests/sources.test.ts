import { describe, it, expect } from 'vitest';
import {
  sourceOfDoc,
  sourceIdForCorpus,
  sourceLabel,
  SYNTAX_SOURCES,
  ALL_SYNTAX_SOURCES,
} from '@/io/sources';
import type { KrDocument } from '@/domain/schema';

/** A minimal doc carrying only the fields the source helpers read. */
const doc = (id: string): KrDocument =>
  ({ id, title: 'Philemon 1:1', tokens: [], syntax: { rootId: 'r', nodes: [], relations: [] } } as unknown as KrDocument);

describe('syntax sources (edition-aware)', () => {
  it('lists the loadable GNT sources with explicit ids and labels', () => {
    expect(SYNTAX_SOURCES.map((s) => s.id)).toEqual([
      'macula-greek-sblgnt-lowfat',
      'macula-greek-nestle1904-lowfat',
      'opentext',
    ]);
    expect(sourceLabel('opentext')).toMatch(/OpenText/);
    expect(sourceLabel('macula-greek-nestle1904-lowfat')).toMatch(/Nestle/);
    expect(sourceLabel('macula-greek-sblgnt-lowfat')).toMatch(/SBLGNT/);
    expect(sourceLabel('macula-hebrew-wlc-lowfat')).toMatch(/WLC/);
  });

  it('registers SBLGNT as a loadable GNT edition and Hebrew as loadable', () => {
    const sblgnt = ALL_SYNTAX_SOURCES.find((s) => s.id === 'macula-greek-sblgnt-lowfat')!;
    expect(sblgnt.corpus).toBe('gnt');
    expect(sblgnt.edition).toBe('sblgnt');
    expect(sblgnt.available).toBe(true); // loader landed in plan phase 7
    expect(SYNTAX_SOURCES.some((s) => s.id === sblgnt.id)).toBe(true);
    const wlc = ALL_SYNTAX_SOURCES.find((s) => s.id === 'macula-hebrew-wlc-lowfat')!;
    expect(wlc.corpus).toBe('ot');
    expect(wlc.available).toBe(true);
  });

  it('infers the source a passage came from by its document id prefix', () => {
    expect(sourceOfDoc(doc('gnt_philemon_0'))).toBe('macula-greek-nestle1904-lowfat');
    expect(sourceOfDoc(doc('opentext_philemon_1_0'))).toBe('opentext');
    expect(sourceOfDoc(doc('sblgnt_mark_5_0'))).toBe('macula-greek-sblgnt-lowfat');
    // A combined passage (combinePassage) prefixes the first sentence id.
    expect(sourceOfDoc(doc('passage_opentext_philippians_1_0_3'))).toBe('opentext');
    expect(sourceOfDoc(doc('passage_gnt_romans_5_2'))).toBe('macula-greek-nestle1904-lowfat');
    // Anything else (fixtures, OT, custom) defaults to the base Nestle1904.
    expect(sourceOfDoc(doc('doc_sample_fox'))).toBe('macula-greek-nestle1904-lowfat');
  });

  it('stamps patch bases with an explicit edition-aware sourceId per corpus', () => {
    expect(sourceIdForCorpus(doc('gnt_philemon_0'), 'gnt')).toBe(
      'macula-greek-nestle1904-lowfat',
    );
    expect(sourceIdForCorpus(doc('opentext_philemon_1_0'), 'gnt')).toBe('opentext');
    expect(sourceIdForCorpus(doc('ot_gen_1_0'), 'ot')).toBe('macula-hebrew-wlc-lowfat');
    // A typed/custom sentence has no published source.
    expect(sourceIdForCorpus(doc('doc_custom_1'), 'custom')).toBeUndefined();
  });
});
