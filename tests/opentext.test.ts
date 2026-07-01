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
  /** A Nestle1904-style token: inflected surface + lemma + gloss + osisId. */
  function nestle(verse: string, idx: number, surface: string, lemma: string, gloss?: string): Token {
    return {
      id: `n_${verse}_${idx}`,
      index: idx,
      surface,
      lemma,
      gloss,
      morphology: { extra: { ref: `${verse}!${idx}` } },
    };
  }

  it('copies the English gloss from the aligned Nestle1904 token', () => {
    const doc = philemonDocs()[1]!;
    const index = buildSurfaceIndex([nestle('Phlm.1.3', 5, 'Θεοῦ', 'θεός', '[the] God')]);
    const { doc: aligned } = alignOpenTextSurface(doc, index);
    const god = aligned.tokens.find((t) => nfc(t.surface) === nfc('Θεοῦ'));
    // OpenText ships no gloss; alignment supplies one so the English toggle works.
    expect(god?.gloss).toBe('[the] God');
  });

  it('replaces lemma forms with inflected surfaces by (verse, position), validated by lemma', () => {
    const doc = philemonDocs()[1]!; // χάρις ὑμῖν καὶ εἰρήνη ἀπὸ θεός … (lemma forms)
    // Build a tiny index covering the first verse-3 words with inflected forms. The
    // dative ὑμῖν (σύ) is an embedded complement of this clause; it sits at
    // within-verse position 2, so the later words shift down one from there.
    const index = buildSurfaceIndex([
      nestle('Phlm.1.3', 1, 'χάρις', 'χάρις'),
      nestle('Phlm.1.3', 2, 'ὑμῖν', 'σύ'),
      nestle('Phlm.1.3', 3, 'καὶ', 'καί'),
      nestle('Phlm.1.3', 4, 'εἰρήνη', 'εἰρήνη'),
      nestle('Phlm.1.3', 5, 'ἀπὸ', 'ἀπό'),
      nestle('Phlm.1.3', 6, 'Θεοῦ', 'θεός'),
    ]);
    const { doc: aligned, aligned: n } = alignOpenTextSurface(doc, index);
    expect(n).toBeGreaterThanOrEqual(6);
    // The genitive Θεοῦ replaces the lemma θεός.
    expect(surfaces(aligned)).toContain(nfc('Θεοῦ'));
    expect(surfaces(aligned)).not.toContain(nfc('θεός'));
    // doc.text is rebuilt from the aligned surfaces in reading order.
    expect(nfc(aligned.text).startsWith(nfc('χάρις ὑμῖν καὶ εἰρήνη ἀπὸ Θεοῦ'))).toBe(true);
  });

  it('aligns across a Nestle1904 homograph disambiguator suffix', () => {
    // Nestle1904 spells lexemes that share a form with a homograph index, e.g.
    // Phil 1:1 δοῦλοι carries lemma "δοῦλος (II)", while OpenText's lemma is bare
    // ("δοῦλος"). The suffix must not block the lemma check, or the word stays
    // stuck in its lemma form (the reported δοῦλοι → δοῦλος bug). Exercised here on
    // Philemon 1:3 θεός, given a disambiguated "θεός (I)".
    const doc = philemonDocs()[1]!;
    const index = buildSurfaceIndex([
      nestle('Phlm.1.3', 1, 'χάρις', 'χάρις'),
      nestle('Phlm.1.3', 2, 'ὑμῖν', 'σύ'),
      nestle('Phlm.1.3', 3, 'καὶ', 'καί'),
      nestle('Phlm.1.3', 4, 'εἰρήνη', 'εἰρήνη'),
      nestle('Phlm.1.3', 5, 'ἀπὸ', 'ἀπό'),
      nestle('Phlm.1.3', 6, 'Θεοῦ', 'θεός (I)'),
    ]);
    const { doc: aligned } = alignOpenTextSurface(doc, index);
    expect(surfaces(aligned)).toContain(nfc('Θεοῦ'));
    expect(surfaces(aligned)).not.toContain(nfc('θεός'));
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

describe('OpenText periphrastic verb (embedded copula predicate)', () => {
  // John 3:21 shape: "ὅτι ἐν Θεῷ ἐστιν εἰργασμένα". OpenText marks the participle
  // as the head of an embedded clause inside the complement, while the finite
  // copula ἐστιν is its own <cl.P type="embed"> nested within that complement
  // (structure "…-(P)"). The copula must be surfaced as the clause's real
  // predicate — not dropped with a phantom "(ἐστίν)" synthesized in its place.
  // The base lex spells εἰμί with polytonic OXIA (ί = U+1F77), so this also guards
  // the NFC-normalized copula match.
  const EIMI_OXIA = 'εἰμί'; // εἰμί with U+1F77, as OpenText's base layer spells it
  const base = `<book>
    <w xml:id="NT.Tst.w1" ref="NT.Tst.1.1"><pos><NON num="plur" cas="nom" gen="neu"/></pos><wf lex="ἔργον"/></w>
    <w xml:id="NT.Tst.w2" ref="NT.Tst.1.1"><pos><PRP/></pos><wf lex="ἐν"/></w>
    <w xml:id="NT.Tst.w3" ref="NT.Tst.1.1"><pos><NON num="sing" cas="dat" gen="mas"/></pos><wf lex="θεός"/></w>
    <w xml:id="NT.Tst.w4" ref="NT.Tst.1.1"><pos><VBF num="sing" per="3rd" mod="ind"/></pos><wf lex="${EIMI_OXIA}"/></w>
    <w xml:id="NT.Tst.w5" ref="NT.Tst.1.1"><pos><VBP num="plur" cas="nom" gen="neu" tf="per"/></pos><wf lex="ἐργάζομαι"/></w>
  </book>`;
  const wg = `<wordgroups/>`;
  const clause = `<chapter book="Test" num="1">
    <cl.clause xml:id="NT.Tst.1_c1" level="primary" structure="S-C-(P)">
      <cl.S><w xlink:href="NT.Tst.w1"/></cl.S>
      <cl.C>
        <cl.clause xml:id="NT.Tst.1_c2" level="embedded" structure="A-P">
          <cl.A><w xlink:href="NT.Tst.w2"/><w xlink:href="NT.Tst.w3"/></cl.A>
          <cl.P><w xlink:href="NT.Tst.w5"/></cl.P>
        </cl.clause>
        <cl.P type="embed" parent="NT.Tst.1_c1"><w xlink:href="NT.Tst.w4"/></cl.P>
      </cl.C>
    </cl.clause>
  </chapter>`;

  const doc = openTextToDocuments(base, wg, clause, { book: 'Test' })[0]!;
  const roleOf = (lemma: string) => {
    const node = doc.syntax.nodes.find((n) =>
      n.tokenIds.some((t) => nfc(doc.tokens.find((x) => x.id === t)?.lemma ?? '') === nfc(lemma)),
    );
    return doc.syntax.relations.find((r) => r.dependentId === node?.id)?.type;
  };

  it('surfaces the embedded finite copula instead of dropping it', () => {
    expect(doc.tokens.some((t) => nfc(t.lemma ?? '') === nfc('εἰμί'))).toBe(true);
    // The copula is the clause's predicate; no phantom implied "(ἐστίν)" is minted.
    expect(roleOf('εἰμί')).toBe('predicate');
    expect(doc.syntax.nodes.some((n) => n.implied && n.label === '(ἐστίν)')).toBe(false);
  });

  it('treats εἰμί as a copula (NFC match) so its complement is a predicate nominative', () => {
    // The participial clause complement rides a back-slant as a predicate nominal,
    // NOT a direct object — the copula match must see through the oxia/tonos spelling.
    const copulaChildren = doc.syntax.relations.filter(
      (r) => r.type === 'predicateNominative' || r.type === 'directObject',
    );
    expect(copulaChildren.map((r) => r.type)).toContain('predicateNominative');
    expect(copulaChildren.map((r) => r.type)).not.toContain('directObject');
  });
});
