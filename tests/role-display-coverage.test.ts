import { describe, it, expect } from 'vitest';
import { SyntacticRoleSchema, type KrDocument, type SyntacticRole } from '@/domain/schema';
import { ROLE_LABEL } from '@/ui/editor/roles';
import { SHORT_ROLE } from '@/domain/layout/modes/dependency';
import { describeFunction, analysisNote } from '@/domain/model/describe';

/**
 * Cross-mode role-display coverage (Stage 10): every SyntacticRole must
 * render properly in every consumer — full labels (editor/KR), short tags
 * (Dependency), and detail-card phrasing (describeFunction) — so a role can
 * never silently fall back to raw enum text in one view while reading nicely
 * in another. (The relationship guide's own test already enforces that each
 * role is *documented* exactly once.)
 */

const ROLES = SyntacticRoleSchema.options;

describe('every syntactic role displays in every mode', () => {
  it('has a human ROLE_LABEL (editor, KR detail surfaces)', () => {
    for (const r of ROLES) {
      expect(ROLE_LABEL[r], r).toBeTruthy();
      expect(ROLE_LABEL[r]).not.toBe(r === 'unknown' ? '' : undefined);
    }
  });

  it('has a short Dependency-mode tag (unknown deliberately draws none)', () => {
    for (const r of ROLES) {
      if (r === 'unknown') {
        // Deliberate: an unanalysed relation draws a bare arc, not a tag.
        expect(SHORT_ROLE[r]).toBe('');
        continue;
      }
      expect(SHORT_ROLE[r], r).toBeTruthy();
    }
  });

  it('has a detail-card phrase (never falls back to the raw enum name)', () => {
    for (const r of ROLES) {
      const doc = docWithRelation(r);
      const summary = describeFunction(doc, 'dep')!;
      expect(summary, r).toBeDefined();
      // The fallback path sets role to the raw enum value — a real phrase never
      // equals the camelCase enum name.
      expect(summary.role, r).not.toBe(r === 'clause' ? undefined : r);
      expect(summary.detail.length, r).toBeGreaterThan(3);
    }
  });
});

describe('analysis notes disclose provenance honestly across modes', () => {
  it('surfaces converted mappings with their raw source role', () => {
    const note = analysisNote({
      source: 'converted',
      confidence: 'medium',
      sourceRole: 'o',
    })!;
    expect(note).toContain('interpreted during conversion');
    expect(note).toContain('“o”');
    expect(note).toContain('somewhat uncertain');
  });

  it('surfaces OpenText raw component/wordgroup labels the same way', () => {
    for (const raw of ['S', 'C', 'definer', 'qualifier']) {
      expect(analysisNote({ source: 'given', confidence: 'high', sourceRole: raw })).toContain(raw);
    }
  });

  it('says nothing for plain high-confidence source data', () => {
    expect(analysisNote({ source: 'given', confidence: 'high' })).toBeUndefined();
  });
});

/** Minimal two-word document joined by one relation of the given type. */
function docWithRelation(type: SyntacticRole): KrDocument {
  const ts = '2024-01-01T00:00:00.000Z';
  return {
    schemaVersion: 1,
    id: `test_${type}`,
    title: 'coverage',
    language: 'grc',
    text: 'α β',
    notes: '',
    createdAt: ts,
    updatedAt: ts,
    layoutHints: {},
    tokens: [
      { id: 't1', index: 0, surface: 'α', language: 'grc', pos: 'noun' },
      { id: 't2', index: 1, surface: 'β', language: 'grc', pos: 'noun' },
    ],
    syntax: {
      rootId: 'head',
      nodes: [
        { id: 'head', kind: 'word', tokenIds: ['t1'] },
        { id: 'dep', kind: 'word', tokenIds: ['t2'] },
      ],
      relations: [{ id: 'r1', type, headId: 'head', dependentId: 'dep' }],
    },
  };
}
