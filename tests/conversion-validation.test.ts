import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lowfatToDocuments, parseXml, sblgntDialect } from '@/io/lowfat';
import { maculaHebrewToDocuments } from '@/io/macula-hebrew';
import { openTextToDocuments } from '@/io/opentext';
import { combinePassage } from '@/io/passage';
import type { KrDocument } from '@/domain/schema';
import { validateConvertedDocument } from './helpers/validateConvertedDocument';
import {
  assertTreeMatchesWg,
  validateSourceConstituency,
} from './helpers/validateSourceConstituency';

/**
 * CONVERSION VALIDATION HARNESS (safety rails before converter changes):
 * every bundled fixture, from every source, must produce a structurally
 * sound syntax graph AND a verbatim source constituency tree. These checks
 * encode the recurring failure modes (dropped/duplicated/fake tokens,
 * dangling relations, passive+directObject, PP→apposition fall-through,
 * dropped or relabelled source nodes) as one reusable validator instead of
 * passage-by-passage assertions.
 */

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');

const NESTLE_FIXTURES = [
  'tests/fixtures-lowfat-mark-5-25-34.xml',
  'tests/fixtures-lowfat-mark-1-19-20.xml',
  'tests/fixtures-lowfat-col-1-9-16.xml',
  'tests/fixtures-lowfat-phil-1-1-2.xml',
];
const SBLGNT_FIXTURES = [
  'tests/fixtures-sblgnt-lowfat-mark-5-25-34.xml',
  'tests/fixtures-sblgnt-lowfat-mark-1-19-20.xml',
  'tests/fixtures-sblgnt-lowfat-col-1-16.xml',
];

const nestle = (f: string) =>
  lowfatToDocuments(read(f), { book: 'Fixture', sourceId: 'macula-greek-nestle1904-lowfat' });
const sblgnt = (f: string) =>
  lowfatToDocuments(read(f), {
    book: 'Fixture',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });

const expectValid = (doc: KrDocument, label: string) => {
  const { errors } = validateConvertedDocument(doc);
  expect(errors, `${label} syntax graph: ${errors.join('; ')}`).toEqual([]);
  const sc = validateSourceConstituency(doc);
  expect(sc.errors, `${label} source constituency: ${sc.errors.join('; ')}`).toEqual([]);
};

describe('conversion validator — Nestle1904 Lowfat fixtures', () => {
  for (const f of NESTLE_FIXTURES) {
    it(`${f}: every sentence converts to a valid graph + verbatim source tree`, () => {
      const docs = nestle(f);
      expect(docs.length).toBeGreaterThan(0);
      const sentences = Array.from(parseXml(read(f)).querySelectorAll('sentence'));
      docs.forEach((doc, i) => {
        expectValid(doc, `${f}[${i}]`);
        // Verbatim capture: the tree mirrors the source XML node-for-node,
        // in source child order, with class/role/rule/head/articular intact.
        const topWg = sentences[i]!.querySelector('wg')!;
        const mismatches = assertTreeMatchesWg(doc.sourceConstituency!.root, topWg);
        expect(mismatches, `${f}[${i}]: ${mismatches.join('; ')}`).toEqual([]);
      });
    });
  }
});

describe('conversion validator — SBLGNT Lowfat fixtures', () => {
  for (const f of SBLGNT_FIXTURES) {
    it(`${f}: every sentence converts to a valid graph + verbatim source tree`, () => {
      const docs = sblgnt(f);
      expect(docs.length).toBeGreaterThan(0);
      const sentences = Array.from(parseXml(read(f)).querySelectorAll('sentence'));
      docs.forEach((doc, i) => {
        expectValid(doc, `${f}[${i}]`);
        const topWg = sentences[i]!.querySelector('wg')!;
        const mismatches = assertTreeMatchesWg(doc.sourceConstituency!.root, topWg);
        expect(mismatches, `${f}[${i}]: ${mismatches.join('; ')}`).toEqual([]);
      });
    });
  }

  it('a combined passage still validates (prefixed ids, discourse root)', () => {
    const docs = sblgnt('tests/fixtures-sblgnt-lowfat-mark-5-25-34.xml').slice(0, 2);
    const passage = combinePassage(docs) as KrDocument;
    const { errors } = validateConvertedDocument(passage);
    expect(errors, errors.join('; ')).toEqual([]);
    // The combined source tree keeps every member leaf resolvable.
    const sc = validateSourceConstituency(passage);
    expect(sc.errors, sc.errors.join('; ')).toEqual([]);
  });
});

describe('conversion validator — Hebrew WLC Lowfat fixture', () => {
  it('Genesis 1:1 converts to a valid graph (no source tree captured — by design)', () => {
    const docs = maculaHebrewToDocuments(read('tests/fixtures-macula-hebrew-gen-1-1.xml'), {
      book: 'Genesis',
    });
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      const { errors } = validateConvertedDocument(doc);
      expect(errors, errors.join('; ')).toEqual([]);
      expect(doc.sourceConstituency).toBeUndefined();
    }
  });
});

describe('conversion validator — OpenText (bundled Philemon)', () => {
  it('every Philemon clause converts to a valid graph', () => {
    const docs = openTextToDocuments(
      read('public/opentext/philemon/base/philemon.xml'),
      read('public/opentext/philemon/wordgroup/philemon-wg-ch1.xml'),
      read('public/opentext/philemon/clause/philemon-cl-ch1.xml'),
      { book: 'Philemon' },
    );
    expect(docs.length).toBeGreaterThan(0);
    for (const [i, doc] of docs.entries()) {
      const { errors } = validateConvertedDocument(doc);
      expect(errors, `Philemon[${i}]: ${errors.join('; ')}`).toEqual([]);
    }
  });
});
