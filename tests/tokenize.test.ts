import { describe, it, expect } from 'vitest';
import { tokenize, detectLanguage } from '@/domain/model';

describe('tokenize', () => {
  it('splits space-delimited text on whitespace, keeping trailing punctuation', () => {
    const tokens = tokenize('The Word became flesh.', 'en');
    expect(tokens.map((t) => t.surface)).toEqual(['The', 'Word', 'became', 'flesh.']);
    // Indices record surface order.
    expect(tokens.map((t) => t.index)).toEqual([0, 1, 2, 3]);
    expect(tokens.every((t) => t.language === 'en')).toBe(true);
  });

  it('preserves polytonic Greek words (combining diacritics stay attached)', () => {
    const tokens = tokenize('Ἐν ἀρχῇ ἦν ὁ λόγος', 'grc');
    expect(tokens.map((t) => t.surface)).toEqual(['Ἐν', 'ἀρχῇ', 'ἦν', 'ὁ', 'λόγος']);
  });

  it('segments a space-less Chinese sentence into multiple words', () => {
    // The reported regression: a scriptio-continua sentence used to become one
    // giant token. It must now break into several words.
    const tokens = tokenize('枪杆子里面出政权', 'zh');
    expect(tokens.length).toBeGreaterThan(1);
    // No character is dropped — the words concatenate back to the input.
    expect(tokens.map((t) => t.surface).join('')).toBe('枪杆子里面出政权');
    // Sequential surface indices are assigned to the segmented words.
    expect(tokens.map((t) => t.index)).toEqual(tokens.map((_, i) => i));
  });

  it('segments Japanese (kana + kanji) without spaces', () => {
    const tokens = tokenize('私は本を読む');
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.map((t) => t.surface).join('')).toBe('私は本を読む');
  });

  it('segments only the space-less runs in mixed text', () => {
    const tokens = tokenize('Hello 世界');
    // "Hello" stays whole; the Han run is segmented (here as one dictionary word).
    expect(tokens[0]?.surface).toBe('Hello');
    expect(tokens.slice(1).map((t) => t.surface).join('')).toBe('世界');
  });

  it('returns no tokens for blank input', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('detectLanguage', () => {
  it('detects Greek, Hebrew, and English by dominant script', () => {
    expect(detectLanguage('Ἐν ἀρχῇ ἦν ὁ λόγος')).toBe('grc');
    expect(detectLanguage('בְּרֵאשִׁית בָּרָא אֱלֹהִים')).toBe('hbo');
    expect(detectLanguage('In the beginning')).toBe('en');
  });

  it('labels a space-less Chinese sentence zh (so it is not treated as English)', () => {
    expect(detectLanguage('枪杆子里面出政权')).toBe('zh');
  });

  it('labels Japanese ja when kana is present', () => {
    expect(detectLanguage('私は本を読む')).toBe('ja');
  });
});
