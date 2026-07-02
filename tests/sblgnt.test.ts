import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { layoutDocument } from '@/domain/layout';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';
import { sourceOfDoc } from '@/io/sources';

/**
 * SBLGNT Lowfat loader/converter tests, over a real MACULA Greek slice
 * (Clear-Bible/macula-greek `SBLGNT/lowfat`, Mark 5:25–34) checked into the
 * repo. SBLGNT Lowfat differs from Nestle1904 Lowfat in three ways the
 * dialect must absorb:
 *   • word ids on `xml:id`/`ref` (no `n`/`osisId`);
 *   • verse milestones as "MRK 5:25" (no "Mark.5.25");
 *   • NO `head="true"` marking anywhere — heads are inferred by class/role.
 *
 * The Mark 5:26 Kellogg-Reed regression must hold under SBLGNT too. Note one
 * real TEXTUAL difference: SBLGNT reads ἀκούσασα περὶ τοῦ Ἰησοῦ (no τά), so
 * this sentence has ONE articular PP, not two — exactly the kind of
 * edition difference that must never be papered over.
 */

const xml = () => readFileSync('tests/fixtures-sblgnt-lowfat-mark-5-25-34.xml', 'utf8');
const docs = () =>
  lowfatToDocuments(xml(), { book: 'Mark', dialect: sblgntDialect, docIdPrefix: 'sblgnt' });

function tokenByLemma(doc: KrDocument, lemma: string) {
  const hits = doc.tokens.filter((t) => t.lemma === lemma);
  expect(hits, `expected exactly one token with lemma ${lemma}`).toHaveLength(1);
  return hits[0]!;
}

function nodeOfToken(doc: KrDocument, tokenId: string) {
  return doc.syntax.nodes.find((n) => n.tokenIds.includes(tokenId))!;
}

describe('SBLGNT Lowfat → KrDocument (Mark 5:25–34 fixture)', () => {
  it('converts each sentence into a valid, edition-tagged document', () => {
    const ds = docs();
    expect(ds).toHaveLength(9);
    expect(ds[0]!.title).toBe('Mark 5:25–27'); // "MRK 5:25" milestones parsed
    for (const d of ds) {
      expect(() => KrDocumentSchema.parse(d)).not.toThrow();
      expect(d.id.startsWith('sblgnt_')).toBe(true);
      expect(sourceOfDoc(d)).toBe('macula-greek-sblgnt-lowfat');
    }
  });

  it('has no dangling relations and drops no words', () => {
    for (const d of docs()) {
      const ids = new Set(d.syntax.nodes.map((n) => n.id));
      expect(ids.has(d.syntax.rootId)).toBe(true);
      for (const r of d.syntax.relations) {
        expect(ids.has(r.headId)).toBe(true);
        expect(ids.has(r.dependentId)).toBe(true);
      }
      // Every token is realized by some node (nothing silently dropped).
      const realized = new Set(d.syntax.nodes.flatMap((n) => n.tokenIds));
      for (const t of d.tokens) expect(realized.has(t.id)).toBe(true);
    }
  });

  it('reads ids, morphology, and Strong’s anchors from the SBLGNT attributes', () => {
    const doc = docs()[0]!;
    const woman = tokenByLemma(doc, 'γυνή');
    expect(woman.morphology?.case).toBe('nominative');
    expect(woman.morphology?.extra?.strong).toBe('1135');
    expect(woman.morphology?.extra?.ref).toMatch(/^MRK 5:25/);
    expect(woman.pos).toBe('noun');
    // Tokens are in surface order (xml:id sorts lexicographically).
    expect(doc.tokens.map((t) => t.index)).toEqual(doc.tokens.map((_, i) => i));
  });

  it('infers heads without head marking (article never heads an ordinary NP)', () => {
    const doc = docs()[0]!;
    // τοῦ ἱματίου αὐτοῦ — the noun heads the phrase; the article hangs beneath.
    const cloak = tokenByLemma(doc, 'ἱμάτιον');
    const cloakNode = nodeOfToken(doc, cloak.id);
    const deps = doc.syntax.relations.filter((r) => r.headId === cloakNode.id);
    expect(deps.some((r) => r.type === 'determiner')).toBe(true);
  });

  it('lays out every sentence (Kellogg-Reed geometry smoke)', () => {
    for (const d of docs()) {
      expect(layoutDocument(d).elements.length).toBeGreaterThan(0);
    }
  });
});

describe('Mark 5:26 regression holds under SBLGNT', () => {
  const mark526 = () => docs()[0]!;

  it('does not label πάντα alone as the ordinary direct object', () => {
    const doc = mark526();
    const panta = nodeOfToken(doc, tokenByLemma(doc, 'πᾶς').id);
    const rels = doc.syntax.relations.filter((r) => r.dependentId === panta.id);
    expect(rels.some((r) => r.type === 'directObject' || r.type === 'indirectObject')).toBe(
      false,
    );
    // πάντα modifies the substantival articular phrase τὰ παρ᾽ αὐτῆς.
    expect(rels.some((r) => r.type === 'adjectival')).toBe(true);
  });

  it('roots τὰ παρ᾽ αὐτῆς on its article as a substantival PP', () => {
    const doc = mark526();
    const articles = doc.syntax.nodes.filter(
      (n) => n.role === 'substantivalPrepositionalPhrase',
    );
    // SBLGNT reads ἀκούσασα περὶ τοῦ Ἰησοῦ (no τά) — so exactly ONE here.
    expect(articles).toHaveLength(1);
    const spend = nodeOfToken(doc, tokenByLemma(doc, 'δαπανάω').id);
    const obj = doc.syntax.relations.find(
      (r) => r.headId === spend.id && r.type === 'directObject',
    )!;
    expect(obj.dependentId).toBe(articles[0]!.id);
  });

  it('keeps μηδέν off the ordinary direct-object slot under the passive participle', () => {
    const doc = mark526();
    const benefit = tokenByLemma(doc, 'ὠφελέω');
    expect(benefit.morphology?.voice).toBe('passive');
    const meden = nodeOfToken(doc, tokenByLemma(doc, 'μηδείς').id);
    const rel = doc.syntax.relations.find((r) => r.dependentId === meden.id)!;
    expect(rel.type).toBe('accusativeModifier');
    expect(rel.provenance?.source).toBe('converted');
    expect(rel.provenance?.sourceRole).toBe('o');
  });
});
