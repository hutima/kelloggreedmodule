import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { layoutForMode } from '@/domain/layout';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';
import { getNode } from '@/domain/model';

/**
 * SBLGNT PHRASE-COORDINATION REGRESSION — Mark 1:19–20.
 *
 * "εἶδεν Ἰάκωβον τὸν τοῦ Ζεβεδαίου καὶ Ἰωάννην τὸν ἀδελφὸν αὐτοῦ, καὶ αὐτοὺς …
 * καταρτίζοντας τὰ δίκτυα" — "he saw James (son of Zebedee) and John (his
 * brother), and them mending the nets". SBLGNT analyses the object of εἶδεν
 * as a coordination (`<wg role="o" rule="NpaNp">`) of the two people plus the
 * participial clause.
 *
 * Unlike Nestle1904, SBLGNT writes phrase-level coordinations as a CLASSLESS
 * `<wg>` carrying only a `rule` (no `class`). The converter's classless→clause
 * default therefore mistook the noun-phrase member "Ἰάκωβον … καὶ Ἰωάννην …"
 * for a bare subordinator word and collapsed the ENTIRE group into a single
 * garbled token, which then hung off the root as an `adjunct` — a whole
 * clause/phrase mislabelled (reported by Tim from the live app).
 *
 * Fixed in `src/io/lowfat.ts`: (1) a classless `<wg>` with a phrase
 * coordination rule (NpaNp/PpaPp/… — never a clause) routes to `convertPhrase`;
 * (2) `convertClause`'s no-verb branch delegates a classless, clause-content-
 * free `<wg>` (a "καί + <NP>" coordination-member wrapper) to `convertPhrase`
 * instead of fabricating an adjunct-only clause. Nestle1904 (which puts a
 * `class` on such groups) is untouched.
 */

const doc = (): KrDocument =>
  lowfatToDocuments(readFileSync('tests/fixtures-sblgnt-lowfat-mark-1-19-20.xml', 'utf8'), {
    book: 'Mark',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
  })[0]!;

const tokByLemma = (d: KrDocument, lemma: string) => d.tokens.find((t) => t.lemma === lemma)!;
const nodeOfTok = (d: KrDocument, id: string) =>
  d.syntax.nodes.find((n) => n.tokenIds.includes(id))!;

describe('SBLGNT Mark 1:19–20 — classless phrase coordination', () => {
  it('is valid, drops no tokens, and has no dangling relations or collapsed groups', () => {
    const d = doc();
    expect(() => KrDocumentSchema.parse(d)).not.toThrow();
    const ids = new Set(d.syntax.nodes.map((n) => n.id));
    for (const r of d.syntax.relations) {
      expect(ids.has(r.headId)).toBe(true);
      expect(ids.has(r.dependentId)).toBe(true);
    }
    // No node may span more than one SOURCE word: the old bug produced a single
    // "word" whose token's surface was a whole nested group (its surface had
    // internal whitespace). Every word node maps to exactly its own token(s),
    // and no token surface contains a run of multiple words.
    for (const t of d.tokens) {
      expect(t.surface.trim().split(/\s+/).length, `token ${t.id} surface "${t.surface}"`).toBe(1);
    }
    const realized = new Set(d.syntax.nodes.flatMap((n) => n.tokenIds));
    for (const t of d.tokens) expect(realized.has(t.id)).toBe(true);
  });

  it('makes Ἰάκωβον the direct object of εἶδεν (not an adjunct)', () => {
    const d = doc();
    const saw = nodeOfTok(d, tokByLemma(d, 'ὁράω').id); // εἶδεν
    const james = nodeOfTok(d, tokByLemma(d, 'Ἰάκωβος').id);
    const obj = d.syntax.relations.find(
      (r) => r.headId === saw.id && r.dependentId === james.id,
    );
    expect(obj?.type).toBe('directObject');
    // Nothing in this sentence is mislabelled as an adjunct of the root clause.
    const root = d.syntax.rootId;
    expect(d.syntax.relations.some((r) => r.headId === root && r.type === 'adjunct')).toBe(false);
  });

  it('coordinates Ἰωάννην and the participial clause as conjuncts of Ἰάκωβον', () => {
    const d = doc();
    const james = nodeOfTok(d, tokByLemma(d, 'Ἰάκωβος').id);
    const conjuncts = d.syntax.relations.filter(
      (r) => r.headId === james.id && r.type === 'conjunct',
    );
    const kinds = conjuncts.map((r) => getNode(d.syntax, r.dependentId)?.kind);
    expect(kinds).toContain('word'); // Ἰωάννην
    expect(kinds).toContain('clause'); // "αὐτοὺς … καταρτίζοντας τὰ δίκτυα"
    // The appositives (son of Zebedee, his brother) are preserved.
    const zeb = nodeOfTok(d, tokByLemma(d, 'Ζεβεδαῖος').id);
    expect(
      d.syntax.relations.some((r) => r.dependentId === zeb.id && r.type === 'apposition'),
    ).toBe(true);
  });

  it('draws every word — the whole "mending the nets" group is not lost', () => {
    const d = doc();
    const drawn = new Set(
      layoutForMode('kellogg-reed', d, d.layoutHints)
        .elements.filter((e) => e.kind === 'text')
        .map((e) => e.text),
    );
    for (const w of ['Ἰάκωβον', 'Ἰωάννην', 'ἀδελφὸν', 'αὐτοὺς', 'καταρτίζοντας', 'δίκτυα']) {
      expect(drawn.has(w), `expected "${w}" drawn`).toBe(true);
    }
  });
});
