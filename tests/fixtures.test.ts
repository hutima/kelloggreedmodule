import { describe, it, expect } from 'vitest';
import { sampleDocuments } from '@/fixtures';
import { KrDocumentSchema } from '@/domain/schema';
import { layoutDocument } from '@/domain/layout';
import { layoutToSvg } from '@/domain/render';

describe('sample fixtures', () => {
  it('bundles all five required samples', () => {
    expect(sampleDocuments).toHaveLength(5);
  });

  for (const doc of sampleDocuments) {
    describe(doc.title, () => {
      it('validates against the schema', () => {
        expect(() => KrDocumentSchema.parse(doc)).not.toThrow();
      });

      it('references only existing tokens and nodes', () => {
        const tokenIds = new Set(doc.tokens.map((t) => t.id));
        const nodeIds = new Set(doc.syntax.nodes.map((n) => n.id));
        for (const node of doc.syntax.nodes) {
          for (const tid of node.tokenIds) expect(tokenIds.has(tid)).toBe(true);
        }
        for (const rel of doc.syntax.relations) {
          expect(nodeIds.has(rel.headId)).toBe(true);
          expect(nodeIds.has(rel.dependentId)).toBe(true);
        }
        expect(nodeIds.has(doc.syntax.rootId)).toBe(true);
      });

      it('produces a non-empty layout and SVG', () => {
        const layout = layoutDocument(doc, doc.layoutHints);
        expect(layout.width).toBeGreaterThan(0);
        expect(layout.height).toBeGreaterThan(0);
        expect(layout.elements.length).toBeGreaterThan(0);
        const svg = layoutToSvg(layout, { standalone: true });
        expect(svg.startsWith('<svg')).toBe(true);
      });
    });
  }
});
