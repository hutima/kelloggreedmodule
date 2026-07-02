import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments } from '@/io/lowfat';
import { layoutDocument } from '@/domain/layout';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

/**
 * MARK 5:26 REGRESSION / SPEC — the core test for the Greek Kellogg-Reed
 * role-mapping project (see docs/sblgnt-kellogg-reed-plan.md).
 *
 * Professional review of the app's output for Mark 5:26 found the converter
 * over-flattening Greek syntax into English-school roles:
 *
 *   A. δαπανήσασα τὰ παρ᾽ αὐτῆς πάντα — τὰ παρ᾽ αὐτῆς is a SUBSTANTIVAL
 *      ARTICULAR PP ("the things belonging to her") and πάντα modifies that
 *      nominal phrase. The converter used to emit πάντα alone as the ordinary
 *      direct object, demoting the article and PP beneath it.
 *   B. μηδὲν ὠφεληθεῖσα — ὠφεληθεῖσα is PASSIVE, so μηδέν must not default
 *      to an ordinary direct-object label (better: accusative modifier /
 *      adverbial accusative of extent / accusative of respect — with the
 *      uncertainty made visible, per Tim: "accusative modifier").
 *   C. ἀκούσασα τὰ περὶ τοῦ Ἰησοῦ — an articular PP the converter already
 *      rendered article-first (object = τά with the PP beneath), i.e. the
 *      preferred shape for A. The presence of πάντα must not force an
 *      artificial structural difference between A and C.
 *
 * These specs were authored as explicit expected failures (`it.fails`) in
 * phase 2 and flipped to ordinary tests when the phase 5 converter fix in
 * `src/io/lowfat.ts` landed (passive-verb accusative downgrade + article-
 * rooted articular PPs). If any of them fails again, the Mark 5:26 bug is
 * back.
 *
 * EDITION-AGNOSTIC: tokens are located by LEMMA, not by token id or word
 * position, so these specs survive the SBLGNT rebase (the fixture is
 * Nestle1904 Lowfat today; the same sentences exist in SBLGNT Lowfat).
 *
 * The fixtures are real Nestle1904 Lowfat XML slices checked into the repo
 * (per Tim's live review: bundle Mark 5:25–34 + Col 1:9–16 so tests never
 * re-fetch from the network).
 */

const markXml = () => readFileSync('tests/fixtures-lowfat-mark-5-25-34.xml', 'utf8');
const colXml = () => readFileSync('tests/fixtures-lowfat-col-1-9-16.xml', 'utf8');

/** The sentence containing Mark 5:26 (the fixture's first sentence, 5:25–27). */
const mark526 = (): KrDocument => lowfatToDocuments(markXml(), { book: 'Mark' })[0]!;

/** The unique token with this lemma in the doc (fails the test if ambiguous). */
function tokenByLemma(doc: KrDocument, lemma: string) {
  const hits = doc.tokens.filter((t) => t.lemma === lemma);
  expect(hits, `expected exactly one token with lemma ${lemma}`).toHaveLength(1);
  return hits[0]!;
}

/** The word-level node realizing this token. */
function nodeOfToken(doc: KrDocument, tokenId: string) {
  const hits = doc.syntax.nodes.filter((n) => n.tokenIds.includes(tokenId));
  expect(hits.length, `expected a node realizing token ${tokenId}`).toBeGreaterThan(0);
  return hits[0]!;
}

/** All relations in which this node is the dependent. */
const asDependent = (doc: KrDocument, nodeId: string) =>
  doc.syntax.relations.filter((r) => r.dependentId === nodeId);

/** All relations in which this node is the head. */
const asHead = (doc: KrDocument, nodeId: string) =>
  doc.syntax.relations.filter((r) => r.headId === nodeId);

/** Roles that would present the dependent as an ordinary object on the baseline. */
const ORDINARY_OBJECT_ROLES = new Set(['directObject', 'indirectObject']);

describe('Mark 5:25–34 fixture (bundled Nestle1904 Lowfat)', () => {
  it('converts to valid documents without network access', () => {
    const docs = lowfatToDocuments(markXml(), { book: 'Mark' });
    expect(docs).toHaveLength(9);
    expect(docs[0]!.title).toBe('Mark 5:25–27');
    for (const d of docs) expect(() => KrDocumentSchema.parse(d)).not.toThrow();
  });

  it('has no dangling relations in any sentence', () => {
    for (const d of lowfatToDocuments(markXml(), { book: 'Mark' })) {
      const ids = new Set(d.syntax.nodes.map((n) => n.id));
      expect(ids.has(d.syntax.rootId)).toBe(true);
      for (const r of d.syntax.relations) {
        expect(ids.has(r.headId)).toBe(true);
        expect(ids.has(r.dependentId)).toBe(true);
      }
    }
  });

  it('lays out every sentence without throwing (Kellogg-Reed geometry smoke)', () => {
    for (const d of lowfatToDocuments(markXml(), { book: 'Mark' })) {
      const layout = layoutDocument(d);
      expect(layout.elements.length).toBeGreaterThan(0);
    }
  });

  it('carries the morphology the specs depend on (participles, voice, case)', () => {
    const doc = mark526();
    const spend = tokenByLemma(doc, 'δαπανάω'); // δαπανήσασα
    expect(spend.pos).toBe('participle');
    expect(spend.morphology?.voice).toBe('active');

    const benefit = tokenByLemma(doc, 'ὠφελέω'); // ὠφεληθεῖσα
    expect(benefit.pos).toBe('participle');
    expect(benefit.morphology?.voice).toBe('passive');

    const nothing = tokenByLemma(doc, 'μηδείς'); // μηδέν
    expect(nothing.morphology?.case).toBe('accusative');

    const all = tokenByLemma(doc, 'πᾶς'); // πάντα
    expect(all.morphology?.case).toBe('accusative');
  });
});

describe('Mark 5:26 spec A — δαπανήσασα τὰ παρ᾽ αὐτῆς πάντα', () => {
  // DESIRED: πάντα is not presented as the ordinary direct object by itself.
  // PREVIOUSLY: the converter emitted δαπανήσασα —directObject→ πάντα (head-
  // percolated from Lowfat's head="true" on πάντα inside the articular NP).
  it('does not label πάντα alone as the ordinary direct object', () => {
    const doc = mark526();
    const panta = nodeOfToken(doc, tokenByLemma(doc, 'πᾶς').id);
    const objectRels = asDependent(doc, panta.id).filter((r) =>
      ORDINARY_OBJECT_ROLES.has(r.type),
    );
    expect(objectRels).toHaveLength(0);
  });

  // DESIRED: whatever node stands in the object-like position under δαπανήσασα
  // carries (or contains) the article τά — i.e. the substantival articular PP
  // "τὰ παρ᾽ αὐτῆς (πάντα)" is the thing spent, matching how τὰ περὶ τοῦ Ἰησοῦ
  // is already shaped (spec C). PREVIOUSLY the object node was bare πάντα with
  // the article demoted to a determiner beneath it.
  it('puts the articular phrase, not bare πάντα, in the object-like position', () => {
    const doc = mark526();
    const spend = nodeOfToken(doc, tokenByLemma(doc, 'δαπανάω').id);
    // The article of τὰ παρ᾽ αὐτῆς: the accusative-plural-neuter ὁ token.
    const article = doc.tokens.find(
      (t) =>
        t.lemma === 'ὁ' &&
        t.morphology?.case === 'accusative' &&
        t.morphology?.number === 'plural' &&
        t.surface === 'τὰ' &&
        // the τά of παρ᾽ αὐτῆς comes before παρά; the τά of περὶ τοῦ Ἰησοῦ after ἀκούω
        t.index < doc.tokens.find((x) => x.lemma === 'ἀκούω')!.index,
    )!;
    expect(article).toBeDefined();
    const objectish = asHead(doc, spend.id).filter(
      (r) => !['adverbial', 'conjunction', 'particle'].includes(r.type),
    );
    // Some dependent of δαπανήσασα in object position must carry the article
    // token — either as an article-headed substantival (like τὰ περὶ τοῦ
    // Ἰησοῦ today) or as a phrase node containing the whole articular PP.
    const carriesArticle = objectish.some((r) => {
      const dep = doc.syntax.nodes.find((n) => n.id === r.dependentId)!;
      return dep.tokenIds.includes(article.id);
    });
    expect(carriesArticle).toBe(true);
  });

  // DESIRED: πάντα functions as a MODIFIER of the nominalized/articular phrase
  // ("the totality of her possessions"), not as a head that the article and PP
  // hang beneath. PREVIOUSLY this was inverted — article and PP hung under πάντα.
  it('treats πάντα as a modifier of the substantival phrase', () => {
    const doc = mark526();
    const panta = nodeOfToken(doc, tokenByLemma(doc, 'πᾶς').id);
    const modifierish = asDependent(doc, panta.id).some((r) =>
      ['adjectival', 'determiner', 'adjunct'].includes(r.type),
    );
    expect(modifierish).toBe(true);
    // …and the article must not be πάντα's own determiner (that shape is what
    // makes πάντα read as the phrase head / ordinary object today).
    const hasDeterminerBelow = asHead(doc, panta.id).some((r) => r.type === 'determiner');
    expect(hasDeterminerBelow).toBe(false);
  });
});

describe('Mark 5:26 spec B — μηδὲν ὠφεληθεῖσα (passive participle)', () => {
  // DESIRED: because ὠφεληθεῖσα is passive, μηδέν must not default to an
  // ordinary direct-object label. Per Tim's review decision the target label
  // is the conservative "accusative modifier" (with nuance/uncertainty shown
  // in detail cards). PREVIOUSLY: ὠφεληθεῖσα —directObject→ μηδέν, marked as
  // gold-standard `given`, which the diagram rendered as a plain direct object.
  it('does not attach μηδέν to a passive participle as an ordinary direct object', () => {
    const doc = mark526();
    const meden = nodeOfToken(doc, tokenByLemma(doc, 'μηδείς').id);
    const objectRels = asDependent(doc, meden.id).filter((r) =>
      ORDINARY_OBJECT_ROLES.has(r.type),
    );
    expect(objectRels).toHaveLength(0);
  });

  // Sanity (passes today): μηδέν does attach to ὠφεληθεῖσα somehow — the fix
  // must relabel the relation, not orphan the word.
  it('keeps μηδέν attached to ὠφεληθεῖσα', () => {
    const doc = mark526();
    const meden = nodeOfToken(doc, tokenByLemma(doc, 'μηδείς').id);
    const benefit = nodeOfToken(doc, tokenByLemma(doc, 'ὠφελέω').id);
    expect(asDependent(doc, meden.id).some((r) => r.headId === benefit.id)).toBe(true);
  });
});

describe('Mark 5:26–27 spec C — τὰ παρ᾽ αὐτῆς vs τὰ περὶ τοῦ Ἰησοῦ consistency', () => {
  // Sanity (passes today): ἀκούσασα τὰ περὶ τοῦ Ἰησοῦ is already shaped
  // article-first — the object-like node carries the article τά and the PP
  // hangs beneath it. This is the comparison case the fix must match.
  it('shapes τὰ περὶ τοῦ Ἰησοῦ as an article-carried substantival phrase', () => {
    const doc = mark526();
    const hear = nodeOfToken(doc, tokenByLemma(doc, 'ἀκούω').id);
    const deps = asHead(doc, hear.id).map(
      (r) => doc.syntax.nodes.find((n) => n.id === r.dependentId)!,
    );
    const articleCarried = deps.find((n) =>
      n.tokenIds.some((id) => {
        const t = doc.tokens.find((x) => x.id === id)!;
        return t.lemma === 'ὁ' && t.morphology?.case === 'accusative';
      }),
    );
    expect(articleCarried).toBeDefined();
    // The περί PP hangs beneath that article-carried node.
    const peri = doc.tokens.find((t) => t.lemma === 'περί')!;
    const periNode = nodeOfToken(doc, peri.id);
    expect(
      asDependent(doc, periNode.id).some((r) => r.headId === articleCarried!.id),
    ).toBe(true);
  });

  // DESIRED: the two articular PPs get the SAME structural treatment — the
  // presence of πάντα must not flip τὰ παρ᾽ αὐτῆς into a πάντα-headed shape.
  // PREVIOUSLY δαπανήσασα's object was bare πάντα while ἀκούσασα's carried τά.
  it('treats both articular PPs consistently (πάντα must not flip the shape)', () => {
    const doc = mark526();
    const carriesAccusativeArticle = (participleLemma: string) => {
      const p = nodeOfToken(doc, tokenByLemma(doc, participleLemma).id);
      return asHead(doc, p.id).some((r) => {
        const dep = doc.syntax.nodes.find((n) => n.id === r.dependentId)!;
        return dep.tokenIds.some((id) => {
          const t = doc.tokens.find((x) => x.id === id)!;
          return t.lemma === 'ὁ' && t.morphology?.case === 'accusative';
        });
      });
    };
    expect(carriesAccusativeArticle('ἀκούω')).toBe(true);
    expect(carriesAccusativeArticle('δαπανάω')).toBe(true);
  });
});

describe('Mark 5:26 converter details (phase 5 fix)', () => {
  it('labels μηδέν a neutral accusative modifier with honest converted provenance', () => {
    const doc = mark526();
    const meden = nodeOfToken(doc, tokenByLemma(doc, 'μηδείς').id);
    const rel = asDependent(doc, meden.id)[0]!;
    expect(rel.type).toBe('accusativeModifier');
    expect(rel.provenance?.source).toBe('converted');
    expect(rel.provenance?.sourceRole).toBe('o'); // the raw Lowfat role is preserved
    expect(rel.provenance?.confidence).toBe('medium'); // uncertainty is visible
  });

  it('marks both articles as substantival-PP heads and πάντα as a converted modifier', () => {
    const doc = mark526();
    const articles = doc.syntax.nodes.filter(
      (n) => n.role === 'substantivalPrepositionalPhrase',
    );
    // τὰ παρ᾽ αὐτῆς and τὰ περὶ τοῦ Ἰησοῦ — the same treatment for both.
    expect(articles).toHaveLength(2);
    const panta = nodeOfToken(doc, tokenByLemma(doc, 'πᾶς').id);
    const rel = asDependent(doc, panta.id)[0]!;
    expect(rel.type).toBe('adjectival');
    expect(rel.provenance?.source).toBe('converted');
    expect(rel.provenance?.sourceRole).toBe('head'); // the source marked πάντα head="true"
  });

  it('does not downgrade the ACTIVE participle δαπανήσασα’s object', () => {
    const doc = mark526();
    const spend = nodeOfToken(doc, tokenByLemma(doc, 'δαπανάω').id);
    const obj = asHead(doc, spend.id).find((r) => r.type === 'directObject');
    expect(obj).toBeDefined(); // the substantival phrase IS its direct object
  });
});

describe('Colossians 1:9–16 fixture (bundled Nestle1904 Lowfat, long-sentence stress)', () => {
  it('converts to valid documents without network access', () => {
    const docs = lowfatToDocuments(colXml(), { book: 'Colossians' });
    expect(docs.length).toBeGreaterThanOrEqual(2);
    expect(docs[0]!.title.startsWith('Colossians 1:9')).toBe(true);
    for (const d of docs) {
      expect(() => KrDocumentSchema.parse(d)).not.toThrow();
      const ids = new Set(d.syntax.nodes.map((n) => n.id));
      for (const r of d.syntax.relations) {
        expect(ids.has(r.headId)).toBe(true);
        expect(ids.has(r.dependentId)).toBe(true);
      }
    }
  });
});
