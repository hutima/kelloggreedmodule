import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openTextToDocuments } from '@/io/opentext';
import { buildSurfaceIndex, alignOpenTextSurface } from '@/io/opentext-align';
import { KrDocumentSchema, type KrDocument, type Token } from '@/domain/schema';
import { layoutForMode, DIAGRAM_MODES } from '@/domain/layout/modes';

// vitest runs from the repo root, so the bundled sample lives under public/.
const read = (p: string) => readFileSync(resolve(process.cwd(), `public/opentext/philemon/${p}`), 'utf8');

function philemonDocs(): KrDocument[] {
  return openTextToDocuments(
    read('base/philemon.xml'),
    read('wordgroup/philemon-wg-ch1.xml'),
    read('clause/philemon-cl-ch1.xml'),
    { book: 'Philemon' },
  );
}

// Greek in the source XML and in these test literals may differ by Unicode
// normalization (NFC vs NFD); compare in NFC so the assertions test content,
// not byte form.
const nfc = (s: string) => s.normalize('NFC');
const surfaces = (d: KrDocument) => d.tokens.map((t) => nfc(t.surface));

describe('OpenText converter', () => {
  const docs = philemonDocs();

  it('produces multiple primary-clause documents, each schema-valid', () => {
    expect(docs.length).toBeGreaterThan(10);
    for (const d of docs) expect(() => KrDocumentSchema.parse(d)).not.toThrow();
  });

  it('parses self-closing word pointers as SIBLINGS, not a nested chain', () => {
    // The greeting's subject is "Παῦλος … καὶ Τιμόθεος …" — happy-dom nests
    // self-closing <w/> siblings unless normalized, which would drop every word
    // after the first. Guard that the whole compound subject survives.
    const greeting = docs[0]!;
    expect(surfaces(greeting)).toContain(nfc('Παῦλος'));
    expect(surfaces(greeting)).toContain(nfc('Τιμόθεος'));
    expect(greeting.tokens.length).toBeGreaterThan(20);
  });

  it('maps OpenText POS + morphology onto the schema (propernoun, case/gender/number)', () => {
    const paul = docs[0]!.tokens.find((t) => t.lemma && nfc(t.lemma) === nfc('Παῦλος'))!;
    expect(paul.pos).toBe('propernoun'); // NON + Louw-Nida "names" domain → propernoun
    expect(paul.morphology?.case).toBe('nominative');
    expect(paul.morphology?.gender).toBe('masculine');
    expect(paul.morphology?.number).toBe('singular');
  });

  it('renders a coordination as conjunct + coordinator relations', () => {
    const rels = docs[0]!.syntax.relations.map((r) => r.type);
    expect(rels).toContain('conjunct');
    expect(rels).toContain('coordinator');
    expect(rels).toContain('subject');
  });

  it('never leaks a clause id in as a word token', () => {
    for (const d of docs) for (const t of d.tokens) expect(t.surface).not.toMatch(/_c\d+$/);
  });

  it('drives all four visualizations from one document (lens over one graph)', () => {
    const greeting = docs[0]!;
    for (const m of DIAGRAM_MODES) {
      const layout = layoutForMode(m.id, greeting, greeting.layoutHints);
      expect(layout.elements.length, `${m.id} should render primitives`).toBeGreaterThan(0);
    }
  });
});

describe('OpenText surface alignment', () => {
  /** A Nestle1904-style token: inflected surface + lemma + osisId in extra.ref. */
  function nestle(verse: string, idx: number, surface: string, lemma: string): Token {
    return {
      id: `n_${verse}_${idx}`,
      index: idx,
      surface,
      lemma,
      morphology: { extra: { ref: `${verse}!${idx}` } },
    };
  }

  it('replaces lemma forms with inflected surfaces by (verse, position), validated by lemma', () => {
    const doc = philemonDocs()[1]!; // χάρις καὶ εἰρήνη ἀπὸ θεός … (lemma forms)
    // Build a tiny index covering the first verse-3 words with inflected forms.
    const index = buildSurfaceIndex([
      nestle('Phlm.1.3', 1, 'χάρις', 'χάρις'),
      nestle('Phlm.1.3', 2, 'καὶ', 'καί'),
      nestle('Phlm.1.3', 3, 'εἰρήνη', 'εἰρήνη'),
      nestle('Phlm.1.3', 4, 'ἀπὸ', 'ἀπό'),
      nestle('Phlm.1.3', 5, 'Θεοῦ', 'θεός'),
    ]);
    const { doc: aligned, aligned: n } = alignOpenTextSurface(doc, index);
    expect(n).toBeGreaterThanOrEqual(5);
    // The genitive Θεοῦ replaces the lemma θεός.
    expect(surfaces(aligned)).toContain(nfc('Θεοῦ'));
    expect(surfaces(aligned)).not.toContain(nfc('θεός'));
    // doc.text is rebuilt from the aligned surfaces in reading order.
    expect(nfc(aligned.text).startsWith(nfc('χάρις καὶ εἰρήνη ἀπὸ Θεοῦ'))).toBe(true);
  });

  it('keeps the lemma form when no aligned surface is found', () => {
    const doc = philemonDocs()[1]!;
    const { doc: aligned, aligned: n, total } = alignOpenTextSurface(doc, buildSurfaceIndex([]));
    expect(n).toBe(0);
    expect(total).toBe(doc.tokens.length);
    // Unchanged lemma forms (e.g. the conjunction καί) remain.
    expect(surfaces(aligned)).toContain(nfc('καί'));
  });

  it('falls back to a same-verse lemma match when the position drifts (textual variant)', () => {
    const doc = philemonDocs()[1]!;
    // Put εἰρήνη at the "wrong" position 9; position lookup misses, lemma fallback hits.
    const index = buildSurfaceIndex([
      nestle('Phlm.1.3', 9, 'εἰρήνην', 'εἰρήνη'),
    ]);
    const { doc: aligned } = alignOpenTextSurface(doc, index);
    expect(surfaces(aligned)).toContain(nfc('εἰρήνην'));
  });
});
