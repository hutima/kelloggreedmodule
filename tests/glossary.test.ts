import { describe, it, expect } from 'vitest';
import { lookupGloss, hasGloss } from '@/domain/model';

/**
 * The glossary backs the "tap a label to learn what it means" detail panel, so a
 * stable set of keys must resolve. Keys are matched case-insensitively.
 */
describe('glossary', () => {
  it('explains the morphology agreement link (agr → agreement)', () => {
    const e = lookupGloss('agreement');
    expect(e?.term).toBe('Agreement');
    expect(e?.abbr).toBe('agr');
    expect(e?.detail).toMatch(/case.*gender.*number/i);
  });

  it('explains dependency roles keyed by their SyntacticRole', () => {
    expect(lookupGloss('subject')?.abbr).toBe('subj');
    expect(lookupGloss('directObject')?.term).toBe('Direct object');
    expect(lookupGloss('prepositionObject')?.term).toMatch(/preposition/i);
    expect(lookupGloss('root')?.term).toBe('Root');
  });

  it('explains discourse connectives and morphology codes', () => {
    expect(lookupGloss('ground')?.term).toMatch(/ground|reason/i);
    expect(lookupGloss('continuation')).toBeDefined();
    expect(lookupGloss('nom')?.term).toBe('Nominative');
    expect(lookupGloss('aor')?.term).toBe('Aorist');
    expect(lookupGloss('ptcp')?.term).toBe('Participle');
  });

  it('is case-insensitive and reports unknown keys', () => {
    expect(lookupGloss('NOM')?.term).toBe('Nominative');
    expect(lookupGloss(undefined)).toBeUndefined();
    expect(hasGloss('subject')).toBe(true);
    expect(hasGloss('definitely-not-a-key')).toBe(false);
  });
});
