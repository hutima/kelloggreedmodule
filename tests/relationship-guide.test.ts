import { describe, it, expect } from 'vitest';
import { RELATIONSHIP_GUIDE, DOCUMENTED_ROLES, relationshipGloss } from '@/ui/editor/relationshipGuide';
import { SyntacticRoleSchema } from '@/domain/schema';

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
});
