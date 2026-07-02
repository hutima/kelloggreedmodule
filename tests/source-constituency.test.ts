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
