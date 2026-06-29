import { describe, it, expect } from 'vitest';
import { lowfatToDocuments } from '@/io/lowfat';
import { buildOutline, morphCodes, grammarTone, type OutlineNode } from '@/domain/model';

/**
 * Pure data behind the HTML diagram views (Phrase/Block outline + Morphology
 * grid). The components are thin; these pin the data they consume.
 */
const XML = `<book name="Test"><sentence><wg role="cl" class="cl" rule="S-V-O">
  <w class="noun" role="s" n="010010010010010" case="nominative" gender="masculine" number="singular">θεός</w>
  <w class="verb" role="v" n="010010010020010" tense="aorist" voice="active" mood="indicative" person="third" number="singular">ἠγάπησεν</w>
  <wg role="o" class="np" rule="DetNp">
    <w class="det" n="010010010030010" case="accusative" gender="masculine" number="singular">τὸν</w>
    <w class="noun" head="true" n="010010010040010" case="accusative" gender="masculine" number="singular">κόσμον</w>
  </wg>
</wg></sentence></book>`;
const doc = () => lowfatToDocuments(XML, { book: 'Test' })[0]!;

describe('phrase/block outline', () => {
  const find = (n: OutlineNode, pred: (x: OutlineNode) => boolean): OutlineNode | undefined =>
    pred(n) ? n : n.children.map((c) => find(c, pred)).find(Boolean);

  it('builds a labelled tree in Greek order with the verb under the clause', () => {
    const tree = buildOutline(doc())!;
    expect(tree).toBeTruthy();
    const verb = find(tree, (n) => n.text === 'ἠγάπησεν')!;
    expect(verb.label).toBe('verb');
    const subj = find(tree, (n) => n.text === 'θεός')!;
    expect(subj.label).toBe('subject');
    // The article nests UNDER its noun κόσμον (a deeper row).
    const obj = find(tree, (n) => n.text === 'κόσμον')!;
    expect(obj.children.some((c) => c.text === 'τὸν' && c.label === 'article')).toBe(true);
  });
});

describe('morphology forms', () => {
  it('splits a verb into individually-glossable codes (person & number apart)', () => {
    const v = doc().tokens.find((t) => t.surface === 'ἠγάπησεν')!;
    const codes = morphCodes(v).map((c) => c.text);
    expect(codes).toEqual(['aor', 'act', 'ind', '3', 'sg']);
    // Every code carries a glossary key so it can be tapped.
    expect(morphCodes(v).every((c) => c.glossKey)).toBe(true);
    expect(grammarTone(v)).toBe('verb');
  });

  it('gives case/number/gender for a noun and tints by case', () => {
    const n = doc().tokens.find((t) => t.surface === 'κόσμον')!;
    expect(morphCodes(n).map((c) => c.text)).toEqual(['acc', 'sg', 'm']);
    expect(grammarTone(n)).toBe('accusative');
    const s = doc().tokens.find((t) => t.surface === 'θεός')!;
    expect(grammarTone(s)).toBe('nominative');
  });
});
