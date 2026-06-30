import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments } from '@/io/lowfat';
import { KrDocumentSchema } from '@/domain/schema';
import { layoutDocument } from '@/domain/layout';

/**
 * The gold-standard GNT mode converts published Nestle1904 Lowfat syntax trees
 * into our document model. This runs the converter over a real two-verse slice
 * (Philippians 1:1-2) checked into the repo.
 */
const xml = () => readFileSync('tests/fixtures-lowfat-phil-1-1-2.xml', 'utf8');

describe('Lowfat → KrDocument converter', () => {
  it('produces one valid document per sentence', () => {
    const docs = lowfatToDocuments(xml(), { book: 'Philippians' });
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.title)).toEqual(['Philippians 1:1', 'Philippians 1:2']);
    for (const d of docs) expect(() => KrDocumentSchema.parse(d)).not.toThrow();
  });

  it('references only existing nodes (no dangling relations)', () => {
    for (const d of lowfatToDocuments(xml())) {
      const ids = new Set(d.syntax.nodes.map((n) => n.id));
      expect(ids.has(d.syntax.rootId)).toBe(true);
      for (const r of d.syntax.relations) {
        expect(ids.has(r.headId)).toBe(true);
        expect(ids.has(r.dependentId)).toBe(true);
      }
    }
  });

  it('carries morphology and marks everything gold-standard (given)', () => {
    const [v1] = lowfatToDocuments(xml());
    const paul = v1!.tokens.find((t) => t.surface === 'Παῦλος')!;
    expect(paul.morphology?.case).toBe('nominative');
    expect(paul.pos).toBe('propernoun');
    expect(v1!.tokens.every((t) => t.provenance?.source === 'given')).toBe(true);
    expect(v1!.syntax.relations.every((r) => r.provenance?.source === 'given')).toBe(true);
  });

  it('recovers the coordination "Παῦλος καὶ Τιμόθεος"', () => {
    const [v1] = lowfatToDocuments(xml());
    const id = (s: string) => v1!.syntax.nodes.find((n) => n.tokenIds.some((t) => v1!.tokens.find((x) => x.id === t)?.surface === s))!.id;
    const conj = v1!.syntax.relations.find((r) => r.type === 'conjunct');
    expect(conj).toBeDefined();
    // Timothy is a conjunct of Paul.
    expect([conj!.headId, conj!.dependentId]).toContain(id('Τιμόθεος'));
  });

  it('does not wrap a verbless clause in a spurious empty "(is)" container', () => {
    // Lowfat wraps each sentence's real clause in an outer <wg role="cl">. That
    // wrapper carries no subject/complement, so it must NOT become its own clause
    // with a fabricated implied copula + empty subject — the real clause (with the
    // χάρις/εἰρήνη subject) should be the root instead.
    const [, v2] = lowfatToDocuments(xml());
    const root = v2!.syntax.nodes.find((n) => n.id === v2!.syntax.rootId)!;
    expect(root.kind).toBe('clause');
    const rootChildren = v2!.syntax.relations.filter((r) => r.headId === root.id);
    expect(rootChildren.some((r) => r.type === 'subject')).toBe(true);
    // Exactly one implied "(is)" predicate in the whole sentence (the real one),
    // not two (one of which would be the wrapper's).
    const impliedIs = v2!.syntax.nodes.filter((n) => n.implied && n.label === '(ἐστίν)');
    expect(impliedIs).toHaveLength(1);
  });

  it('attaches an articular participle’s article to the participle, and a predicate PP adverbially', () => {
    // "τοῖς οὖσιν ἐν Φιλίπποις": the article τοῖς substantivizes the participle
    // οὖσιν (it modifies the verb, not the whole clause), and the locative
    // predicate ἐν Φιλίπποις is adverbial — both so they hang under the verb.
    const [v1] = lowfatToDocuments(xml());
    const surf = (id: string) =>
      v1!.tokens.find((t) => v1!.syntax.nodes.find((n) => n.id === id)?.tokenIds.includes(t.id))?.surface;
    const ousin = v1!.syntax.nodes.find(
      (n) => n.tokenIds.some((t) => v1!.tokens.find((x) => x.id === t)?.surface === 'οὖσιν'),
    )!;
    const ousinChildren = v1!.syntax.relations.filter((r) => r.headId === ousin.id);
    // The article hangs on the participle…
    expect(ousinChildren.some((r) => r.type === 'determiner' && surf(r.dependentId) === 'τοῖς')).toBe(true);
    // …and the predicate PP ἐν Φιλίπποις is adverbial, not a predicate nominative.
    expect(ousinChildren.some((r) => r.type === 'adverbial' && surf(r.dependentId) === 'ἐν')).toBe(true);
    expect(ousinChildren.some((r) => r.type === 'predicateNominative')).toBe(false);
  });

  it('renders to a non-empty diagram', () => {
    const [v1] = lowfatToDocuments(xml());
    const layout = layoutDocument(v1!, {});
    expect(layout.elements.length).toBeGreaterThan(10);
    expect(layout.width).toBeGreaterThan(0);
  });
});

/**
 * Lowfat wraps clause coordination ("ἐρύσατο … καὶ μετέστησεν") and subordination
 * ("ὅτι ἐκτίσθη …") in head-marked wrappers with the conjunction as a bare word.
 * Converting those naively produced empty "(subject)|(verb)" baselines with the
 * real clauses dangling as `adjunct`s, and the conjunction floating free — the
 * "empty and broken links" of long passages (Colossians 1:9-16). The converter
 * must instead recover a coordinate clause / a labelled subordinate connector.
 */
describe('Lowfat clause coordination & subordination', () => {
  const surfaceOf = (doc: ReturnType<typeof lowfatToDocuments>[number], nodeId: string) => {
    const node = doc.syntax.nodes.find((n) => n.id === nodeId);
    const tid = node?.tokenIds[0];
    return doc.tokens.find((t) => t.id === tid)?.surface;
  };

  it('recovers coordinated clauses as conjuncts + a coordinator (no empty wrapper)', () => {
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl" rule="CLaCL">
      <wg class="cl"><w class="verb" role="v">ἐρύσατο</w><w class="pron" role="o">ἡμᾶς</w></wg>
      <w class="conj">καὶ</w>
      <wg class="cl"><w class="verb" role="v">μετέστησεν</w></wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const root = doc!.syntax.nodes.find((n) => n.id === doc!.syntax.rootId)!;
    expect(root.kind).toBe('clause');
    expect(root.clauseType).toBe('coordinate');
    const kids = doc!.syntax.relations.filter((r) => r.headId === root.id);
    // Two coordinated clauses + one coordinator — never a subject/predicate.
    expect(kids.filter((r) => r.type === 'conjunct')).toHaveLength(2);
    expect(kids.some((r) => r.type === 'coordinator' && surfaceOf(doc!, r.dependentId) === 'καὶ')).toBe(true);
    expect(kids.some((r) => r.type === 'subject' || r.type === 'predicate')).toBe(false);
    // No spurious implied subject/copula anywhere.
    expect(doc!.syntax.nodes.some((n) => n.implied)).toBe(false);
  });

  it('places one coordinator per clause join, not all stacked in the first gap', () => {
    // Three clauses joined by "καὶ … καὶ" (John 1:1 shape): the layout must place
    // a καὶ in EACH gap, not "καὶ καὶ" concatenated between the first two.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl" rule="ClClCl">
      <wg class="cl"><w class="verb" role="v" n="010010010010010">ἦν</w><w class="noun" role="s" n="010010010020010">Λόγος</w></wg>
      <w class="conj" n="010010010030010">καὶ</w>
      <wg class="cl"><w class="verb" role="v" n="010010010040010">ἦν</w><w class="noun" role="s" n="010010010050010">Θεός</w></wg>
      <w class="conj" n="010010010060010">καὶ</w>
      <wg class="cl"><w class="verb" role="v" n="010010010070010">ἦν</w></wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const layout = layoutDocument(doc!, {});
    const kais = layout.elements.filter(
      (e) => e.kind === 'text' && e.text === 'καὶ' && e.rotate,
    );
    expect(kais).toHaveLength(2); // one per join, each its own label
    // The two labels sit at different heights (one per gap), not the same spot.
    expect((kais[0] as { y: number }).y).not.toBeCloseTo((kais[1] as { y: number }).y, 0);
  });

  it('keeps a sentence-initial particle (γε) visible, not exiled to the coordinator bar', () => {
    // Regression for Philippians 3:8: the emphatic particle γε opened a coordinate
    // clause and was mis-tagged as the COORDINATOR, then drawn sideways on the
    // fork bar — effectively missing. It must be a `particle`, and the layout must
    // draw it upright and selectable above the spine.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl" rule="ClCl">
      <w class="ptcl" lemma="γέ" n="010010010010010">γε</w>
      <wg class="cl"><w class="verb" role="v" n="010010010020010">ἡγοῦμαι</w></wg>
      <w class="conj" lemma="καί" n="010010010030010">καὶ</w>
      <wg class="cl"><w class="verb" role="v" n="010010010040010">κερδήσω</w></wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const geNode = doc!.syntax.nodes.find((n) => surfaceOf(doc!, n.id) === 'γε')!;
    const geRel = doc!.syntax.relations.find((r) => r.dependentId === geNode.id)!;
    // γε is a discourse particle, NOT the coordinator; καί is the coordinator.
    expect(geRel.type).toBe('particle');
    expect(
      doc!.syntax.relations.some((r) => r.type === 'coordinator' && surfaceOf(doc!, r.dependentId) === 'καὶ'),
    ).toBe(true);
    // The layout draws γε once, upright (not rotated onto the bar) and selectable.
    const layout = layoutDocument(doc!, {});
    const ge = layout.elements.filter((e) => e.kind === 'text' && e.text === 'γε') as Array<{
      rotate?: number;
      nodeId?: string;
    }>;
    expect(ge).toHaveLength(1);
    expect(ge[0]!.rotate ?? 0).toBe(0);
    expect(ge[0]!.nodeId).toBe(geNode.id);
  });

  it('writes a subordinator (ὅτι) as the connector label, not a floating adjunct word', () => {
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl" rule="S-V-CL">
      <w class="pron" role="s">ὅς</w>
      <w class="verb" role="v">λέγει</w>
      <wg class="cl" rule="sub"><w class="conj">ὅτι</w>
        <wg class="cl"><w class="verb" role="v">ἐκτίσθη</w><w class="noun" role="s">πάντα</w></wg>
      </wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    // ὅτι must NOT survive as its own word-node dependent; it is a connector label.
    const otiIsNode = doc!.syntax.nodes.some((n) => surfaceOf(doc!, n.id) === 'ὅτι');
    expect(otiIsNode).toBe(false);
    const ektisthe = doc!.syntax.nodes.find(
      (n) => n.kind === 'clause' &&
        doc!.syntax.relations.some((r) => r.headId === n.id && surfaceOf(doc!, r.dependentId) === 'ἐκτίσθη'),
    )!;
    const link = doc!.syntax.relations.find((r) => r.dependentId === ektisthe.id)!;
    expect(link.label).toBe('ὅτι');
  });

  it('treats an asyndetic noun list (πίστις, ἐλπίς, ἀγάπη) as conjuncts, not apposition', () => {
    // Lowfat marks a bare list of like NPs with a repeated rule ("NpNpNp"); with
    // no conjunction it is still a COORDINATION (a fork), not appositional renaming.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl">
      <w class="verb" role="v">μένει</w>
      <wg role="s" class="np" rule="NpNpNp">
        <w class="noun" head="true" case="nominative">πίστις</w>
        <w class="noun" case="nominative">ἐλπίς</w>
        <w class="noun" case="nominative">ἀγάπη</w>
      </wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const conj = doc!.syntax.relations.filter((r) => r.type === 'conjunct');
    expect(conj).toHaveLength(2); // ἐλπίς and ἀγάπη are conjuncts of πίστις
    expect(doc!.syntax.relations.some((r) => r.type === 'apposition')).toBe(false);
  });

  it('attaches a focusing adverb in an NP adverbially, not as apposition', () => {
    // "καὶ ὁ Θεός" (Phil 2:9, rule AdvpNp): the focusing adverb καί ("also")
    // is a non-head sibling of the NP head Θεός. As an adverb it must slant under
    // its head (adverbial), not sit on the baseline as an apposition.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl">
      <w class="verb" role="v">ὑπερύψωσεν</w>
      <wg role="s" class="np" rule="AdvpNp">
        <w class="adv" lemma="καί">καὶ</w>
        <wg class="np" head="true" rule="DetNP">
          <w class="det">ὁ</w>
          <w class="noun" head="true" case="nominative">Θεὸς</w>
        </wg>
      </wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const surf = (id: string) => {
      const n = doc!.syntax.nodes.find((x) => x.id === id);
      return doc!.tokens.find((t) => t.id === n?.tokenIds[0])?.surface;
    };
    const kaiRel = doc!.syntax.relations.find((r) => surf(r.dependentId) === 'καὶ')!;
    expect(kaiRel.type).toBe('adverbial');
    expect(surf(kaiRel.headId)).toBe('Θεὸς');
    expect(doc!.syntax.relations.some((r) => r.type === 'apposition')).toBe(false);
  });

  it('coordinates two prepositional phrases ("ἐν τοῖς οὐρανοῖς καὶ ἐπὶ τῆς γῆς")', () => {
    // Regression for Colossians 1:16: a "Conj2Pp" wrapper joins two PPs. The
    // second PP (ἐπὶ τῆς γῆς) must become a CONJUNCT of the first (ἐν τοῖς
    // οὐρανοῖς), with καί the coordinator — not a `prepositionalPhrase` modifier
    // hanging off ἐν, which the layout engine's PP fast-path then silently drops.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl">
      <w class="verb" role="v">ἐκτίσθη</w>
      <wg role="s" class="np" rule="NpPp">
        <w class="noun" head="true" case="nominative">πάντα</w>
        <wg class="pp" rule="Conj2Pp">
          <wg class="pp" head="true" rule="PrepNp">
            <w class="prep">ἐν</w>
            <wg class="np" head="true" rule="DetNP">
              <w class="det">τοῖς</w>
              <w class="noun" head="true" case="dative">οὐρανοῖς</w>
            </wg>
          </wg>
          <w class="conj">καὶ</w>
          <wg class="pp" rule="PrepNp">
            <w class="prep">ἐπὶ</w>
            <wg class="np" head="true" rule="DetNP">
              <w class="det">τῆς</w>
              <w class="noun" head="true" case="genitive">γῆς</w>
            </wg>
          </wg>
        </wg>
      </wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const surf = (id: string) => {
      const n = doc!.syntax.nodes.find((x) => x.id === id);
      return doc!.tokens.find((t) => t.id === n?.tokenIds[0])?.surface;
    };
    const en = doc!.syntax.nodes.find((n) => surf(n.id) === 'ἐν')!;
    const enChildren = doc!.syntax.relations.filter((r) => r.headId === en.id);
    // ἐπὶ is a conjunct of ἐν (NOT a prepositionalPhrase), καί is the coordinator,
    // and ἐν still governs its own object οὐρανοῖς.
    expect(enChildren.some((r) => r.type === 'conjunct' && surf(r.dependentId) === 'ἐπὶ')).toBe(true);
    expect(enChildren.some((r) => r.type === 'prepositionalPhrase')).toBe(false);
    expect(enChildren.some((r) => r.type === 'coordinator' && surf(r.dependentId) === 'καὶ')).toBe(true);
    expect(enChildren.some((r) => r.type === 'prepositionObject' && surf(r.dependentId) === 'οὐρανοῖς')).toBe(true);
    // ἐπὶ governs its own object γῆς.
    const epi = doc!.syntax.nodes.find((n) => surf(n.id) === 'ἐπὶ')!;
    expect(
      doc!.syntax.relations.some(
        (r) => r.headId === epi.id && r.type === 'prepositionObject' && surf(r.dependentId) === 'γῆς',
      ),
    ).toBe(true);

    // And the layout draws BOTH phrases — the dropped-PP bug would omit ἐπὶ/γῆς.
    const layout = layoutDocument(doc!, {});
    const texts = layout.elements.flatMap((e) => (e.kind === 'text' ? [e.text] : []));
    for (const w of ['ἐν', 'οὐρανοῖς', 'καὶ', 'ἐπὶ', 'γῆς']) {
      expect(texts, `expected "${w}" in the diagram`).toContain(w);
    }
  });

  it('lists tokens in SURFACE order, not tree order (fronted PP before the verb)', () => {
    // The converter walks head-first, so ἦν (the verb) is visited before the
    // fronted PP "Ἐν ἀρχῇ". The document text and token order must still read in
    // surface order, recovered from the position-encoding `n` ids.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl" rule="ADV-V-S">
      <wg role="adv" class="pp" rule="PrepNp">
        <w class="prep" n="010010010010010">Ἐν</w>
        <w class="noun" head="true" n="010010010020010">ἀρχῇ</w>
      </wg>
      <w class="verb" role="v" n="010010010030010">ἦν</w>
      <wg role="s" class="np" rule="DetNp">
        <w class="det" n="010010010040010">ὁ</w>
        <w class="noun" head="true" n="010010010050010">λόγος</w>
      </wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    expect(doc!.tokens.map((t) => t.surface)).toEqual(['Ἐν', 'ἀρχῇ', 'ἦν', 'ὁ', 'λόγος']);
    expect(doc!.text).toBe('Ἐν ἀρχῇ ἦν ὁ λόγος');
    expect(doc!.tokens.every((t, i) => t.index === i)).toBe(true);
  });

  it('passes a single-child wrapper straight through (no extra clause node)', () => {
    const xml = `<book name="Test"><sentence><wg role="cl">
      <wg class="cl" rule="S-V"><w class="pron" role="s">ἐγώ</w><w class="verb" role="v">τρέχω</w></wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const clauses = doc!.syntax.nodes.filter((n) => n.kind === 'clause');
    expect(clauses).toHaveLength(1); // the wrapper collapsed away
  });
});
