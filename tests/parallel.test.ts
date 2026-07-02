import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { combinePassage } from '@/io/passage';
import { alignParallel, type ParallelBook } from '@/io/parallel';

/**
 * Parallel English (BSB) text is linked to the Greek by LEXEME (Strong's number),
 * not by word position, so the link survives the small differences between our
 * Nestle1904 text and the alignment's SBLGNT base. This exercises the aligner
 * against the real preprocessed Philippians data checked into public/.
 */
const docs = () => lowfatToDocuments(readFileSync('tests/fixtures-lowfat-phil-1-1-2.xml', 'utf8'), { book: 'Philippians' });
const bsb = (): ParallelBook =>
  JSON.parse(readFileSync('public/parallel/bsb/11-philippians.json', 'utf8'));

describe('parallel English alignment', () => {
  it('carries the osisId ref and Strong number on each Greek token', () => {
    const [v1] = docs();
    const paul = v1!.tokens.find((t) => t.surface === 'Παῦλος')!;
    expect(paul.morphology?.extra?.ref).toBe('Phil.1.1!1');
    expect(paul.morphology?.extra?.strong).toBe('3972');
  });

  it('renders BSB verse prose for the passage', () => {
    const view = alignParallel(docs()[0]!, bsb());
    const v11 = view.verses.find((v) => v.key === '1.1')!;
    expect(v11.label).toBe('1:1');
    const prose = v11.words
      .map((w, i) => (w.joinLeft || i === 0 ? '' : ' ') + w.t)
      .join('');
    expect(prose).toContain('Paul and Timothy');
    expect(prose).toContain('servants of Christ Jesus');
  });

  it('links the Greek subject Παῦλος to the English word "Paul" both ways', () => {
    const doc = docs()[0]!;
    const view = alignParallel(doc, bsb());
    // node id for Παῦλος
    const paulTok = doc.tokens.find((t) => t.surface === 'Παῦλος')!;
    const paulNode = doc.syntax.nodes.find((n) => n.tokenIds.includes(paulTok.id))!.id;
    const enKeys = view.nodeToEn.get(paulNode) ?? [];
    expect(enKeys.length).toBeGreaterThan(0);
    // every linked English word resolves back to this node
    const v11 = view.verses.find((v) => v.key === '1.1')!;
    const words = enKeys.map((k) => v11.words[Number(k.split('#')[1])]!.t);
    expect(words).toContain('Paul');
    for (const k of enKeys) expect(view.enToNodes.get(k)).toContain(paulNode);
  });

  it('matches by lexeme even when a combined passage shifts token ids', () => {
    const passage = combinePassage(docs());
    const view = alignParallel(passage, bsb());
    // Both verses present and non-empty.
    expect(view.verses.map((v) => v.key).sort()).toEqual(['1.1', '1.2']);
    expect(view.nodeToEn.size).toBeGreaterThan(3);
  });

  it('records the alignment method per token (Nestle1904 → strongs, never direct)', () => {
    const view = alignParallel(docs()[0]!, bsb());
    expect(view.stats.direct).toBe(0); // positions are never trusted across editions
    expect(view.stats.strongs).toBeGreaterThan(0);
    for (const m of view.methodByToken.values()) {
      expect(['strongs', 'position', 'unmatched']).toContain(m);
    }
  });
});

describe('SBLGNT direct alignment', () => {
  const sblgntDocs = () =>
    lowfatToDocuments(readFileSync('tests/fixtures-sblgnt-lowfat-mark-5-25-34.xml', 'utf8'), {
      book: 'Mark',
      dialect: sblgntDialect,
      docIdPrefix: 'sblgnt',
    });
  const markBsb = (): ParallelBook =>
    JSON.parse(readFileSync('public/parallel/bsb/02-mark.json', 'utf8'));

  it('aligns an SBLGNT passage DIRECTLY by position (its own base text)', () => {
    const doc = sblgntDocs()[0]!; // Mark 5:25–27
    const view = alignParallel(doc, markBsb());
    expect(view.verses.map((v) => v.key)).toEqual(['5.25', '5.26', '5.27']);
    // The alignment's Greek base IS SBLGNT, so direct matches dominate and
    // every token resolves one way or another.
    expect(view.stats.direct).toBeGreaterThan(view.stats.strongs + view.stats.position);
    expect(view.stats.direct + view.stats.strongs + view.stats.position).toBeGreaterThan(0);
  });

  it('links the Mark 5:26 accusatives to their English words', () => {
    const doc = sblgntDocs()[0]!;
    const view = alignParallel(doc, markBsb());
    const tokByLemma = (lemma: string) => doc.tokens.find((t) => t.lemma === lemma)!;
    const nodeOf = (tid: string) => doc.syntax.nodes.find((n) => n.tokenIds.includes(tid))!.id;
    const v526 = view.verses.find((v) => v.key === '5.26')!;
    const englishFor = (lemma: string) =>
      (view.nodeToEn.get(nodeOf(tokByLemma(lemma).id)) ?? [])
        .filter((k) => k.startsWith('5.26#'))
        .map((k) => v526.words[Number(k.split('#')[1])]!.t.toLowerCase());
    expect(englishFor('πᾶς').join(' ')).toContain('all');
    expect(englishFor('δαπανάω').join(' ')).toContain('spent');
  });
});
