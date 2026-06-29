import { describe, it, expect } from 'vitest';
import { transliterateGreek, transliterationOf } from '@/domain/model/transliterate';
import type { Token } from '@/domain/schema';

describe('Greek transliteration', () => {
  const cases: [string, string][] = [
    ['λόγος', 'logos'],
    ['Θεός', 'Theos'],
    ['ἐν', 'en'], // smooth breathing → no h
    ['ὁ', 'ho'], // rough breathing → h
    ['οἱ', 'hoi'], // rough breathing on initial diphthong
    ['υἱός', 'hyios'], // initial υ + rough → hy
    ['ἅγιος', 'hagios'],
    ['ἄγγελος', 'angelos'], // γγ → ng
    ['εὐαγγέλιον', 'euangelion'], // ευ diphthong + γγ
    ['Χριστός', 'Christos'], // χ → ch
    ['ἀρχή', 'archē'], // η → ē, χ → ch
    ['ψυχή', 'psychē'], // ψ → ps
    ['ἔθνη', 'ethnē'],
    ['ῥῆμα', 'rhēma'], // initial ρ + rough → rh
    ['πνεῦμα', 'pneuma'], // ευ → eu
    ['υἱοῦ', 'hyiou'], // ου → ou
  ];
  it.each(cases)('transliterates %s → %s', (greek, latin) => {
    expect(transliterateGreek(greek)).toBe(latin);
  });

  it('uses a token’s provided (Hebrew) transliteration when present', () => {
    const heb: Token = {
      id: 't1',
      index: 0,
      surface: 'בְּרֵאשִׁית',
      language: 'hbo',
      morphology: { extra: { translit: 'bᵊrēʾšîṯ' } },
    };
    expect(transliterationOf(heb)).toBe('bᵊrēʾšîṯ');
  });

  it('generates a transliteration for a Greek token with none provided', () => {
    const grc: Token = { id: 't2', index: 0, surface: 'λόγος', language: 'grc' };
    expect(transliterationOf(grc)).toBe('logos');
  });

  it('returns nothing for English', () => {
    const en: Token = { id: 't3', index: 0, surface: 'word', language: 'en' };
    expect(transliterationOf(en)).toBeUndefined();
  });
});
