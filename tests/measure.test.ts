import { describe, it, expect } from 'vitest';
import { measureText, BASE_FONT, SMALL_FONT } from '@/domain/layout/measure';

const em = (n: number, ratio = BASE_FONT.avgCharRatio) => n * ratio * BASE_FONT.fontSize;

describe('measureText', () => {
  it('measures Latin text at the average character ratio', () => {
    expect(measureText('abc')).toBeCloseTo(em(3));
  });

  it('never returns less than one average glyph (empty string)', () => {
    expect(measureText('')).toBeCloseTo(em(1));
  });

  it('respects the font metrics argument', () => {
    expect(measureText('abc', SMALL_FONT)).toBeCloseTo(
      3 * SMALL_FONT.avgCharRatio * SMALL_FONT.fontSize,
    );
  });

  describe('East Asian wide glyphs (~1 em advance)', () => {
    it('measures CJK ideographs a full em wide', () => {
      // 神的道 — three ideographs advance ~3 em, not 3 × 0.58 em.
      expect(measureText('神的道')).toBeCloseTo(3 * BASE_FONT.fontSize);
    });

    it('covers ext-A ideographs, kana, Hangul, CJK punctuation and fullwidth forms', () => {
      // 㐀 (ext A), あ (hiragana), カ (katakana), 한 (Hangul syllable),
      // 。 (CJK full stop), Ａ (fullwidth A), ￥ (fullwidth yen).
      for (const ch of ['㐀', 'あ', 'カ', '한', '。', 'Ａ', '￥']) {
        expect(measureText(ch)).toBeCloseTo(BASE_FONT.fontSize);
      }
    });

    it('mixes wide and narrow advances in one string', () => {
      // "God 神" = 4 narrow (G-o-d-space) + 1 wide.
      expect(measureText('God 神')).toBeCloseTo(em(4) + BASE_FONT.fontSize);
    });
  });

  describe('zero-width combining marks & joiners', () => {
    it('ignores Greek combining accents', () => {
      // α + combining acute measures like a bare α.
      expect(measureText('ά')).toBeCloseTo(measureText('α'));
    });

    it('ignores Hebrew niqqud', () => {
      // ב + sheva + dagesh measures like a bare ב.
      expect(measureText('בְּ')).toBeCloseTo(measureText('ב'));
    });

    it('ignores Arabic harakat, superscript alef and Koranic annotation marks', () => {
      // ب + kasra, س + sukun — the marks stack, only the letters advance.
      expect(measureText('بِسْ')).toBeCloseTo(
        measureText('بس'),
      );
      // Fathatan (064B), superscript alef (0670) and one mark from each
      // Koranic annotation run (06D6 / 06DF / 06E7 / 06EA).
      for (const mark of ['ً', 'ٰ', 'ۖ', '۟', 'ۧ', '۪']) {
        expect(measureText(`ب${mark}`)).toBeCloseTo(measureText('ب'));
      }
    });

    it('still counts visible Arabic marks (end of ayah, small high waw)', () => {
      // 06DD (end of ayah) and 06E5 (small waw) DO advance — not combining.
      expect(measureText('ب۝')).toBeCloseTo(em(2));
      expect(measureText('بۥ')).toBeCloseTo(em(2));
    });

    it('ignores ZWNJ and ZWJ', () => {
      expect(measureText('a‌b')).toBeCloseTo(measureText('ab'));
      expect(measureText('a‍b')).toBeCloseTo(measureText('ab'));
    });
  });
});
