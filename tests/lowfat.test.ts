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
    const impliedIs = v2!.syntax.nodes.filter((n) => n.implied && n.label === '(is)');
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
