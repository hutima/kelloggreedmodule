import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { combinePassage } from '@/io/passage';
import { layoutForMode } from '@/domain/layout';
import {
  KrDocumentSchema,
  type KrDocument,
  type SourceConstituencyNode,
} from '@/domain/schema';

/**
 * SOURCE CONSTITUENCY preservation (plan phase 10): the published Lowfat
 * `<wg>` hierarchy rides along on the document verbatim, so the Constituency
 * Tree can show the SOURCE analysis instead of a reconstruction. The layer is
 * optional and additive — the syntax graph is untouched, and docs without it
 * (fixtures, custom sentences) still validate.
 */

const nestleDocs = () =>
  lowfatToDocuments(readFileSync('tests/fixtures-lowfat-mark-5-25-34.xml', 'utf8'), {
    book: 'Mark',
    sourceId: 'macula-greek-nestle1904-lowfat',
  });
const sblgntDocs = () =>
  lowfatToDocuments(readFileSync('tests/fixtures-sblgnt-lowfat-mark-5-25-34.xml', 'utf8'), {
    book: 'Mark',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });

const flatten = (n: SourceConstituencyNode): SourceConstituencyNode[] => [
  n,
  ...n.children.flatMap(flatten),
];

describe('source constituency preservation (Lowfat <wg> hierarchy)', () => {
  it('is captured verbatim for Nestle1904, with heads/rules/articular marks', () => {
    const doc = nestleDocs()[0]!;
    expect(() => KrDocumentSchema.parse(doc)).not.toThrow();
    const tree = doc.sourceConstituency!;
    expect(tree.sourceId).toBe('macula-greek-nestle1904-lowfat');
    const all = flatten(tree.root);
    // Nestle1904 marks heads; the articular object NP of Mark 5:26 is there.
    expect(all.some((n) => n.head)).toBe(true);
    expect(all.some((n) => n.kind === 'wg' && n.articular && n.rule === 'DetNP')).toBe(true);
    // The source's own head marking on πάντα is preserved even though the
    // converted graph deliberately re-reads it (phase 5) — source fidelity.
    const inner = all.find((n) => n.rule === 'PpNp2Np')!;
    const head = inner.children.find((c) => c.head)!;
    const tok = doc.tokens.find((t) => head.tokenIds?.includes(t.id))!;
    expect(tok.lemma).toBe('πᾶς');
  });

  it('is captured for SBLGNT (which has no head marking) and maps every leaf to a real token', () => {
    const doc = sblgntDocs()[0]!;
    const tree = doc.sourceConstituency!;
    expect(tree.sourceId).toBe('macula-greek-sblgnt-lowfat');
    const all = flatten(tree.root);
    expect(all.some((n) => n.head)).toBe(false); // SBLGNT Lowfat carries none
    const tokenIds = new Set(doc.tokens.map((t) => t.id));
    const leaves = all.filter((n) => n.kind === 'word');
    expect(leaves.length).toBe(doc.tokens.length);
    for (const leaf of leaves) {
      expect(leaf.tokenIds?.length).toBe(1);
      expect(tokenIds.has(leaf.tokenIds![0]!)).toBe(true);
    }
  });

  it('does not disturb the converted syntax graph or documents without the layer', () => {
    const withLayer = nestleDocs()[0]!;
    const without = lowfatToDocuments(
      readFileSync('tests/fixtures-lowfat-mark-5-25-34.xml', 'utf8'),
      { book: 'Mark' },
    )[0]!;
    expect(without.sourceConstituency).toBeUndefined();
    // Same graph either way — the layer is purely additive.
    expect(withLayer.syntax).toEqual(without.syntax);
    expect(() => KrDocumentSchema.parse(without)).not.toThrow();
  });

  it('survives combinePassage with prefixed token ids under a discourse root', () => {
    const docs = nestleDocs().slice(0, 2);
    const passage = combinePassage(docs) as KrDocument;
    const tree = passage.sourceConstituency!;
    expect(tree.sourceId).toBe('macula-greek-nestle1904-lowfat');
    expect(tree.root.children).toHaveLength(2);
    const tokenIds = new Set(passage.tokens.map((t) => t.id));
    for (const leaf of flatten(tree.root).filter((n) => n.kind === 'word')) {
      expect(tokenIds.has(leaf.tokenIds![0]!)).toBe(true);
    }
  });

  it('is dropped (not corrupted) when members lack it', () => {
    const [a, b] = nestleDocs().slice(0, 2);
    const bare = { ...b!, sourceConstituency: undefined };
    const passage = combinePassage([a!, bare]) as KrDocument;
    expect(passage.sourceConstituency).toBeUndefined();
  });
});

describe('Constituency Tree mode renders the source tree (phase 11)', () => {
  const texts = (doc: KrDocument, variant?: 'auto' | 'source' | 'reconstructed') =>
    layoutForMode('constituency', doc, {}, { constituencyVariant: variant })
      .elements.filter((e): e is Extract<typeof e, { kind: 'text' }> => e.kind === 'text')
      .map((e) => e.text);

  it('draws the SOURCE tree by default and captions it with the edition', () => {
    const doc = sblgntDocs()[0]!;
    const t = texts(doc); // variant defaults to auto
    expect(t.some((x) => x.includes('Source constituency: SBLGNT Lowfat'))).toBe(true);
    // Source raw roles appear verbatim on branch chips (never translated).
    expect(t).toContain('o');
    expect(t).toContain('s');
    // Every word of the sentence is a leaf.
    for (const tok of doc.tokens) expect(t).toContain(tok.surface);
  });

  it('honours the explicit variants and says which tree is shown', () => {
    const doc = nestleDocs()[0]!;
    expect(
      texts(doc, 'source').some((x) => x.includes('Source constituency: Nestle 1904 Lowfat')),
    ).toBe(true);
    expect(
      texts(doc, 'reconstructed').some((x) => x.includes('Reconstructed from the app syntax graph')),
    ).toBe(true);
  });

  it('falls back to the reconstruction (and says so) when no source tree exists', () => {
    const doc = lowfatToDocuments(
      readFileSync('tests/fixtures-lowfat-mark-5-25-34.xml', 'utf8'),
      { book: 'Mark' }, // no sourceId → no preserved tree
    )[0]!;
    const auto = texts(doc);
    expect(auto.some((x) => x.includes('Reconstructed from the app syntax graph'))).toBe(true);
    const wantedSource = texts(doc, 'source');
    expect(wantedSource.some((x) => x.includes('no source tree available'))).toBe(true);
  });
});

describe('source metadata display (rules, articular, head marking)', () => {
  const texts = (doc: KrDocument, variant?: 'auto' | 'source' | 'reconstructed') =>
    layoutForMode('constituency', doc, {}, { constituencyVariant: variant })
      .elements.filter((e): e is Extract<typeof e, { kind: 'text' }> => e.kind === 'text')
      .map((e) => e.text);

  const sblgntMark1 = () =>
    lowfatToDocuments(readFileSync('tests/fixtures-sblgnt-lowfat-mark-1-19-20.xml', 'utf8'), {
      book: 'Mark',
      dialect: sblgntDialect,
      docIdPrefix: 'sblgnt',
      sourceId: 'macula-greek-sblgnt-lowfat',
    });
  const sblgntCol1 = () =>
    lowfatToDocuments(readFileSync('tests/fixtures-sblgnt-lowfat-col-1-16.xml', 'utf8'), {
      book: 'Colossians',
      dialect: sblgntDialect,
      docIdPrefix: 'sblgnt',
      sourceId: 'macula-greek-sblgnt-lowfat',
    });

  it('SBLGNT Mark 1:19–20: classless coordination wrappers survive as source nodes, no fake-token collapse', () => {
    const doc = sblgntMark1().find((d) => d.sourceConstituency)!;
    const all = flatten(doc.sourceConstituency!.root);
    // The phrase-level object coordination is a CLASSLESS <wg> carrying only a
    // rule — it must be preserved as a wg node with its members as children.
    const coord = all.find((n) => n.kind === 'wg' && !n.cat && n.rule === 'NpaNp' && n.role === 'o');
    expect(coord).toBeDefined();
    expect(coord!.children.length).toBeGreaterThanOrEqual(2);
    // Every source leaf is exactly one REAL token — the source tree never
    // collapses a whole <wg> into one fake token.
    const tokenIds = new Set(doc.tokens.map((t) => t.id));
    const leaves = all.filter((n) => n.kind === 'word');
    expect(leaves.length).toBe(doc.tokens.length);
    for (const leaf of leaves) {
      expect(leaf.tokenIds?.length).toBe(1);
      expect(tokenIds.has(leaf.tokenIds![0]!)).toBe(true);
    }
    // And the classless wrapper's rule is VISIBLE in Source mode.
    expect(texts(doc, 'source').some((x) => x.includes('NpaNp'))).toBe(true);
  });

  it('SBLGNT Col 1:16: QuanPp is visible as the raw source rule, not rewritten as an app coordination', () => {
    const doc = sblgntCol1().find((d) =>
      flatten(d.sourceConstituency!.root).some((n) => n.rule === 'QuanPp'),
    )!;
    const all = flatten(doc.sourceConstituency!.root);
    const quan = all.find((n) => n.rule === 'QuanPp')!;
    expect(quan.kind).toBe('wg');
    expect(quan.articular).toBe(true);
    // Source mode shows the raw rule text verbatim.
    const t = texts(doc, 'source');
    expect(t.some((x) => x.includes('QuanPp'))).toBe(true);
    // The reconstructed view never claims source rules.
    expect(texts(doc, 'reconstructed').some((x) => x.includes('QuanPp'))).toBe(false);
  });

  it('Nestle1904 Mark 5:26: DetNP/PpNp2Np/NpPp rules, articular marks, and head markers all render', () => {
    const doc = nestleDocs()[0]!; // the Mark 5:25–27 sentence
    const all = flatten(doc.sourceConstituency!.root);
    for (const rule of ['DetNP', 'PpNp2Np', 'NpPp']) {
      expect(all.some((n) => n.rule === rule)).toBe(true);
    }
    const t = texts(doc, 'source');
    for (const rule of ['DetNP', 'PpNp2Np', 'NpPp']) {
      expect(t.some((x) => x.includes(rule))).toBe(true);
    }
    // Articular marking renders beside the category…
    expect(t.some((x) => x.includes('art.'))).toBe(true);
    // …and explicit source heads appear as chips.
    expect(t.some((x) => x === 'head' || x.endsWith('· head'))).toBe(true);
  });

  it('a node carrying BOTH a role and head="true" shows both on the chip', () => {
    const ts = '2024-01-01T00:00:00.000Z';
    const doc: KrDocument = {
      schemaVersion: 1,
      id: 'test_role_head',
      title: 'synthetic',
      language: 'grc',
      text: 'λόγος ἦν',
      notes: '',
      createdAt: ts,
      updatedAt: ts,
      layoutHints: {},
      tokens: [
        { id: 't1', index: 0, surface: 'λόγος', language: 'grc', pos: 'noun' },
        { id: 't2', index: 1, surface: 'ἦν', language: 'grc', pos: 'verb' },
      ],
      syntax: {
        rootId: 'cl',
        nodes: [
          { id: 'cl', kind: 'clause', clauseType: 'independent', tokenIds: [] },
          { id: 'w1', kind: 'word', tokenIds: ['t1'] },
          { id: 'w2', kind: 'word', tokenIds: ['t2'] },
        ],
        relations: [
          { id: 'r1', type: 'subject', headId: 'cl', dependentId: 'w1' },
          { id: 'r2', type: 'predicate', headId: 'cl', dependentId: 'w2' },
        ],
      },
      sourceConstituency: {
        sourceId: 'macula-greek-nestle1904-lowfat',
        root: {
          id: 'sc0',
          kind: 'wg',
          cat: 'cl',
          children: [
            { id: 'sc1', kind: 'word', cat: 'noun', role: 's', head: true, tokenIds: ['t1'], children: [] },
            { id: 'sc2', kind: 'word', cat: 'verb', role: 'v', tokenIds: ['t2'], children: [] },
          ],
        },
      },
    };
    const t = texts(doc, 'source');
    expect(t).toContain('s · head');
    expect(t).toContain('v');
  });
});
