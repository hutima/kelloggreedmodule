import { describe, it, expect } from 'vitest';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';
import {
  foldAccents,
  hasAccents,
  isEmptyQuery,
  matchToken,
  searchCorpus,
  searchLexemes,
  searchPassages,
  SEARCH_RESULT_CAP,
  type CorpusProgress,
  type SearchQuery,
} from '@/domain/model/search';

/**
 * A minimal Greek sentence: an article + noun subject and one finite verb, with
 * full morphology so the morphological filters have something to bite on.
 */
function sentence(id: string, title: string): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1,
    id,
    title,
    language: 'grc',
    text: 'ὁ λόγος ἦν',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {},
    tokens: [
      { id: `${id}-t0`, index: 0, surface: 'ὁ', lemma: 'ὁ', language: 'grc', pos: 'article',
        morphology: { case: 'nominative', gender: 'masculine', number: 'singular' } },
      { id: `${id}-t1`, index: 1, surface: 'λόγος', lemma: 'λόγος', language: 'grc', pos: 'noun',
        gloss: 'word', morphology: { case: 'nominative', gender: 'masculine', number: 'singular' } },
      { id: `${id}-t2`, index: 2, surface: 'ἦν', lemma: 'εἰμί', language: 'grc', pos: 'verb',
        gloss: 'was', morphology: { tense: 'imperfect', voice: 'active', mood: 'indicative', person: 'third', number: 'singular' } },
    ],
    syntax: {
      rootId: `${id}-c`,
      nodes: [
        { id: `${id}-c`, kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: `${id}-S`, kind: 'word', role: 'subject', tokenIds: [`${id}-t0`, `${id}-t1`] },
        { id: `${id}-V`, kind: 'word', role: 'predicate', tokenIds: [`${id}-t2`] },
      ],
      relations: [
        { id: `${id}-r1`, type: 'subject', headId: `${id}-c`, dependentId: `${id}-S` },
        { id: `${id}-r2`, type: 'predicate', headId: `${id}-c`, dependentId: `${id}-V` },
      ],
    },
  });
}

describe('foldAccents', () => {
  it('strips polytonic diacritics and lowercases so an unaccented query matches', () => {
    expect(foldAccents('λόγος')).toBe(foldAccents('λογος'));
    expect(foldAccents('ἦν')).toBe('ην');
  });

  it('strips Hebrew vowel points so an unpointed query matches a pointed word', () => {
    expect(foldAccents('בָּרָא')).toBe(foldAccents('ברא'));
    expect(foldAccents('אֱלֹהִים')).toBe(foldAccents('אלהים'));
  });
});

describe('hasAccents', () => {
  it('is true only when a string carries an accent/point foldAccents would strip', () => {
    expect(hasAccents('λόγος')).toBe(true); // Greek accent
    expect(hasAccents('בָּרָא')).toBe(true); // Hebrew points
    expect(hasAccents('λογος')).toBe(false); // bare Greek
    expect(hasAccents('ברא')).toBe(false); // bare Hebrew
    expect(hasAccents('love')).toBe(false); // Latin
    expect(hasAccents('')).toBe(false);
  });
});

describe('isEmptyQuery', () => {
  it('is true only when no criterion is set (whitespace text does not count)', () => {
    expect(isEmptyQuery({})).toBe(true);
    expect(isEmptyQuery({ text: '   ' })).toBe(true);
    expect(isEmptyQuery({ text: 'λ' })).toBe(false);
    expect(isEmptyQuery({ mood: 'optative' })).toBe(false);
    expect(isEmptyQuery({ pos: 'verb' })).toBe(false);
  });
});

describe('matchToken', () => {
  const doc = sentence('d1', 'John 1:1');
  const [article, noun, verb] = doc.tokens;

  it('matches free text against surface, lemma, or gloss, accent-insensitively', () => {
    expect(matchToken(noun!, { text: 'λογος' })).toBe(true); // unaccented surface
    expect(matchToken(verb!, { text: 'εἰμί' })).toBe(true); // lemma
    expect(matchToken(verb!, { text: 'was' })).toBe(true); // gloss
    expect(matchToken(noun!, { text: 'xyz' })).toBe(false);
  });

  it('matches part of speech exactly', () => {
    expect(matchToken(verb!, { pos: 'verb' })).toBe(true);
    expect(matchToken(noun!, { pos: 'verb' })).toBe(false);
  });

  it('ANDs together every set morphology criterion', () => {
    expect(matchToken(verb!, { mood: 'indicative', tense: 'imperfect' })).toBe(true);
    expect(matchToken(verb!, { mood: 'optative' })).toBe(false);
    expect(matchToken(noun!, { case: 'nominative', gender: 'masculine' })).toBe(true);
    // pos + morphology together: a nominative VERB does not exist here
    expect(matchToken(article!, { pos: 'noun', case: 'nominative' })).toBe(false);
  });
});

describe('searchPassages', () => {
  const book = [sentence('d1', 'John 1:1'), sentence('d2', 'John 1:2')];

  it('finds matches across every passage and records their node for highlighting', () => {
    const res = searchPassages(book, { pos: 'verb' });
    expect(res.total).toBe(2);
    expect(res.hits).toHaveLength(2);
    expect(res.capped).toBe(false);
    expect(res.hits[0]!.docIndex).toBe(0);
    expect(res.hits[0]!.nodeId).toBe('d1-V');
    expect(res.hits[1]!.doc.id).toBe('d2');
  });

  it('caps rendered hits while still reporting the true total', () => {
    // Enough sentences that every-article-token blows past the cap.
    const many = Array.from({ length: SEARCH_RESULT_CAP + 20 }, (_, i) => sentence(`m${i}`, `Ref ${i}`));
    const res = searchPassages(many, { pos: 'article' });
    expect(res.total).toBe(SEARCH_RESULT_CAP + 20);
    expect(res.hits).toHaveLength(SEARCH_RESULT_CAP);
    expect(res.capped).toBe(true);
  });

  it('returns nothing for a query nothing satisfies', () => {
    const res = searchPassages(book, { mood: 'optative' } satisfies SearchQuery);
    expect(res.total).toBe(0);
    expect(res.hits).toHaveLength(0);
    expect(res.capped).toBe(false);
  });
});

describe('searchCorpus (whole-testament streaming)', () => {
  // Three "books", each with two sentences (each sentence has exactly one verb).
  const books = [
    { num: 1, name: 'Book1' },
    { num: 2, name: 'Book2' },
    { num: 3, name: 'Book3' },
  ];
  const load = (num: number) =>
    Promise.resolve([sentence(`b${num}-s0`, `Book${num} 1:1`), sentence(`b${num}-s1`, `Book${num} 1:2`)]);

  it('streams every book, accumulates hits stamped with their book, and totals across books', async () => {
    const evicted: number[] = [];
    const progress: CorpusProgress[] = [];
    const res = await searchCorpus(books, load, { pos: 'verb' }, {
      onProgress: (p) => progress.push(p),
      afterBook: (num) => {
        evicted.push(num);
      },
    });
    // One verb per sentence × 2 sentences × 3 books.
    expect(res.total).toBe(6);
    expect(res.hits).toHaveLength(6);
    // Each hit remembers which book it came from (so opening it can reload it).
    expect(res.hits.map((h) => h.bookNum).sort()).toEqual([1, 1, 2, 2, 3, 3]);
    // Every book's cache is freed after it is searched.
    expect(evicted).toEqual([1, 2, 3]);
    // Progress ends complete.
    expect(progress.at(-1)).toMatchObject({ done: 3, total: 3, matches: 6 });
  });

  it('stops early when the signal is aborted', async () => {
    const ac = new AbortController();
    let loaded = 0;
    const countingLoad = (num: number) => {
      loaded += 1;
      if (loaded === 1) ac.abort(); // abort after the first book loads
      return load(num);
    };
    const res = await searchCorpus(books, countingLoad, { pos: 'verb' }, { signal: ac.signal });
    // The sweep bails out rather than searching all three books.
    expect(loaded).toBeLessThan(books.length);
    expect(res.total).toBeLessThan(6);
  });

  it('caps accumulated hits at SEARCH_RESULT_CAP while still counting the true total', async () => {
    // Enough sentences per book to blow past the cap across the corpus.
    const per = SEARCH_RESULT_CAP; // 300 verbs per book → 900 across 3 books
    const bigLoad = (num: number) =>
      Promise.resolve(Array.from({ length: per }, (_, i) => sentence(`b${num}-s${i}`, `Book${num} 1:${i}`)));
    const res = await searchCorpus(books, bigLoad, { pos: 'verb' }, {});
    expect(res.total).toBe(per * books.length);
    expect(res.hits).toHaveLength(SEARCH_RESULT_CAP);
    expect(res.capped).toBe(true);
  });
});

/** A minimal Hebrew sentence: the search is language-agnostic, so the OT source
 *  (person / number / gender morphology, no Greek case/tense) works the same. */
function hebrewSentence(id: string, title: string): KrDocument {
  return KrDocumentSchema.parse({
    schemaVersion: 1,
    id,
    title,
    language: 'hbo',
    text: 'בָּרָא אֱלֹהִים',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    layoutHints: {},
    tokens: [
      { id: `${id}-t0`, index: 0, surface: 'בָּרָא', lemma: 'ברא', language: 'hbo', pos: 'verb',
        gloss: 'created', morphology: { person: 'third', number: 'singular', gender: 'masculine', extra: { stem: 'qal' } } },
      { id: `${id}-t1`, index: 1, surface: 'אֱלֹהִים', lemma: 'אלהים', language: 'hbo', pos: 'noun',
        gloss: 'God', morphology: { number: 'plural', gender: 'masculine' } },
    ],
    syntax: {
      rootId: `${id}-c`,
      nodes: [
        { id: `${id}-c`, kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: `${id}-V`, kind: 'word', role: 'predicate', tokenIds: [`${id}-t0`] },
        { id: `${id}-S`, kind: 'word', role: 'subject', tokenIds: [`${id}-t1`] },
      ],
      relations: [
        { id: `${id}-r1`, type: 'predicate', headId: `${id}-c`, dependentId: `${id}-V` },
        { id: `${id}-r2`, type: 'subject', headId: `${id}-c`, dependentId: `${id}-S` },
      ],
    },
  });
}

describe('searchPassages (Hebrew / OT source)', () => {
  const chapter = [hebrewSentence('h1', 'Genesis 1:1')];

  it('matches Hebrew words by gloss and by person/number/gender morphology', () => {
    expect(searchPassages(chapter, { text: 'God' }).total).toBe(1); // gloss
    const verbs = searchPassages(chapter, { pos: 'verb', person: 'third', number: 'singular' });
    expect(verbs.total).toBe(1);
    expect(verbs.hits[0]!.nodeId).toBe('h1-V');
    // Greek-only criteria simply never match Hebrew tokens.
    expect(searchPassages(chapter, { case: 'nominative' }).total).toBe(0);
  });

  it('matches a pointed Hebrew surface from an unpointed query', () => {
    // The surface בָּרָא is pointed; typing the bare consonants ברא still finds it.
    expect(searchPassages(chapter, { text: 'ברא' }).total).toBe(1);
    // And a fully-pointed query lands on the same word.
    expect(searchPassages(chapter, { text: 'בָּרָא' }).total).toBe(1);
  });
});

describe('Strong’s-number search + lexeme picker', () => {
  // A tiny corpus with Strong's numbers in morphology.extra, and repeated lemmas.
  const corpus: KrDocument[] = [
    KrDocumentSchema.parse({
      schemaVersion: 1, id: 'lx', title: 'Phil 1:1', language: 'grc', text: 'δοῦλοι δοῦλος καί',
      createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', layoutHints: {},
      tokens: [
        { id: 'lx0', index: 0, surface: 'δοῦλοι', lemma: 'δοῦλος', language: 'grc', pos: 'noun',
          gloss: 'servants', morphology: { number: 'plural', extra: { strong: '1401' } } },
        { id: 'lx1', index: 1, surface: 'δοῦλος', lemma: 'δοῦλος', language: 'grc', pos: 'noun',
          gloss: 'servant', morphology: { number: 'singular', extra: { strong: '1401' } } },
        { id: 'lx2', index: 2, surface: 'καί', lemma: 'καί', language: 'grc', pos: 'conjunction',
          gloss: 'and', morphology: { extra: { strong: '2532' } } },
      ],
      syntax: { rootId: 'lx-c', nodes: [{ id: 'lx-c', kind: 'clause', clauseType: 'independent', tokenIds: [] }], relations: [] },
    }),
  ];

  it('matchToken finds a word by its Strong’s number (bare or G/H-prefixed, by prefix)', () => {
    const douloi = corpus[0]!.tokens[0]!;
    expect(matchToken(douloi, { text: '1401' })).toBe(true);
    expect(matchToken(douloi, { text: 'G1401' })).toBe(true);
    expect(matchToken(douloi, { text: '140' })).toBe(true); // prefix
    expect(matchToken(douloi, { text: '2532' })).toBe(false); // a different lexeme
    expect(matchToken(douloi, { text: 'servant' })).toBe(true); // gloss still works
  });

  it('searchLexemes collapses inflected occurrences into one entry, most-frequent first', () => {
    const byStrong = searchLexemes(corpus, { text: '1401' });
    expect(byStrong).toHaveLength(1);
    expect(byStrong[0]!.strong).toBe('1401');
    expect(byStrong[0]!.lemma).toBe('δοῦλος');
    expect(byStrong[0]!.count).toBe(2); // δοῦλοι + δοῦλος folded together

    const byGloss = searchLexemes(corpus, { text: 'servant' }); // matches both glosses
    expect(byGloss).toHaveLength(1);
    expect(byGloss[0]!.gloss).toBeTruthy();
  });
})
