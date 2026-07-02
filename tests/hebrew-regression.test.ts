import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { maculaHebrewToDocuments } from '@/io/macula-hebrew';
import { parseXml } from '@/io/lowfat';
import { layoutForMode } from '@/domain/layout';
import type { KrDocument } from '@/domain/schema';
import { validateConvertedDocument } from './helpers/validateConvertedDocument';
import {
  assertTreeMatchesWg,
  validateSourceConstituency,
} from './helpers/validateSourceConstituency';

/**
 * Hebrew WLC regression protection (Stage 9): the three canonical protection
 * passages — Genesis 1:1–3, Psalm 1:1–2, Deuteronomy 6:4 — run through the
 * shared conversion validator, and Hebrew now preserves the source `<wg>`
 * hierarchy through the SAME `captureSourceConstituency` mechanism as the
 * Greek editions (macula-hebrew has the identical head-marked Lowfat shape,
 * including explicit `head="true"` on word groups). No Hebrew-specific
 * conversion logic changed — capture is purely additive.
 */

const FIXTURES = [
  ['tests/fixtures-macula-hebrew-gen-1-1-3.xml', 'Genesis'],
  ['tests/fixtures-macula-hebrew-psa-1-1-2.xml', 'Psalms'],
  ['tests/fixtures-macula-hebrew-deu-6-4.xml', 'Deuteronomy'],
] as const;

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');
const load = (f: string, book: string): KrDocument[] =>
  maculaHebrewToDocuments(read(f), { book, sourceId: 'macula-hebrew-wlc-lowfat' });

describe('Hebrew WLC conversion validates on the protection passages', () => {
  for (const [file, book] of FIXTURES) {
    it(`${book}: every sentence converts to a valid graph + verbatim source tree`, () => {
      const docs = load(file, book);
      expect(docs.length).toBeGreaterThan(0);
      const sentences = Array.from(parseXml(read(file)).querySelectorAll('sentence'));
      docs.forEach((doc, i) => {
        const { errors } = validateConvertedDocument(doc);
        expect(errors, `${book}[${i}]: ${errors.join('; ')}`).toEqual([]);
        const sc = validateSourceConstituency(doc);
        expect(sc.errors, `${book}[${i}]: ${sc.errors.join('; ')}`).toEqual([]);
        // Verbatim capture, source child order included.
        const topWg = sentences[i]!.querySelector('wg')!;
        const mismatches = assertTreeMatchesWg(doc.sourceConstituency!.root, topWg);
        expect(mismatches, `${book}[${i}]: ${mismatches.join('; ')}`).toEqual([]);
      });
    });
  }
});

describe('Hebrew source constituency is source-backed and honestly labeled', () => {
  it('Gen 1:1 drives the Constituency Tree from the source tree with a WLC caption', () => {
    const doc = load('tests/fixtures-macula-hebrew-gen-1-1-3.xml', 'Genesis')[0]!;
    const texts = layoutForMode('constituency', doc, {}, {})
      .elements.filter((e): e is Extract<typeof e, { kind: 'text' }> => e.kind === 'text')
      .map((e) => e.text);
    expect(texts.some((x) => x.includes('Source constituency: WLC Lowfat'))).toBe(true);
  });

  it('remains optional: without sourceId the layer is absent and mode reconstructs', () => {
    const doc = maculaHebrewToDocuments(read('tests/fixtures-macula-hebrew-gen-1-1-3.xml'), {
      book: 'Genesis',
    })[0]!;
    expect(doc.sourceConstituency).toBeUndefined();
    const texts = layoutForMode('constituency', doc, {}, {})
      .elements.filter((e): e is Extract<typeof e, { kind: 'text' }> => e.kind === 'text')
      .map((e) => e.text);
    expect(texts.some((x) => x.includes('Reconstructed from the app syntax graph'))).toBe(true);
  });
});

describe('Greek-specific interpretive logic cannot misfire on Hebrew', () => {
  it('produces no passive-accusative downgrades or articular-PP rewrites (no case/det in Hebrew)', () => {
    for (const [file, book] of FIXTURES) {
      for (const doc of load(file, book)) {
        // The two interpretive Lowfat paths stamp `converted`; Hebrew (no
        // `case` attribute, article class `art` not `det`) must never take
        // them — every Hebrew relation stays source-given.
        for (const r of doc.syntax.relations) {
          expect(r.provenance?.source, `${doc.title} ${r.id} (${r.type})`).toBe('given');
          expect(r.type).not.toBe('accusativeModifier');
          expect(r.type).not.toBe('substantivalPrepositionalPhrase');
        }
      }
    }
  });
});
