import type { Direction, Language, Token } from '@/domain/schema';
import { makeId } from './ids';

/**
 * Splits raw sentence text into surface tokens. Unicode-aware so polytonic
 * Greek (with combining diacritics) is preserved intact. Trailing punctuation
 * is kept attached to the word for now; the editor lets the user split/merge.
 *
 * Whitespace splitting alone handles space-delimited scripts (English, Greek,
 * Hebrew), but leaves a SCRIPTIO-CONTINUA sentence — Chinese, Japanese, Thai,
 * and other space-less scripts — as one giant "word". Each such run is therefore
 * handed to {@link segmentSurface} for dictionary-based word segmentation, so
 * those languages tokenize at all (e.g. 枪杆子里面出政权 → 枪·杆子·里面·出·政权).
 *
 * This only establishes surface order — it makes no syntactic claims.
 */
export function tokenize(text: string, language?: Language): Token[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Split on whitespace (keeping combining marks), then sub-segment any run of a
  // space-less script into individual words.
  const surfaces = trimmed.split(/\s+/u).flatMap(segmentSurface);
  return surfaces.map((surface, index) => ({
    id: makeId('tok'),
    index,
    surface,
    language,
    provenance: { source: 'given' as const, confidence: 'high' as const },
  }));
}

/**
 * Scripts written in SCRIPTIO CONTINUA — no spaces between words. Han covers
 * Chinese and the shared Japanese ideographs; Hiragana/Katakana are the rest of
 * Japanese; Thai, Lao, Khmer and Myanmar are the major space-less abugidas. A
 * whitespace-delimited piece containing any of these is word-segmented instead
 * of taken whole.
 */
const SCRIPTIO_CONTINUA =
  /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}]/u;

/** Minimal local typing for `Intl.Segmenter` (absent from the ES2022 lib). */
interface WordSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}
type SegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
) => WordSegmenter;

let cachedSegmenter: WordSegmenter | null | undefined;

/**
 * A word-granularity `Intl.Segmenter`, memoised. Returns null when the platform
 * lacks it (older runtimes), so callers fall back to a per-character split.
 */
function getWordSegmenter(): WordSegmenter | null {
  if (cachedSegmenter !== undefined) return cachedSegmenter;
  const ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  try {
    cachedSegmenter = typeof ctor === 'function' ? new ctor(undefined, { granularity: 'word' }) : null;
  } catch {
    cachedSegmenter = null;
  }
  return cachedSegmenter;
}

/**
 * Break one whitespace-delimited piece into surface words. Space-delimited
 * scripts pass through unchanged (one piece = one word, punctuation still
 * attached). A piece in a space-less script is segmented with Intl.Segmenter,
 * degrading to a per-code-point split when it is unavailable — so no character
 * is ever dropped and the diagram is always whole.
 */
function segmentSurface(piece: string): string[] {
  if (!piece) return [];
  if (!SCRIPTIO_CONTINUA.test(piece)) return [piece];
  const segmenter = getWordSegmenter();
  if (segmenter) {
    const out: string[] = [];
    for (const { segment } of segmenter.segment(piece)) {
      if (segment.trim()) out.push(segment);
    }
    if (out.length) return out;
  }
  return [...piece].filter((c) => c.trim());
}

/** Reassigns sequential indices after tokens are added/removed/reordered. */
export function reindex(tokens: Token[]): Token[] {
  return tokens.map((t, i) => ({ ...t, index: i }));
}

/**
 * Detect the language of a sentence from its DOMINANT script — Koine Greek,
 * Biblical Hebrew, Chinese, Japanese, or English (the default). Each language
 * uses a disjoint Unicode block, so this is unambiguous for whole-sentence input
 * and lets the UI skip an error-prone language dropdown (a stray Greek word in an
 * English gloss, or vice versa, can't flip the result because we count the
 * majority script). CJK is distinguished so a space-less sentence is labelled and
 * laid out (left-to-right) correctly rather than defaulting to English.
 */
export function detectLanguage(text: string): Language {
  let greek = 0;
  let hebrew = 0;
  let latin = 0;
  let han = 0;
  let kana = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    // Greek and Coptic (0370–03FF) + Greek Extended / polytonic (1F00–1FFF).
    if ((c >= 0x0370 && c <= 0x03ff) || (c >= 0x1f00 && c <= 0x1fff)) greek++;
    // Hebrew block (0590–05FF).
    else if (c >= 0x0590 && c <= 0x05ff) hebrew++;
    // Basic Latin letters.
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
    // CJK ideographs — shared by Chinese and Japanese.
    else if (
      (c >= 0x4e00 && c <= 0x9fff) || // CJK Unified Ideographs
      (c >= 0x3400 && c <= 0x4dbf) || // CJK Extension A
      (c >= 0xf900 && c <= 0xfaff) || // CJK Compatibility Ideographs
      (c >= 0x20000 && c <= 0x2ffff) // CJK Extensions B and beyond
    )
      han++;
    // Kana — Japanese only, so its presence disambiguates ideographs from Chinese.
    else if ((c >= 0x3040 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff)) kana++;
  }
  const cjk = han + kana;
  // A CJK-dominant sentence: Japanese if any kana is present, else Chinese.
  if (cjk > greek && cjk > hebrew && cjk > latin) return kana > 0 ? 'ja' : 'zh';
  if (greek >= hebrew && greek > latin) return 'grc';
  if (hebrew > greek && hebrew > latin) return 'hbo';
  return 'en';
}

/** Language codes that are written RIGHT-TO-LEFT (used when no script is present). */
const RTL_LANGUAGES = new Set([
  'hbo', 'he', 'iw', 'yi', 'ar', 'fa', 'ur', 'ps', 'sd', 'ug', 'ckb', 'dv', 'syr', 'arc', 'nqo',
]);

/** Whether a language CODE denotes a right-to-left script. */
export function isRtlLanguage(language: string | undefined): boolean {
  return !!language && RTL_LANGUAGES.has(language.toLowerCase());
}

/**
 * Detect the writing direction of `text` from its DOMINANT script — right-to-left
 * for Hebrew, Arabic, Syriac, Thaana, N'Ko (and their presentation forms), else
 * left-to-right. Lets Hebrew/Arabic sentences (and future Quran analysis) lay out
 * in the correct direction regardless of the coarse language bucket.
 */
export function detectDirection(text: string): Direction {
  let rtl = 0;
  let ltr = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const isRtl =
      (c >= 0x0590 && c <= 0x05ff) || // Hebrew
      (c >= 0x0600 && c <= 0x06ff) || // Arabic
      (c >= 0x0700 && c <= 0x074f) || // Syriac
      (c >= 0x0750 && c <= 0x077f) || // Arabic Supplement
      (c >= 0x0780 && c <= 0x07bf) || // Thaana
      (c >= 0x07c0 && c <= 0x07ff) || // N'Ko
      (c >= 0x08a0 && c <= 0x08ff) || // Arabic Extended-A
      (c >= 0xfb1d && c <= 0xfb4f) || // Hebrew presentation forms
      (c >= 0xfb50 && c <= 0xfdff) || // Arabic presentation forms-A
      (c >= 0xfe70 && c <= 0xfeff); // Arabic presentation forms-B
    const isLtr = (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x0370 && c <= 0x03ff);
    if (isRtl) rtl++;
    else if (isLtr) ltr++;
  }
  return rtl > ltr ? 'rtl' : 'ltr';
}

/** The effective direction of a document — its explicit `direction`, else inferred. */
export function docDirection(doc: { direction?: Direction; language?: string; text?: string }): Direction {
  if (doc.direction) return doc.direction;
  if (isRtlLanguage(doc.language)) return 'rtl';
  return doc.text ? detectDirection(doc.text) : 'ltr';
}

/**
 * Sentence punctuation the editions add editorially — periods, commas, colons,
 * the Greek ano teleia (·) and question mark (;), dashes, quotes, brackets. A
 * word-internal ELISION apostrophe (ἀλλ') is deliberately NOT stripped: it is
 * part of the word, not sentence punctuation. Used by the "infer punctuation"
 * export option so the model proposes its own breaks/attachments.
 */
const SENTENCE_PUNCT = /[.,:;!?·…—–‑―«»"“”„‟()[\]{}··;‐]/g;

/** Strip editorial sentence punctuation from `text`, collapsing whitespace. */
export function stripPunctuation(text: string): string {
  return text.replace(SENTENCE_PUNCT, ' ').replace(/\s+/g, ' ').trim();
}
