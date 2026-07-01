import { describe, it, expect } from 'vitest';
import {
  RELATIONSHIP_GUIDE,
  DOCUMENTED_ROLES,
  ROLE_DEMOS,
  buildDemoDoc,
  relationshipGloss,
} from '@/ui/editor/relationshipGuide';
import { KrDocumentSchema, SyntacticRoleSchema } from '@/domain/schema';
import { layoutForMode } from '@/domain/layout';
import { layoutToSvg } from '@/domain/render';

/**
 * The detailed relationship reference must stay in lock-step with the schema: if
 * a new SyntacticRole is added, the guide has to document it (definition, example,
 * and how it draws in both lenses) — this test fails until it does.
 */
describe('relationship guide', () => {
  it('documents EVERY SyntacticRole exactly once', () => {
    const documented = [...DOCUMENTED_ROLES].sort();
    const all = [...SyntacticRoleSchema.options].sort();
    expect(documented).toEqual(all);
    // no duplicates
    expect(new Set(DOCUMENTED_ROLES).size).toBe(DOCUMENTED_ROLES.length);
  });

  it('gives each role a definition, an example, and both diagram treatments', () => {
    for (const family of RELATIONSHIP_GUIDE) {
      for (const doc of family.roles) {
        const gloss = relationshipGloss(doc.role);
        expect(gloss.term, `${doc.role} term`).toBeTruthy();
        expect(gloss.detail.length, `${doc.role} definition`).toBeGreaterThan(10);
        expect(doc.example.length, `${doc.role} example`).toBeGreaterThan(3);
        expect(doc.kr.length, `${doc.role} Kellogg-Reed treatment`).toBeGreaterThan(10);
        expect(doc.tree.length, `${doc.role} dependency-tree treatment`).toBeGreaterThan(5);
      }
    }
  });

  it('has balanced **emphasis** markers in every example', () => {
    for (const family of RELATIONSHIP_GUIDE) {
      for (const doc of family.roles) {
        const stars = (doc.example.match(/\*\*/g) ?? []).length;
        expect(stars % 2, `${doc.role} example: "${doc.example}"`).toBe(0);
      }
    }
  });

  it('builds a valid, renderable KR + dependency diagram from every role demo', () => {
    for (const [role, demo] of Object.entries(ROLE_DEMOS)) {
      const doc = buildDemoDoc(demo!);
      // the demo really exercises the role it illustrates
      expect(doc.syntax.relations.some((r) => r.type === role), `demo for ${role}`).toBe(true);
      // it validates against the real schema
      expect(KrDocumentSchema.safeParse(doc).success, `${role} schema`).toBe(true);
      // and both lenses render to non-empty SVG without throwing
      for (const mode of ['kellogg-reed', 'dependency'] as const) {
        const svg = layoutToSvg(layoutForMode(mode, doc));
        expect(svg.startsWith('<svg'), `${role} ${mode}`).toBe(true);
      }
    }
  });

  it('only demos roles that are actually documented', () => {
    for (const role of Object.keys(ROLE_DEMOS)) {
      expect(DOCUMENTED_ROLES).toContain(role);
    }
  });
});
