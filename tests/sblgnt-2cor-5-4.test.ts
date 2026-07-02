import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import type { KrDocument, Relation } from '@/domain/schema';
import { validateConvertedDocument } from './helpers/validateConvertedDocument';
import { validateSourceConstituency } from './helpers/validateSourceConstituency';

/**
 * 2 Corinthians 5:4 (SBLGNT) — the contrastive infinitive construction
 * "ἐφ᾽ ᾧ οὐ θέλομεν ἐκδύσασθαι ἀλλ᾽ ἐπενδύσασθαι" (Stage 6). The source
 * writes the contrast as `<wg role="v" rule="notVPbutVP">` over
 * [οὐ ἐκδύσασθαι ἀλλ᾽ ἐπενδύσασθαι]. Historically this clause converted as
 * flat "adjunct soup" (four adjunct children, no head); after the Stage 5
 * head inference the infinitive heads, but the second infinitive still fell
 * through to APPOSITION because contrastive ("…but…") rules were treated as
 * coordination only for class="pp" groups. Required shape:
 *
 *   ἐκδύσασθαι —adverbial→ οὐ           (negation)
 *   ἐκδύσασθαι —coordinator→ ἀλλά       (the contrastive joiner)
 *   ἐκδύσασθαι —conjunct→ ἐπενδύσασθαι  (a real coordination member)
 *   θέλομεν —directObject→ [the infinitival clause]  (source role "o")
 */

const doc = (): KrDocument =>
  lowfatToDocuments(readFileSync('tests/fixtures-sblgnt-lowfat-2cor-5-4.xml', 'utf8'), {
    book: 'Fixture',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  })[0]!;

const nfc = (s: string) => s.normalize('NFC');
const nodeOfLemma = (d: KrDocument, lemma: string): string => {
  const tok = d.tokens.find((t) => t.lemma && nfc(t.lemma) === nfc(lemma));
  expect(tok, `token for ${lemma}`).toBeDefined();
  return d.syntax.nodes.find((n) => n.tokenIds.includes(tok!.id))!.id;
};
const rel = (d: KrDocument, headId: string, depId: string): Relation | undefined =>
  d.syntax.relations.find((r) => r.headId === headId && r.dependentId === depId);
const relsFrom = (d: KrDocument, headId: string): Relation[] =>
  d.syntax.relations.filter((r) => r.headId === headId);

describe('2 Cor 5:4 (SBLGNT) — contrastive infinitives are a real coordination, not adjunct soup', () => {
  it('converts to a structurally valid document', () => {
    const d = doc();
    expect(validateConvertedDocument(d).errors).toEqual([]);
    expect(validateSourceConstituency(d).errors).toEqual([]);
  });

  it('heads the construction on the infinitive ἐκδύσασθαι with negation, coordinator, and conjunct', () => {
    const d = doc();
    const ekdusasthai = nodeOfLemma(d, 'ἐκδύω');
    const ependusasthai = nodeOfLemma(d, 'ἐπενδύομαι');
    const ou = nodeOfLemma(d, 'οὐ');
    const alla = nodeOfLemma(d, 'ἀλλά');
    expect(rel(d, ekdusasthai, ou)?.type).toBe('adverbial');
    expect(rel(d, ekdusasthai, alla)?.type).toBe('coordinator');
    expect(rel(d, ekdusasthai, ependusasthai)?.type).toBe('conjunct');
    // Never apposition, never a bare adjunct — the historical failure modes.
    const types = relsFrom(d, ekdusasthai).map((r) => r.type);
    expect(types).not.toContain('apposition');
    expect(types).not.toContain('adjunct');
  });

  it('keeps the infinitival clause as the direct object of θέλομεν (source role "o")', () => {
    const d = doc();
    const thelomen = nodeOfLemma(d, 'θέλω');
    const objRel = relsFrom(d, thelomen).find((r) => r.type === 'directObject');
    expect(objRel).toBeDefined();
    // The object clause's predicate is the contrastive infinitive head.
    const pred = d.syntax.relations.find(
      (r) => r.headId === objRel!.dependentId && r.type === 'predicate',
    );
    expect(pred?.dependentId).toBe(nodeOfLemma(d, 'ἐκδύω'));
  });

  it('never leaves the main clause as flat adjunct soup', () => {
    const d = doc();
    // The root clause has a real predicate and its members carry typed roles;
    // at most incidental adjuncts, never ALL children adjunct.
    const root = d.syntax.rootId;
    const types = relsFrom(d, root).map((r) => r.type);
    expect(types).toContain('predicate');
    expect(types.filter((t) => t === 'adjunct')).toHaveLength(0);
  });

  it('subject of στενάζομεν is the substantival participial phrase, not the adverb καί', () => {
    const d = doc();
    const subj = d.syntax.relations.find((r) => r.type === 'subject')!;
    expect(subj).toBeDefined();
    const kai = d.tokens.find((t) => t.lemma && nfc(t.lemma) === 'καί' && t.pos === 'adverb');
    if (kai) {
      const kaiNode = d.syntax.nodes.find((n) => n.tokenIds.includes(kai.id))!;
      // The focusing καί ("even/also") must not head the subject.
      expect(subj.dependentId).not.toBe(kaiNode.id);
      expect(relsFrom(d, kaiNode.id)).toEqual([]);
    }
  });
});
