import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments } from '@/io/lowfat';
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
});
