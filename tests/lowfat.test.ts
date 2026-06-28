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

  it('renders to a non-empty diagram', () => {
    const [v1] = lowfatToDocuments(xml());
    const layout = layoutDocument(v1!, {});
    expect(layout.elements.length).toBeGreaterThan(10);
    expect(layout.width).toBeGreaterThan(0);
  });
});
