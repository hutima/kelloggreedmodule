import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import type { KrDocument, Relation } from '@/domain/schema';
import { validateConvertedDocument } from './helpers/validateConvertedDocument';
import { validateSourceConstituency } from './helpers/validateSourceConstituency';

/**
 * SBLGNT head inference for NOMINAL phrases (Stage 5). SBLGNT Lowfat carries
 * no `head="true"`, so the converter infers heads; the old flat priority list
 * mis-headed two documented constructions (plan phase 14):
 *
 *   • Titus 2:13 — the adjective μεγάλου became head of "τοῦ μεγάλου θεοῦ
 *     καὶ σωτῆρος…" because the coordination "θεοῦ καὶ σωτῆρος…" is a
 *     CLASSLESS wrapper the class list did not recognize as nominal;
 *   • Col 1:15 — the genitive "πάσης κτίσεως" np outranked the nominative
 *     substantival adjective πρωτότοκος, reversing head and dependent.
 *
 * The scored inference resolves classless wrappers through their own head
 * constituent and demotes genitive candidates relative to non-genitive
 * case-bearing siblings. These tests pin both fixes with offline fixtures.
 */

const load = (file: string): KrDocument[] =>
  lowfatToDocuments(readFileSync(file, 'utf8'), {
    book: 'Fixture',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });

const nfc = (s: string) => s.normalize('NFC');

/** ALL word-node ids whose tokens carry this lemma (a long Greek sentence
 *  repeats common lemmas — θεός, πᾶς — so tests match over occurrences). */
function nodesOfLemma(doc: KrDocument, lemma: string): string[] {
  const ids = doc.tokens.filter((t) => t.lemma && nfc(t.lemma) === nfc(lemma)).map((t) => t.id);
  expect(ids.length, `tokens for lemma ${lemma}`).toBeGreaterThan(0);
  return doc.syntax.nodes.filter((n) => n.tokenIds.some((t) => ids.includes(t))).map((n) => n.id);
}

const relsFrom = (doc: KrDocument, headId: string): Relation[] =>
  doc.syntax.relations.filter((r) => r.headId === headId);
/** The relation joining any head-lemma occurrence to any dependent-lemma occurrence. */
const relBetweenLemmas = (doc: KrDocument, head: string, dep: string): Relation | undefined => {
  const heads = new Set(nodesOfLemma(doc, head));
  const deps = new Set(nodesOfLemma(doc, dep));
  return doc.syntax.relations.find((r) => heads.has(r.headId) && deps.has(r.dependentId));
};

describe('Titus 2:13 (SBLGNT) — θεοῦ heads "the great God and our Savior", not μεγάλου', () => {
  const doc = () => load('tests/fixtures-sblgnt-lowfat-titus-2-13.xml')[0]!;

  it('converts to a structurally valid document', () => {
    const d = doc();
    expect(validateConvertedDocument(d).errors).toEqual([]);
    expect(validateSourceConstituency(d).errors).toEqual([]);
  });

  it('makes θεοῦ the nominal head: μεγάλου is its adjectival modifier', () => {
    const d = doc();
    expect(relBetweenLemmas(d, 'θεός', 'μέγας')?.type).toBe('adjectival');
    // μεγάλου heads NOTHING — the old bug made it the phrase head with a
    // chain of appositions hanging off it.
    for (const megalou of nodesOfLemma(d, 'μέγας')) {
      expect(relsFrom(d, megalou)).toEqual([]);
    }
  });

  it('keeps the coordination and apposition on the noun: σωτῆρος conjunct, Ἰησοῦ apposition', () => {
    const d = doc();
    expect(relBetweenLemmas(d, 'θεός', 'σωτήρ')?.type).toBe('conjunct');
    expect(relBetweenLemmas(d, 'θεός', 'Ἰησοῦς')?.type).toBe('apposition');
    // The article agrees with (and hangs under) the head noun.
    const theou = relBetweenLemmas(d, 'θεός', 'μέγας')!.headId;
    expect(relsFrom(d, theou).some((r) => r.type === 'determiner')).toBe(true);
  });
});

describe('Col 1:15 (SBLGNT) — πρωτότοκος heads, κτίσεως is its genitive dependent', () => {
  const doc = () => load('tests/fixtures-sblgnt-lowfat-col-1-15.xml')[0]!;

  it('converts to a structurally valid document', () => {
    const d = doc();
    expect(validateConvertedDocument(d).errors).toEqual([]);
    expect(validateSourceConstituency(d).errors).toEqual([]);
  });

  it('attaches κτίσεως under πρωτότοκος as genitive (never the reverse)', () => {
    const d = doc();
    expect(relBetweenLemmas(d, 'πρωτότοκος', 'κτίσις')?.type).toBe('genitive');
    expect(relBetweenLemmas(d, 'κτίσις', 'πρωτότοκος')).toBeUndefined();
    // πάσης stays a modifier of κτίσεως.
    expect(relBetweenLemmas(d, 'κτίσις', 'πᾶς')?.type).toBe('adjectival');
  });

  it('keeps πρωτότοκος as the second member of the predicate apposition (εἰκών … πρωτότοκος)', () => {
    const d = doc();
    expect(relBetweenLemmas(d, 'εἰκών', 'πρωτότοκος')?.type).toBe('apposition');
  });
});

describe('head inference performance (Luke-genealogy class of nesting)', () => {
  it('converts a deeply nested classless chain in linear time, not exponential', () => {
    // Synthesize the shape that hung whole-book Luke conversion: a genealogy-
    // style chain of ~80 nested classless wrappers, each adding one genitive
    // article+noun pair. Without memoized head inference this is 2^80-ish and
    // never returns; with it, it converts in milliseconds.
    let inner = `<w class="noun" case="genitive" lemma="Ἀδάμ" n="900">Ἀδάμ</w>`;
    for (let i = 79; i >= 0; i--) {
      inner = `<wg rule="NpNp"><w class="det" case="genitive" n="${100 + i * 10}">τοῦ</w><w class="noun" case="genitive" lemma="x${i}" n="${101 + i * 10}">υἱοῦ</w>${inner}</wg>`;
    }
    const xml = `<?xml version="1.0"?><book lang="el" id="TST"><sentence><p><milestone unit="verse" id="TST 1:1">TST 1:1</milestone> x</p><wg class="cl" rule="V-S"><w class="verb" role="v" n="10">ἦν</w><wg class="np" role="s" rule="DetNP"><w class="det" case="nominative" n="20">ὁ</w>${inner}</wg></wg></sentence></book>`;
    const start = Date.now();
    const docs = lowfatToDocuments(xml, {
      book: 'Test',
      dialect: sblgntDialect,
      docIdPrefix: 'sblgnt',
      sourceId: 'macula-greek-sblgnt-lowfat',
    });
    const elapsed = Date.now() - start;
    expect(docs).toHaveLength(1);
    expect(docs[0]!.tokens.length).toBeGreaterThan(160);
    expect(elapsed, `conversion took ${elapsed}ms`).toBeLessThan(3000);
  });
});
