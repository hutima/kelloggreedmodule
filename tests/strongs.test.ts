import { describe, it, expect } from 'vitest';
import { searchStrongs, type StrongsEntry } from '@/io/strongs';

const nfc = (s: string) => s.normalize('NFC');

const LEX: StrongsEntry[] = [
  { strong: '1401', language: 'grc', lemma: 'δοῦλος', translit: 'doûlos', gloss: 'a slave', kjv: 'bond, servant' },
  { strong: '1401b', language: 'grc', lemma: 'δουλόω', translit: 'doulóō', gloss: 'to enslave', kjv: 'servant' },
  { strong: '25', language: 'grc', lemma: 'ἀγαπάω', translit: 'agapáō', gloss: 'to love', kjv: 'love' },
  { strong: '3056', language: 'grc', lemma: 'λόγος', translit: 'lógos', gloss: 'something said', kjv: 'word, saying' },
];

describe('searchStrongs', () => {
  it('finds an entry by exact Strong’s number, ranked first, then by prefix', () => {
    const exact = searchStrongs(LEX, '1401');
    expect(exact[0]!.strong).toBe('1401');
    // "140" is a prefix of 1401 → matches both 1401 and 1401b.
    const pref = searchStrongs(LEX, '140').map((e) => e.strong);
    expect(pref).toEqual(expect.arrayContaining(['1401', '1401b']));
  });

  it('finds by lemma accent-insensitively (Greek), exact before substring', () => {
    const hits = searchStrongs(LEX, 'δουλος'); // unaccented
    expect(nfc(hits[0]!.lemma)).toBe(nfc('δοῦλος')); // exact lemma ranks first
  });

  it('finds by transliteration', () => {
    expect(searchStrongs(LEX, 'logos')[0]!.strong).toBe('3056');
    expect(searchStrongs(LEX, 'agapao')[0]!.strong).toBe('25');
  });

  it('finds by gloss and by KJV rendering (English)', () => {
    // "slave" is in δοῦλος's gloss; "servant" is in its KJV terms (and δουλόω's).
    expect(searchStrongs(LEX, 'slave').map((e) => e.strong)).toContain('1401');
    const servant = searchStrongs(LEX, 'servant').map((e) => e.strong);
    expect(servant).toEqual(expect.arrayContaining(['1401', '1401b']));
    expect(searchStrongs(LEX, 'word')[0]!.strong).toBe('3056');
  });

  it('returns nothing for an empty query, and respects the cap', () => {
    expect(searchStrongs(LEX, '   ')).toEqual([]);
    expect(searchStrongs(LEX, 'o', 1)).toHaveLength(1); // "o" matches several; cap = 1
  });
});
