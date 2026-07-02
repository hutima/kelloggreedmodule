import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openTextToDocuments } from '@/io/opentext';
import { layoutForMode } from '@/domain/layout';
import type { KrDocument, SourceConstituencyNode } from '@/domain/schema';
import { validateSourceConstituency } from './helpers/validateSourceConstituency';

/**
 * OpenText source constituency (Stage 8): the CLAUSE layer — clauses and
 * their S/P/C/A components — is preserved verbatim as a source constituency
 * tree, with the source's own labels (never app roles). The wordgroup
 * layer's phrase-internal nesting is deliberately NOT folded in (a parallel
 * standoff structure; documented in io/opentext.ts), so what the tree claims
 * is exactly what the clause layer publishes.
 */

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), `public/opentext/philemon/${p}`), 'utf8');

const docs = (): KrDocument[] =>
  openTextToDocuments(
    read('base/philemon.xml'),
    read('wordgroup/philemon-wg-ch1.xml'),
    read('clause/philemon-cl-ch1.xml'),
    { book: 'Philemon' },
  );

const flatten = (n: SourceConstituencyNode): SourceConstituencyNode[] => [
  n,
  ...n.children.flatMap(flatten),
];

describe('OpenText clause-layer source constituency', () => {
  it('is captured for every Philemon clause and validates structurally', () => {
    const all = docs();
    expect(all.length).toBeGreaterThan(0);
    for (const doc of all) {
      expect(doc.sourceConstituency?.sourceId).toBe('opentext');
      const { errors } = validateSourceConstituency(doc);
      expect(errors, `${doc.title}: ${errors.join('; ')}`).toEqual([]);
    }
  });

  it('labels components with the raw OpenText vocabulary (S/P/C/A), never app roles', () => {
    const doc = docs()[0]!;
    const roles = new Set(
      flatten(doc.sourceConstituency!.root)
        .map((n) => n.role)
        .filter(Boolean),
    );
    // Whatever appears must come from the source's own label set.
    for (const r of roles) expect(['S', 'P', 'C', 'A', 'add', 'conj']).toContain(r);
  });

  it('never carries Lowfat-only metadata (rule/articular/head) OpenText does not publish', () => {
    for (const doc of docs()) {
      for (const n of flatten(doc.sourceConstituency!.root)) {
        expect(n.rule).toBeUndefined();
        expect(n.articular).toBeUndefined();
        expect(n.head).toBeUndefined();
      }
    }
  });

  it('drives the Constituency Tree in Auto mode with an honest OpenText caption', () => {
    const doc = docs()[0]!;
    const texts = layoutForMode('constituency', doc, {}, {})
      .elements.filter((e): e is Extract<typeof e, { kind: 'text' }> => e.kind === 'text')
      .map((e) => e.text);
    expect(texts.some((x) => x.includes('Source constituency: OpenText'))).toBe(true);
  });
});

describe('OpenText role provenance preserves the raw source labels', () => {
  it('stamps sourceRole on clause-component and wordgroup-modifier relations', () => {
    const all = docs();
    const rels = all.flatMap((d) => d.syntax.relations);
    // Subjects come from cl.s ("S"); complements are interpretive conversions of "C".
    expect(rels.some((r) => r.type === 'subject' && r.provenance?.sourceRole === 'S')).toBe(true);
    const complement = rels.find((r) => r.provenance?.sourceRole === 'C');
    expect(complement).toBeDefined();
    expect(complement!.provenance!.source).toBe('converted');
    // Wordgroup modifier edges keep their OpenText role names.
    expect(
      rels.some((r) => ['definer', 'specifier', 'qualifier'].includes(r.provenance?.sourceRole ?? '')),
    ).toBe(true);
  });
});
