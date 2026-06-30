import { describe, it, expect } from 'vitest';
import { impliedSubjectPronoun } from '@/domain/model';

/**
 * The pronoun imputed for a pro-drop clause's empty subject, read off the finite
 * verb's person + number (Php 2:17 stacks three first-singular verbs → ἐγώ).
 */
describe('impliedSubjectPronoun', () => {
  it('imputes Greek first/second-person pronouns by number', () => {
    expect(impliedSubjectPronoun({ person: 'first', number: 'singular' }, 'grc')).toBe('ἐγώ');
    expect(impliedSubjectPronoun({ person: 'first', number: 'plural' }, 'grc')).toBe('ἡμεῖς');
    expect(impliedSubjectPronoun({ person: 'second', number: 'singular' }, 'grc')).toBe('σύ');
    expect(impliedSubjectPronoun({ person: 'second', number: 'plural' }, 'grc')).toBe('ὑμεῖς');
  });

  it('imputes English pronouns ("you" is number-neutral)', () => {
    expect(impliedSubjectPronoun({ person: 'first', number: 'singular' }, 'en')).toBe('I');
    expect(impliedSubjectPronoun({ person: 'first', number: 'plural' }, 'en')).toBe('we');
    expect(impliedSubjectPronoun({ person: 'second', number: 'singular' }, 'en')).toBe('you');
    expect(impliedSubjectPronoun({ person: 'second', number: 'plural' }, 'en')).toBe('you');
  });

  it('does not impute a third-person or person-less subject', () => {
    expect(impliedSubjectPronoun({ person: 'third', number: 'singular' }, 'grc')).toBeUndefined();
    expect(impliedSubjectPronoun({ number: 'singular' }, 'grc')).toBeUndefined();
    expect(impliedSubjectPronoun(undefined, 'grc')).toBeUndefined();
  });

  it('falls back to a number-bearing plural form for a (rare) dual', () => {
    expect(impliedSubjectPronoun({ person: 'first', number: 'dual' }, 'grc')).toBe('ἡμεῖς');
  });

  it('skips languages whose pronoun choice also needs gender (Hebrew)', () => {
    expect(impliedSubjectPronoun({ person: 'second', number: 'singular' }, 'hbo')).toBeUndefined();
  });
});
