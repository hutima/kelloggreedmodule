import { describe, it, expect } from 'vitest';
import {
  classifyLowfatRule,
  isClauseCoordinationRule,
  isCoordinationRule,
  isPhraseCoordinationRule,
  normalizeLowfatClauseRole,
} from '@/io/lowfat';

/**
 * Behavior-pinning tests for the named Lowfat rule helpers (Stage 4 refactor
 * — pure extraction, no behavior change). These encode the hard-won rule
 * semantics from the Mark 1:19–20 and Col 1:16 fixes so a future edit to the
 * classifiers cannot silently reintroduce them.
 */

describe('isCoordinationRule / classifyLowfatRule', () => {
  it('recognizes Conj-headed, a-infix, and asyndetic coordination rules', () => {
    for (const r of ['Conj2Pp', 'Conj3Np', 'Conj2VP', 'Conj-CL', 'NpaNp', 'aNpaNp', 'aPpaPp', '2PpaPp', 'CLaCL', 'AdjpaAdjp', 'NpNpNp', 'PpPp']) {
      expect(isCoordinationRule(r), r).toBe(true);
    }
  });

  it('does NOT treat every lowercase "a" as the coordinator καί', () => {
    // QuanPp is a quantifier modified by a PP (Col 1:16 πάντα … ἐν τοῖς
    // οὐρανοῖς), NOT a coordination — the regression behind PR #192.
    for (const r of ['QuanPp', 'NpPp', 'AdjpNp', 'NpAdjp', 'Np-Appos', 'DetNP', 'PpNp2Np', 'NPofNP']) {
      expect(isCoordinationRule(r), r).toBe(false);
    }
  });

  it('separates phrase-level from clause-level coordination', () => {
    // Classless SBLGNT phrase coordinations (Mark 1:19–20) route to phrase
    // conversion; clause/vp coordinations stay clauses.
    expect(isPhraseCoordinationRule('NpaNp')).toBe(true);
    expect(isPhraseCoordinationRule('2PpaPp')).toBe(true);
    expect(isPhraseCoordinationRule('CLaCL')).toBe(false);
    expect(isPhraseCoordinationRule('Conj2VP')).toBe(false);
    expect(isPhraseCoordinationRule('Conj-CL')).toBe(false);
    expect(isPhraseCoordinationRule('')).toBe(false);
    expect(isClauseCoordinationRule('CLaCL')).toBe(true);
    expect(isClauseCoordinationRule('Conj-CL')).toBe(true);
    expect(isClauseCoordinationRule('NpaNp')).toBe(false);
  });

  it('classifies contrastive, apposition, and genitive rules', () => {
    expect(classifyLowfatRule('notPPbutPP').contrastive).toBe(true);
    expect(classifyLowfatRule('Conj2Pp').contrastive).toBe(false);
    expect(classifyLowfatRule('Np-Appos').apposition).toBe(true);
    expect(classifyLowfatRule('NPofNP').genitive).toBe(true);
    expect(classifyLowfatRule('ofNPNP').genitive).toBe(true);
    expect(classifyLowfatRule('DetNP').apposition).toBe(false);
    expect(classifyLowfatRule('DetNP').genitive).toBe(false);
  });
});

describe('normalizeLowfatClauseRole', () => {
  const ctx = { passiveVerb: false, accusative: false, isPp: false, isAdjective: false };

  it('maps the explicit clause roles directly', () => {
    expect(normalizeLowfatClauseRole('s', ctx)).toEqual({ type: 'subject', attachTo: 'clause' });
    expect(normalizeLowfatClauseRole('o', ctx)).toEqual({ type: 'directObject', attachTo: 'verb' });
    expect(normalizeLowfatClauseRole('o2', ctx)).toEqual({ type: 'objectComplement', attachTo: 'verb' });
    expect(normalizeLowfatClauseRole('io', ctx)).toEqual({ type: 'indirectObject', attachTo: 'verb' });
    expect(normalizeLowfatClauseRole('adv', ctx)).toEqual({ type: 'adverbial', attachTo: 'verb' });
    expect(normalizeLowfatClauseRole(null, ctx)).toEqual({ type: 'adjunct', attachTo: 'clause' });
  });

  it('downgrades a passive verb\'s accusative "o" to accusativeModifier, honestly stamped', () => {
    const passive = normalizeLowfatClauseRole('o', { ...ctx, passiveVerb: true, accusative: true });
    expect(passive.type).toBe('accusativeModifier');
    expect(passive.provenance).toEqual({ source: 'converted', confidence: 'medium', sourceRole: 'o' });
    // A passive verb with a NON-accusative dependent, or an active verb with an
    // accusative, keeps the ordinary object — only the exact Mark 5:26 shape downgrades.
    expect(normalizeLowfatClauseRole('o', { ...ctx, passiveVerb: true }).type).toBe('directObject');
    expect(normalizeLowfatClauseRole('o', { ...ctx, accusative: true }).type).toBe('directObject');
  });

  it('routes predicate complements by shape: PP → adverbial, adjective → predicateAdjective', () => {
    expect(normalizeLowfatClauseRole('p', { ...ctx, isPp: true }).type).toBe('adverbial');
    expect(normalizeLowfatClauseRole('p', { ...ctx, isAdjective: true }).type).toBe('predicateAdjective');
    expect(normalizeLowfatClauseRole('p', ctx).type).toBe('predicateNominative');
  });
});
