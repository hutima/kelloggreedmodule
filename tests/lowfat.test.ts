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

  it('passes a single-child wrapper straight through (no extra clause node)', () => {
    const xml = `<book name="Test"><sentence><wg role="cl">
      <wg class="cl" rule="S-V"><w class="pron" role="s">ἐγώ</w><w class="verb" role="v">τρέχω</w></wg>
    </wg></sentence></book>`;
    const [doc] = lowfatToDocuments(xml, { book: 'Test' });
    const clauses = doc!.syntax.nodes.filter((n) => n.kind === 'clause');
    expect(clauses).toHaveLength(1); // the wrapper collapsed away
  });
});
