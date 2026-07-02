import type {
  DiscourseDocument,
  DiscourseToken,
  DiscourseUnit,
  Provenance,
} from '@/domain/schema';

/**
 * PLAINTEXT → DISCOURSE builder. The Discourse "New text" entry: paste arbitrary
 * prose, tokenize it, split it into sentence units, and load it directly as a
 * `DiscourseDocument` — WITHOUT an LLM prompt, without a syntax parse, and
 * without creating any `KrDocument`.
 *
 * It is pure and deterministic: ids derive from a hash of the normalized text
 * plus sentence/word index, so re-loading the SAME text rebuilds the same ids
 * and the same base fingerprint (user patches survive a reload). No discourse
 * markers, suggestions, original-language links, lemmas, morphology, or Strong's
 * are invented — plaintext is exactly the words the user pasted.
 */

export interface BuildPlainTextDiscourseOptions {
  /** Optional document title; defaults to the opening words. */
  title?: string;
  /** Language tag for the document; defaults to a light script detection. */
  language?: string;
  /** Clock injection for deterministic tests. */
  now?: string;
}

const GIVEN: Provenance = {
  source: 'given',
  confidence: 'high',
  reason: 'Generated from pasted plaintext sentence boundaries.',
};

/** Sentence-final punctuation: `.?!`, Greek `;`(U+037E)/`·`(U+0387), Hebrew sof pasuq `׃`(U+05C3). */
const SENTENCE_FINAL = '.!?;·׃';
const SENTENCE_RE = new RegExp(`[^${SENTENCE_FINAL}]*[${SENTENCE_FINAL}]+["'”’»)\\]]*`, 'gu');

/** djb2 hash of a string → base36, matching the app's other cheap fingerprints. */
function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Collapse whitespace so the id-hash is stable across trivial spacing changes. */
function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Split text into sentence strings. Blank lines are paragraph boundaries; within
 * a paragraph, breaks fall after runs of sentence-final punctuation. Trailing
 * text with no terminal punctuation becomes a final sentence. Deterministic;
 * punctuation stays attached to its sentence.
 */
export function splitPlainTextSentences(text: string): string[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n\s*\n+/);
  const sentences: string[] = [];
  for (const para of paragraphs) {
    const flat = para.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (!flat) continue;
    SENTENCE_RE.lastIndex = 0;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SENTENCE_RE.exec(flat)) !== null) {
      const s = m[0].trim();
      if (s) sentences.push(s);
      lastIndex = SENTENCE_RE.lastIndex;
    }
    const tail = flat.slice(lastIndex).trim();
    if (tail) sentences.push(tail);
  }
  return sentences;
}

/** Light script detection: Greek → grc, Hebrew → hbo, otherwise en. */
function detectLanguage(text: string): string {
  if (/[Ͱ-Ͽἀ-῿]/.test(text)) return 'grc';
  if (/[֐-׿]/.test(text)) return 'hbo';
  return 'en';
}

/** Opening words of the text, for a default title. */
function openingTitle(sentences: string[]): string {
  const first = sentences[0] ?? '';
  const words = first.split(/\s+/u).filter(Boolean).slice(0, 6).join(' ');
  return words ? (words.length < first.length ? `${words}…` : words) : 'Pasted text';
}

/**
 * Build a `DiscourseDocument` directly from pasted plaintext. Each sentence is a
 * leaf unit; tokens are the whitespace-split words (punctuation attached). No
 * markers or suggestions are generated. Returns `null` when the text has no
 * words at all (nothing to load).
 */
export function buildDiscourseDocumentFromPlainText(
  rawText: string,
  opts: BuildPlainTextDiscourseOptions = {},
): DiscourseDocument | null {
  const normalized = normalizeText(rawText);
  const sentences = splitPlainTextSentences(normalized);
  if (!sentences.length) return null;

  const now = opts.now ?? new Date().toISOString();
  const language = opts.language ?? detectLanguage(normalized);
  const hash = hashText(normalized);
  const sourceDocId = `custom_${hash}`;

  const tokens: DiscourseToken[] = [];
  const units: DiscourseUnit[] = [];
  sentences.forEach((sentence, si) => {
    const words = sentence.split(/\s+/u).filter(Boolean);
    const tokenIds: string[] = [];
    words.forEach((surface, wi) => {
      const id = `${sourceDocId}_s${si}_w${wi}`;
      tokenIds.push(id);
      tokens.push({ id, surface, ref: '', sourceDocId });
    });
    if (!tokenIds.length) return;
    units.push({
      id: `du_${sourceDocId}_s${si}`,
      kind: 'sentence',
      refStart: '',
      refEnd: '',
      tokenIds,
      sourceDocIds: [sourceDocId],
      order: units.length,
      depth: 0,
      provenance: GIVEN,
    });
  });
  if (!units.length) return null;

  const title = opts.title?.trim() || openingTitle(sentences);
  const id = `disc_custom_${hash}`;

  return {
    schemaVersion: 1,
    id,
    sourceDocIds: [sourceDocId],
    sourceId: 'custom-plaintext',
    editionId: 'plaintext',
    language,
    title,
    range: { book: title, startRef: '', endRef: '' },
    granularity: 'sentence',
    text: sentences.join(' '),
    tokens,
    units,
    relations: [],
    markers: [],
    suggestions: [],
    layoutHints: {},
    provenance: {
      source: 'given',
      confidence: 'high',
      reason: 'Loaded from pasted plaintext; discourse structure is user-authored.',
    },
    createdAt: now,
    updatedAt: now,
  };
}
