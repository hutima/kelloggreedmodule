import { describe, it, expect } from 'vitest';
import { analysisNote, describeFunction } from '@/domain/model';
import { cloneSample } from '@/fixtures';
import { lowfatToDocuments } from '@/io/lowfat';
import { readFileSync } from 'node:fs';

describe('describeFunction (tap a word to reveal its function)', () => {
  it('names the subject of a clause', () => {
    const doc = cloneSample('doc_sample_fox')!;
    const subject = doc.syntax.nodes.find((n) =>
      n.tokenIds.some((t) => doc.tokens.find((x) => x.id === t)?.surface === 'fox'),
    )!;
    const fn = describeFunction(doc, subject.id)!;
    expect(fn.word).toContain('fox');
    expect(fn.role).toBe('Subject');
  });

  it('describes a Greek genitive with its head and morphology', () => {
    const [v1] = lowfatToDocuments(readFileSync('tests/fixtures-lowfat-phil-1-1-2.xml', 'utf8'));
    const node = (s: string) =>
      v1!.syntax.nodes.find((n) => n.tokenIds.some((t) => v1!.tokens.find((x) => x.id === t)?.surface === s))!;
    const fn = describeFunction(v1!, node('Χριστοῦ').id)!;
    expect(fn.role).toMatch(/genitive|apposition/i);
    expect(fn.grammar).toContain('genitive');
  });

  it('surfaces the Strong’s number and lemma for a whole-corpus search link', () => {
    const [v1] = lowfatToDocuments(readFileSync('tests/fixtures-lowfat-phil-1-1-2.xml', 'utf8'));
    const node = (s: string) =>
      v1!.syntax.nodes.find((n) => n.tokenIds.some((t) => v1!.tokens.find((x) => x.id === t)?.surface === s))!;
    const fn = describeFunction(v1!, node('Παῦλος').id)!;
    expect(fn.strong).toBe('3972'); // present in the Nestle1904 data
    expect(fn.lemma).toBeTruthy();
  });

  it('flags implied / elided elements', () => {
    const [v1] = lowfatToDocuments(readFileSync('tests/fixtures-lowfat-phil-1-1-2.xml', 'utf8'));
    const implied = v1!.syntax.nodes.find((n) => n.implied);
    if (implied) {
      const fn = describeFunction(v1!, implied.id)!;
      expect(fn.detail.toLowerCase()).toContain('implied');
    }
  });

  it('stays silent about analysis provenance for plain gold-standard data', () => {
    const [v1] = lowfatToDocuments(readFileSync('tests/fixtures-lowfat-phil-1-1-2.xml', 'utf8'));
    const node = (s: string) =>
      v1!.syntax.nodes.find((n) => n.tokenIds.some((t) => v1!.tokens.find((x) => x.id === t)?.surface === s))!;
    // Everything in the Lowfat conversion is `given`/high — no note to show.
    expect(describeFunction(v1!, node('Παῦλος').id)!.analysis).toBeUndefined();
  });
});

describe('analysisNote (the display-honesty line)', () => {
  it('says nothing for high-confidence source data', () => {
    expect(analysisNote(undefined)).toBeUndefined();
    expect(analysisNote({ source: 'given', confidence: 'high' })).toBeUndefined();
  });

  it('discloses an interpretive conversion and the preserved raw source role', () => {
    const note = analysisNote({
      source: 'converted',
      confidence: 'medium',
      sourceRole: 'o',
      reason: 'Passive participle with an accusative dependent.',
    })!;
    expect(note).toContain('interpreted during conversion');
    expect(note).toContain('“o”');
    expect(note).toContain('somewhat uncertain');
    expect(note).toContain('Passive participle');
  });

  it('discloses reconstruction and uncertainty', () => {
    expect(analysisNote({ source: 'reconstructed', confidence: 'high' })).toContain(
      'reconstructed for display',
    );
    expect(analysisNote({ source: 'given', confidence: 'low' })).toContain('uncertain');
  });
});
