import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { layoutForMode } from '@/domain/layout';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';
import { measureText } from '@/domain/layout/measure';

/**
 * SBLGNT QuanPp REGRESSION — Colossians 1:16.
 *
 * "ὅτι ἐν αὐτῷ ἐκτίσθη τὰ πάντα ἐν τοῖς οὐρανοῖς καὶ ἐπὶ τῆς γῆς, τὰ ὁρατὰ καὶ
 * τὰ ἀόρατα …". SBLGNT analyses the subject as `<wg class="np" rule="QuanPp">`:
 * the quantifier πάντα (HEAD) MODIFIED by a coordinated prepositional phrase
 * (ἐν τοῖς οὐρανοῖς καὶ ἐπὶ τῆς γῆς) — plus an apposition (τὰ ὁρατὰ καὶ …).
 *
 * `isCoordinationRule` matched the "a"(=καί) infix case-INSENSITIVELY, so the
 * word-internal letters of "Qu·an·Pp" hit the "anp" pattern and the converter
 * mis-read QuanPp as a COORDINATION — making πάντα a coordination head whose
 * apposition was then hoisted onto a platform below the fork, its "=" stem
 * slashing a long diagonal straight across the PP (reported by Tim on the live
 * SBLGNT diagram: a "non connected node and clashes"). The Nestle1904 parse of
 * the same verse is unaffected — it does not use the QuanPp rule.
 *
 * Fixed in `src/io/lowfat.ts`: (1) the "a"-infix category codes are matched
 * case-SENSITIVELY (they are always capitalised — Np, Pp, Cl…), so "QuanPp" is
 * no longer a coordination; (2) a classless PP-coordination wrapper (the source
 * gives "Conj2Pp" no `class`) whose converted head is a preposition is attached
 * as a `prepositionalPhrase`, not left to the apposition default.
 */

const doc = (): KrDocument =>
  lowfatToDocuments(readFileSync('tests/fixtures-sblgnt-lowfat-col-1-16.xml', 'utf8'), {
    book: 'Colossians',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
  })[0]!;

const tokBySurface = (d: KrDocument, surface: string) =>
  d.tokens.find((t) => t.surface === surface)!;
const nodeOfTok = (d: KrDocument, id: string) =>
  d.syntax.nodes.find((n) => n.tokenIds.includes(id))!;
const relsFrom = (d: KrDocument, headId: string) =>
  d.syntax.relations.filter((r) => r.headId === headId);

describe('SBLGNT Colossians 1:16 — QuanPp is a head + PP modifier, not a coordination', () => {
  it('is valid, drops no tokens, and has no dangling relations', () => {
    const d = doc();
    expect(() => KrDocumentSchema.parse(d)).not.toThrow();
    const ids = new Set(d.syntax.nodes.map((n) => n.id));
    for (const r of d.syntax.relations) {
      expect(ids.has(r.headId)).toBe(true);
      expect(ids.has(r.dependentId)).toBe(true);
    }
    const realized = new Set(d.syntax.nodes.flatMap((n) => n.tokenIds));
    for (const t of d.tokens) expect(realized.has(t.id)).toBe(true);
  });

  // The PP that modifies πάντα is headed by the SECOND ἐν ("ἐν τοῖς οὐρανοῖς");
  // the first ἐν is the clause-level "ἐν αὐτῷ". Derive it from πάντα's own
  // prepositional-phrase relation rather than by surface, which is ambiguous.
  const ppOfPanta = (d: KrDocument) => {
    const panta = nodeOfTok(d, tokBySurface(d, 'πάντα').id);
    return relsFrom(d, panta.id).find((r) => r.type === 'prepositionalPhrase');
  };

  it('makes πάντα a HEAD (no conjunct) with the PP as a prepositional modifier', () => {
    const d = doc();
    const panta = nodeOfTok(d, tokBySurface(d, 'πάντα').id);
    // πάντα must NOT be a coordination head — the QuanPp misread produced a
    // `conjunct` from πάντα to the preposition ἐν.
    expect(relsFrom(d, panta.id).some((r) => r.type === 'conjunct')).toBe(false);
    // The coordinated PP hangs beneath πάντα as a single prepositional phrase.
    expect(ppOfPanta(d)).toBeDefined();
  });

  it('preserves the PP coordination (ἐπὶ τῆς γῆς is a conjunct of ἐν)', () => {
    const d = doc();
    const enNodeId = ppOfPanta(d)!.dependentId; // the "ἐν τοῖς οὐρανοῖς" head
    const epi = nodeOfTok(d, tokBySurface(d, 'ἐπὶ').id);
    expect(
      relsFrom(d, enNodeId).some((r) => r.type === 'conjunct' && r.dependentId === epi.id),
    ).toBe(true);
  });

  it('keeps τὰ ὁρατὰ καὶ τὰ ἀόρατα as an apposition of πάντα', () => {
    const d = doc();
    const panta = nodeOfTok(d, tokBySurface(d, 'πάντα').id);
    const horata = nodeOfTok(d, tokBySurface(d, 'ὁρατὰ').id);
    expect(
      relsFrom(d, panta.id).some((r) => r.type === 'apposition' && r.dependentId === horata.id),
    ).toBe(true);
  });

  it('draws the appositive fork CLEAR of the PP objects — no overprint, no clash', () => {
    const d = doc();
    const layout = layoutForMode('kellogg-reed', d, d.layoutHints);
    const at = (text: string) =>
      layout.elements.find((e) => e.kind === 'text' && (e as { text: string }).text === text) as
        | { x: number; y: number }
        | undefined;
    const ouranois = at('οὐρανοῖς')!; // PP object hanging under πάντα
    const aorata = at('ἀόρατα')!; // fork's lower arm — dips below the baseline
    expect(ouranois).toBeDefined();
    expect(aorata).toBeDefined();
    // The apposition fork sits well to the RIGHT of the PP object instead of on
    // top of it (the pre-fix diagonal put ἀόρατα essentially over οὐρανοῖς).
    expect(aorata.x).toBeGreaterThan(ouranois.x + 100);

    // And nothing overprints: no two word labels share the same spot.
    const texts = layout.elements.filter(
      (e) => e.kind === 'text' && (e as { text: string }).text.trim(),
    ) as { x: number; y: number; text: string; small?: boolean; rotate?: number; anchor?: string }[];
    const box = (t: (typeof texts)[number]) => {
      const w = measureText(t.text, t.small ? { avgCharRatio: 0.55, fontSize: 13 } : undefined);
      const h = t.small ? 12 : 16;
      if (Math.abs(t.rotate ?? 0) > 30)
        return { x1: t.x - h / 2, x2: t.x + h / 2, y1: t.y - w / 2, y2: t.y + w / 2 };
      const ax = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
      return { x1: ax, x2: ax + w, y1: t.y - h, y2: t.y };
    };
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = box(texts[i]!);
        const b = box(texts[j]!);
        const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        expect(
          ox > 3 && oy > 3 && ox * oy > 25,
          `"${texts[i]!.text}" overlaps "${texts[j]!.text}"`,
        ).toBe(false);
      }
    }
  });

  it('draws every word of the verse', () => {
    const d = doc();
    const drawn = new Set(
      layoutForMode('kellogg-reed', d, d.layoutHints)
        .elements.filter((e) => e.kind === 'text')
        .map((e) => (e as { text: string }).text),
    );
    for (const w of ['ὅτι', 'ἐκτίσθη', 'πάντα', 'οὐρανοῖς', 'γῆς', 'ὁρατὰ', 'ἀόρατα', 'θρόνοι', 'ἐξουσίαι']) {
      expect(drawn.has(w), `expected "${w}" drawn`).toBe(true);
    }
  });
});
