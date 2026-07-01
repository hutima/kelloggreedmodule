import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments } from '@/io/lowfat';
import { KrDocumentSchema } from '@/domain/schema';
import { layoutDocument } from '@/domain/layout';
import { unassignedTokens } from '@/domain/model';

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
    // ὅτι is NOT attached as a clause-baseline dependent (it would draw as a stray
    // floating word); it rides the connecting line as the label instead.
    const otiNode = doc!.syntax.nodes.find((n) => surfaceOf(doc!, n.id) === 'ὅτι');
    expect(otiNode).toBeDefined(); // …but it DOES have a node, so it is selectable
    expect(doc!.syntax.relations.some((r) => r.dependentId === otiNode!.id)).toBe(false);
    const ektisthe = doc!.syntax.nodes.find(
      (n) => n.kind === 'clause' &&
        doc!.syntax.relations.some((r) => r.headId === n.id && surfaceOf(doc!, r.dependentId) === 'ἐκτίσθη'),
    )!;
    const link = doc!.syntax.relations.find((r) => r.dependentId === ektisthe.id)!;
    expect(link.label).toBe('ὅτι');
    // The connector label points at ὅτι's node so a click shows its word details.
    expect(link.labelNodeId).toBe(otiNode!.id);
  });

  it('rescues a clause-initial connective on the OUTERMOST clause (οὖν), instead of dropping it', () => {
    // 2 Corinthians 5:6-8 shape: Lowfat wraps a sentence-initial οὖν as a
    // subordinator over the real clause, but that clause is the document ROOT, so
    // nothing links to it and οὖν's stashed label is never consumed. Without a
    // rescue, οὖν vanishes from every view AND its missing verse breaks the source
    // strip's verse run. The converter must still attach it.
    const xml = `<book name="Test"><sentence>
      <milestone unit="verse" id="2Cor.5.6"/>
      <wg role="cl"><wg class="cl" rule="Conj-CL">
        <w class="conj" lemma="οὖν" n="010010010010010">οὖν</w>
        <wg class="cl"><w class="verb" role="v" n="010010010020010">θαρροῦμεν</w><w class="pron" role="s" n="010010010030010">ἡμεῖς</w></wg>
      </wg></wg>
    </sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: '2 Corinthians' });
    const oun = doc!.syntax.nodes.find((n) => surfaceOf(doc!, n.id) === 'οὖν')!;
    expect(oun).toBeDefined();
    // οὖν is reachable now: a parent relation points at a real node.
    const rel = doc!.syntax.relations.find((r) => r.dependentId === oun.id)!;
    expect(rel).toBeDefined();
    expect(doc!.syntax.nodes.some((n) => n.id === rel.headId)).toBe(true);
    expect(['conjunction', 'particle']).toContain(rel.type);
    // No source word is left unassigned.
    expect(unassignedTokens(doc!).map((t) => t.surface)).toEqual([]);
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

  it('merges shared-subject coordinate clauses into a compound predicate', () => {
    // "θεός ὕψωσεν αὐτόν καὶ ἔδωκεν ὄνομα" — subject stated once, two verbs with
    // their OWN objects. Should collapse to one clause: subject + a forked verb.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl" rule="CLaCL">
      <wg class="cl"><w class="noun" role="s" n="010010010010010">θεός</w><w class="verb" role="v" n="010010010020010">ὕψωσεν</w><w class="pron" role="o" n="010010010030010">αὐτόν</w></wg>
      <w class="conj" n="010010010040010">καὶ</w>
      <wg class="cl"><w class="verb" role="v" n="010010010050010">ἔδωκεν</w><w class="noun" role="o" n="010010010060010">ὄνομα</w></wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const surf = (id: string) => {
      const n = doc!.syntax.nodes.find((x) => x.id === id);
      return doc!.tokens.find((t) => t.id === n?.tokenIds[0])?.surface;
    };
    const root = doc!.syntax.nodes.find((n) => n.id === doc!.syntax.rootId)!;
    const rootKids = doc!.syntax.relations.filter((r) => r.headId === root.id);
    // One clause: subject θεός + predicate ὕψωσεν — NOT two conjunct clauses.
    expect(rootKids.find((r) => r.type === 'subject' && surf(r.dependentId) === 'θεός')).toBeDefined();
    const pred = rootKids.find((r) => r.type === 'predicate')!;
    expect(surf(pred.dependentId)).toBe('ὕψωσεν');
    expect(rootKids.some((r) => r.type === 'conjunct')).toBe(false);
    // The second verb is a conjunct of the first (compound predicate), with the
    // coordinator on the verb; each verb keeps its own object.
    const v1 = pred.dependentId;
    const v1kids = doc!.syntax.relations.filter((r) => r.headId === v1);
    expect(v1kids.some((r) => r.type === 'conjunct' && surf(r.dependentId) === 'ἔδωκεν')).toBe(true);
    expect(v1kids.some((r) => r.type === 'coordinator' && surf(r.dependentId) === 'καὶ')).toBe(true);
    expect(v1kids.some((r) => r.type === 'directObject' && surf(r.dependentId) === 'αὐτόν')).toBe(true);
    const v2 = v1kids.find((r) => r.type === 'conjunct')!.dependentId;
    expect(doc!.syntax.relations.some((r) => r.headId === v2 && r.type === 'directObject' && surf(r.dependentId) === 'ὄνομα')).toBe(true);
    // No phantom implied subject, and no leftover member-clause nodes.
    expect(doc!.syntax.nodes.some((n) => n.implied)).toBe(false);
    expect(doc!.syntax.nodes.filter((n) => n.kind === 'clause')).toHaveLength(1);
  });

  it('does NOT merge when the clauses have different subjects', () => {
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl" rule="ClClCl">
      <wg class="cl"><w class="noun" role="s" n="010010010010010">λόγος</w><w class="verb" role="v" n="010010010020010">ἦν</w></wg>
      <w class="conj" n="010010010030010">καὶ</w>
      <wg class="cl"><w class="noun" role="s" n="010010010040010">θεός</w><w class="verb" role="v" n="010010010050010">ἦν</w></wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    // Each clause has its own subject → stays a coordination, not a compound verb.
    expect(doc!.syntax.relations.filter((r) => r.type === 'conjunct').length).toBeGreaterThanOrEqual(2);
    expect(doc!.syntax.nodes.filter((n) => n.kind === 'clause').length).toBeGreaterThan(1);
  });

  it('attaches a cardinal numeral to its noun adjectivally, not as apposition', () => {
    // "πέντε ἄρτους" — the numeral πέντε quantifies ἄρτους; as a non-head NP
    // child it must slant under the noun (adjectival), not sit on the baseline.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl">
      <w class="verb" role="v">ἔλαβεν</w>
      <wg role="o" class="np" rule="NumNp">
        <w class="num" lemma="πέντε">πέντε</w>
        <w class="noun" head="true" case="accusative">ἄρτους</w>
      </wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const surf = (id: string) => {
      const n = doc!.syntax.nodes.find((x) => x.id === id);
      return doc!.tokens.find((t) => t.id === n?.tokenIds[0])?.surface;
    };
    const numRel = doc!.syntax.relations.find((r) => surf(r.dependentId) === 'πέντε')!;
    expect(numRel.type).toBe('adjectival');
    expect(surf(numRel.headId)).toBe('ἄρτους');
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

  it('renders a periphrastic verb (ἐστιν εἰργασμένα) as ONE compound baseline verb', () => {
    // A Lowfat BeVerb VP groups the finite copula ἐστιν with the perfect-passive
    // participle εἰργασμένα (John 3:21). The tree marks the participle as the phrase
    // head, which would make the participle the predicate and leave ἐστιν hanging
    // beneath it as a stray apposition. Reed-Kellogg instead writes the whole
    // periphrasis on the baseline as one verb.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl" rule="S-V">
      <wg role="s" class="np"><w class="noun" head="true" case="nominative" n="010010010010010">ἔργα</w></wg>
      <wg role="v" class="vp" rule="BeVerb">
        <w class="verb" lemma="εἰμί" mood="indicative" n="010010010020010">ἐστιν</w>
        <w class="verb" lemma="ἐργάζομαι" mood="participle" head="true" n="010010010030010">εἰργασμένα</w>
      </wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const pred = doc!.syntax.relations.find((r) => r.type === 'predicate')!;
    const verb = doc!.syntax.nodes.find((n) => n.id === pred.dependentId)!;
    const surfaceOfToken = (id: string) => doc!.tokens.find((t) => t.id === id)?.surface;
    const verbSurfaces = verb.tokenIds.map(surfaceOfToken);
    // Both verb words live on ONE predicate node…
    expect(verbSurfaces).toContain('ἐστιν');
    expect(verbSurfaces).toContain('εἰργασμένα');
    // …with the finite copula first, so the clause reads as finite (not a bare
    // participle head, which would drop the subject slot).
    expect(surfaceOfToken(verb.tokenIds[0]!)).toBe('ἐστιν');
    // …and the copula is NEVER a stray apposition of the participle.
    expect(doc!.syntax.relations.some((r) => r.type === 'apposition')).toBe(false);
    // The layout draws the periphrasis as a single baseline text element.
    const texts = layoutDocument(doc!, {}).elements.flatMap((e) => (e.kind === 'text' ? [e.text] : []));
    expect(texts).toContain('ἐστιν εἰργασμένα');
  });

  it('keeps a subordinate clause (ὅτι …) out of a shared-subject predicate merge', () => {
    // Regression for John 3:21: once the periphrastic ὅτι-clause reads as finite, it
    // must NOT be swept into a compound predicate with the clause it is merely
    // coordinated-with by the wrapper. The connector label (ὅτι) rides a conjunct and
    // must survive — a merge would fork the verbs and drop it.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl" rule="ClCl">
      <wg class="cl" rule="V-S"><w class="verb" role="v" n="010010010010010">φανερωθῇ</w><w class="noun" role="s" n="010010010020010">ἔργα</w></wg>
      <wg class="cl" rule="sub"><w class="conj" lemma="ὅτι" n="010010010030010">ὅτι</w>
        <wg class="cl" rule="V"><wg role="v" class="vp" rule="BeVerb">
          <w class="verb" lemma="εἰμί" mood="indicative" n="010010010040010">ἐστιν</w>
          <w class="verb" lemma="ἐργάζομαι" mood="participle" head="true" n="010010010050010">εἰργασμένα</w>
        </wg></wg>
      </wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    // ὅτι is still present as a connector label (not dropped by a merge).
    expect(doc!.syntax.relations.some((r) => r.label === 'ὅτι')).toBe(true);
    // The two clauses stay separate — not collapsed into one shared-subject clause.
    expect(doc!.syntax.nodes.filter((n) => n.kind === 'clause').length).toBeGreaterThan(1);
    // Every source word is still drawn.
    const texts = layoutDocument(doc!, {}).elements.flatMap((e) => (e.kind === 'text' ? [e.text] : []));
    expect(texts).toContain('ὅτι');
    expect(texts).toContain('ἐστιν εἰργασμένα');
  });

  it('draws a contrastive PP coordination ("οὐκ … οὐδὲ … ἀλλὰ …") without dropping a phrase', () => {
    // Galatians 1:1: Lowfat's "notPPbutPP" nests the negated phrases and the "but"
    // phrase under the (head-marked) "but" preposition. Percolated naively they
    // become modifiers of διά and the layout's PP path silently drops the whole
    // "οὐκ ἀπ’ ἀνθρώπων οὐδὲ δι’ ἀνθρώπου ἀλλὰ" clause. The converter must flatten it
    // into one PP coordination; the layout must draw every member AND every connector.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl">
      <w class="verb" role="v" n="010010010010010">ἦν</w>
      <wg role="s" class="np" rule="NpPp">
        <w class="noun" head="true" case="nominative" n="010010010020010">ἀπόστολος</w>
        <wg class="pp" rule="notPPbutPP">
          <w class="adv" lemma="οὐ" n="010010010030010">οὐκ</w>
          <wg class="pp" rule="Conj2Pp">
            <wg class="pp" head="true" rule="PrepNp"><w class="prep" n="010010010040010">ἀπ’</w><w class="noun" head="true" case="genitive" n="010010010050010">ἀνθρώπων</w></wg>
            <w class="conj" lemma="οὐδέ" n="010010010060010">οὐδὲ</w>
            <wg class="pp" rule="PrepNp"><w class="prep" n="010010010070010">δι’</w><w class="noun" head="true" case="genitive" n="010010010080010">ἀνθρώπου</w></wg>
          </wg>
          <w class="conj" lemma="ἀλλά" n="010010010090010">ἀλλὰ</w>
          <wg class="pp" head="true" rule="PrepNp"><w class="prep" n="010010010100010">διὰ</w><w class="propernoun" head="true" case="genitive" n="010010010110010">Χριστοῦ</w></wg>
        </wg>
      </wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const surf = (id: string) => {
      const n = doc!.syntax.nodes.find((x) => x.id === id);
      return doc!.tokens.find((t) => t.id === n?.tokenIds[0])?.surface;
    };
    // The three PPs coordinate off the first (ἀπ’): δι’ and διὰ are its conjuncts.
    const ap = doc!.syntax.nodes.find((n) => surf(n.id) === 'ἀπ’')!;
    const apKids = doc!.syntax.relations.filter((r) => r.headId === ap.id);
    expect(apKids.filter((r) => r.type === 'conjunct').map((r) => surf(r.dependentId)).sort()).toEqual(
      ['δι’', 'διὰ'].sort(),
    );
    // οὐκ / οὐδὲ / ἀλλὰ all ride the coordination as connectors (not lost, not nested
    // under διά as dropped modifiers).
    expect(apKids.filter((r) => r.type === 'coordinator').map((r) => surf(r.dependentId)).sort()).toEqual(
      ['οὐκ', 'οὐδὲ', 'ἀλλὰ'].sort(),
    );
    // The whole phrase is drawn — nothing silently dropped.
    const texts = layoutDocument(doc!, {}).elements.flatMap((e) => (e.kind === 'text' ? [e.text] : []));
    for (const w of ['οὐκ', 'ἀπ’', 'ἀνθρώπων', 'οὐδὲ', 'δι’', 'ἀνθρώπου', 'ἀλλὰ', 'διὰ', 'Χριστοῦ']) {
      expect(texts, `expected "${w}" in the diagram`).toContain(w);
    }
  });

  it('keeps a head-conjunct appositive inline with its arm ("Ἰησοῦ Χριστοῦ καὶ Θεοῦ Πατρὸς")', () => {
    // Galatians 1:1: the object of διά is "Ἰησοῦ Χριστοῦ καὶ Θεοῦ Πατρὸς" — a
    // coordination whose head Ἰησοῦ carries the appositive Χριστοῦ. The coordination
    // layout used to treat ANY head apposition as a group SUMMARY and drop it below
    // the whole fork, splitting Ἰησοῦ from Χριστοῦ. A head-conjunct appositive (which
    // precedes the other members) must instead ride inline on the head's arm.
    const xml = `<book name="Test"><sentence><wg role="cl" class="cl">
      <w class="verb" role="v" n="010010010010010">ἦν</w>
      <wg role="s" class="np" rule="NpaNp">
        <wg class="np" head="true" rule="Np-Appos"><w class="propernoun" head="true" case="nominative" n="010010010020010">Ἰησοῦς</w><w class="propernoun" case="nominative" n="010010010030010">Χριστός</w></wg>
        <w class="conj" lemma="καί" n="010010010040010">καὶ</w>
        <wg class="np" rule="Np-Appos"><w class="noun" head="true" case="nominative" n="010010010050010">Θεός</w><w class="noun" case="nominative" n="010010010060010">Πατήρ</w></wg>
      </wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const texts = layoutDocument(doc!, {}).elements.filter((e) => e.kind === 'text') as Array<{
      text: string;
      y: number;
    }>;
    const y = (t: string) => texts.find((e) => e.text === t)?.y;
    // Ἰησοῦς and its appositive Χριστός share one baseline (same arm)…
    expect(y('Ἰησοῦς')).toBeDefined();
    expect(y('Χριστός')).toBeCloseTo(y('Ἰησοῦς')!, 1);
    // …and the second arm (Θεός Πατήρ) is on a DIFFERENT baseline below.
    expect(y('Θεός')).toBeDefined();
    expect(Math.abs(y('Θεός')! - y('Ἰησοῦς')!)).toBeGreaterThan(10);
    expect(y('Πατήρ')).toBeCloseTo(y('Θεός')!, 1);
  });
});
