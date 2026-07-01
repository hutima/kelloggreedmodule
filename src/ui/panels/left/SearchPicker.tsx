import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import {
  GNT_BOOKS,
  BUNDLED_BOOKS,
  evictGntBook,
  loadGntBook,
  loadOpenTextBook,
  loadOtBook,
  OPENTEXT_BOOKS,
  OT_BOOKS,
} from '@/io';
import type {
  Degree,
  Gender,
  GrammaticalCase,
  GrammaticalNumber,
  KrDocument,
  Mood,
  PartOfSpeech,
  Person,
  Tense,
  Voice,
} from '@/domain/schema';
import {
  hasAccents,
  isEmptyQuery,
  morphCodes,
  searchCorpus,
  searchPassages,
  tidyGloss,
  type CorpusProgress,
  type SearchHit,
  type SearchQuery,
  type SearchResult,
} from '@/domain/model';
import { OfflineDownload } from './OfflineDownload';

/**
 * Morphological search picker (Accordance-style). Pick a source and book — it
 * loads on demand, exactly like the passage pickers — then search its words by
 * lexeme (surface / lemma / gloss) and/or by a morphology profile (e.g. every
 * optative verb, or every genitive). The search is a pure in-memory scan of the
 * loaded unit, so it's instant and needs no network once it's in hand.
 *
 * Three sources are selectable, matching the passage pickers: the two Greek New
 * Testament parses (Nestle 1904 and OpenText.org), each of which loads a whole
 * BOOK at once, and the Hebrew Bible (macula-hebrew WLC), which ships one file
 * per CHAPTER — so the Hebrew search adds a chapter selector and is scoped to a
 * chapter. The morphology filters follow the language: the Greek ones (tense /
 * voice / mood / case / degree) are hidden for Hebrew, which has none of them.
 */
type Source = 'nestle1904' | 'opentext' | 'ot';

/** Sentinel book value for the "whole testament" scope in the book selector. */
const ALL = -1;

/** Greek-only morphology fields — hidden (and cleared) for the Hebrew source. */
const GREEK_ONLY_FIELDS = ['tense', 'voice', 'mood', 'case', 'degree'] as const;

/** Drop the criteria that don't apply to `source` (Greek cases/tenses for Hebrew). */
function applicableQuery(source: Source, q: SearchQuery): SearchQuery {
  if (source !== 'ot') return q;
  const next = { ...q };
  for (const f of GREEK_ONLY_FIELDS) delete next[f];
  return next;
}

/** The book list offered for a source. */
function booksFor(source: Source): { num: number; name: string }[] {
  if (source === 'ot') return OT_BOOKS.map((b) => ({ num: b.num, name: b.name }));
  if (source === 'opentext') return OPENTEXT_BOOKS.map((b) => ({ num: b.num, name: b.name }));
  return GNT_BOOKS.map((b) => ({ num: b.num, name: b.name }));
}

/** A sensible default book when switching to a source (bundled where possible). */
function defaultBook(source: Source): number {
  if (source === 'ot') return 1; // Genesis
  if (source === 'opentext') return OPENTEXT_BOOKS.some((b) => b.num === 57) ? 57 : OPENTEXT_BOOKS[0]!.num;
  return 11; // Philippians (bundled for Nestle 1904)
}

const POS_OPTIONS: { value: PartOfSpeech; label: string }[] = [
  { value: 'noun', label: 'Noun' },
  { value: 'propernoun', label: 'Proper noun' },
  { value: 'pronoun', label: 'Pronoun' },
  { value: 'verb', label: 'Verb (finite)' },
  { value: 'participle', label: 'Participle' },
  { value: 'infinitive', label: 'Infinitive' },
  { value: 'adjective', label: 'Adjective' },
  { value: 'adverb', label: 'Adverb' },
  { value: 'article', label: 'Article' },
  { value: 'preposition', label: 'Preposition' },
  { value: 'conjunction', label: 'Conjunction' },
  { value: 'particle', label: 'Particle' },
  { value: 'interjection', label: 'Interjection' },
  { value: 'numeral', label: 'Numeral' },
  { value: 'determiner', label: 'Determiner' },
];
const TENSE_OPTIONS: { value: Tense; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'imperfect', label: 'Imperfect' },
  { value: 'future', label: 'Future' },
  { value: 'aorist', label: 'Aorist' },
  { value: 'perfect', label: 'Perfect' },
  { value: 'pluperfect', label: 'Pluperfect' },
];
const VOICE_OPTIONS: { value: Voice; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'middle', label: 'Middle' },
  { value: 'passive', label: 'Passive' },
  { value: 'middlepassive', label: 'Middle/Passive' },
];
const MOOD_OPTIONS: { value: Mood; label: string }[] = [
  { value: 'indicative', label: 'Indicative' },
  { value: 'subjunctive', label: 'Subjunctive' },
  { value: 'optative', label: 'Optative' },
  { value: 'imperative', label: 'Imperative' },
  { value: 'infinitive', label: 'Infinitive' },
  { value: 'participle', label: 'Participle' },
];
const CASE_OPTIONS: { value: GrammaticalCase; label: string }[] = [
  { value: 'nominative', label: 'Nominative' },
  { value: 'genitive', label: 'Genitive' },
  { value: 'dative', label: 'Dative' },
  { value: 'accusative', label: 'Accusative' },
  { value: 'vocative', label: 'Vocative' },
];
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'masculine', label: 'Masculine' },
  { value: 'feminine', label: 'Feminine' },
  { value: 'neuter', label: 'Neuter' },
  { value: 'common', label: 'Common' },
  { value: 'both', label: 'Both (either gender)' },
];
const NUMBER_OPTIONS: { value: GrammaticalNumber; label: string }[] = [
  { value: 'singular', label: 'Singular' },
  { value: 'dual', label: 'Dual' },
  { value: 'plural', label: 'Plural' },
];
const PERSON_OPTIONS: { value: Person; label: string }[] = [
  { value: 'first', label: '1st' },
  { value: 'second', label: '2nd' },
  { value: 'third', label: '3rd' },
];
const DEGREE_OPTIONS: { value: Degree; label: string }[] = [
  { value: 'positive', label: 'Positive' },
  { value: 'comparative', label: 'Comparative' },
  { value: 'superlative', label: 'Superlative' },
];

/** A morphology <select> bound to one query field. Blank = "Any". */
function MorphSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T | undefined) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** "Philippians 1:1" → "1:1" for a compact concordance line. */
function verse(title: string): string {
  return title.replace(/^.*?(\d+:\d+(?:[–-]\d+)?)\s*$/, '$1');
}

export function SearchPicker() {
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const setMode = useEditorStore((s) => s.setMode);
  const setGntContext = useEditorStore((s) => s.setGntContext);
  const select = useEditorStore((s) => s.select);
  const openDocId = useEditorStore((s) => s.doc.id);
  const searchPrefill = useEditorStore((s) => s.searchPrefill);
  const setSearchPrefill = useEditorStore((s) => s.setSearchPrefill);

  const [source, setSource] = useState<Source>('nestle1904');
  const [bookNum, setBookNum] = useState(11); // Philippians (bundled offline)
  const [passages, setPassages] = useState<KrDocument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<SearchQuery>({});
  const [corpusResult, setCorpusResult] = useState<SearchResult | null>(null);
  const [progress, setProgress] = useState<CorpusProgress | null>(null);
  const sweepRef = useRef<AbortController | null>(null);

  const isOt = source === 'ot';
  const allScope = bookNum === ALL;
  const books = booksFor(source);
  const book = books.find((b) => b.num === bookNum) ?? books[0]!;
  const testament = isOt ? 'Old Testament' : 'New Testament';
  const bookLabel = allScope ? `the ${testament}` : book.name;

  /** Load one whole book (all chapters, for the OT) by number, for the source. */
  const loadByNum = (num: number): Promise<KrDocument[]> =>
    source === 'ot'
      ? loadOtBook(OT_BOOKS.find((b) => b.num === num)!)
      : source === 'opentext'
        ? loadOpenTextBook(OPENTEXT_BOOKS.find((b) => b.num === num)!)
        : loadGntBook(GNT_BOOKS.find((b) => b.num === num)!);

  /** After a book is searched in a sweep, free its fetch cache. Only the GNT is
   *  kept in Cache Storage; the OT/OpenText ride the (self-managing) HTTP cache. */
  const evictByNum = async (num: number) => {
    if (source === 'nestle1904') await evictGntBook(GNT_BOOKS.find((b) => b.num === num)!);
  };

  const loadUnit = async (num: number) => {
    setLoading(true);
    setError(null);
    setPassages(null);
    try {
      setPassages(await loadByNum(num));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load the whole book whenever the source or book changes (single-book
  // scope only); the loaders + service worker cache repeat fetches. The
  // whole-testament scope streams on demand instead, so it holds no book here.
  const lastLoaded = useRef<string>('');
  useEffect(() => {
    if (allScope) {
      setPassages(null);
      return;
    }
    const key = `${source}:${bookNum}`;
    if (lastLoaded.current === key) return;
    lastLoaded.current = key;
    void loadUnit(bookNum);
    // loadUnit reads source from closure; re-run only on source/book change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, bookNum, allScope]);

  // A changed query / scope / source invalidates any in-flight or finished sweep.
  useEffect(() => {
    sweepRef.current?.abort();
    sweepRef.current = null;
    setProgress(null);
    setCorpusResult(null);
  }, [query, source, bookNum]);

  // Cancel a running sweep if the panel unmounts.
  useEffect(() => () => sweepRef.current?.abort(), []);

  // Consume a prefill queued from the inspector (a word's Strong's / lemma): open
  // the matching corpus, scope to the whole testament, and drop in the lemma — the
  // user just hits "Search {Testament}". Clear it so it fires once.
  useEffect(() => {
    if (!searchPrefill) return;
    setSource(searchPrefill.language === 'hbo' ? 'ot' : 'nestle1904');
    setBookNum(ALL);
    setQuery({ text: searchPrefill.text });
    setSearchPrefill(null);
  }, [searchPrefill, setSearchPrefill]);

  const changeSource = (next: Source) => {
    setSource(next);
    setError(null);
    setQuery((q) => applicableQuery(next, q));
    const list = booksFor(next);
    // Reset the book when crossing the Greek/Hebrew boundary (book numbers
    // overlap between corpora) or when the current book isn't in the new source.
    // The whole-testament scope carries across (both corpora support it).
    const crossCorpus = (next === 'ot') !== (source === 'ot');
    if (bookNum !== ALL && (crossCorpus || !list.some((b) => b.num === bookNum))) {
      setBookNum(defaultBook(next));
    }
  };

  const update = (patch: Partial<SearchQuery>) => setQuery((q) => ({ ...q, ...patch }));
  const clear = () => setQuery({});
  const active = !isEmptyQuery(query);

  const result = useMemo(
    () => (!allScope && passages && active ? searchPassages(passages, query) : null),
    [allScope, passages, active, query],
  );
  const shown = allScope ? corpusResult : result;

  /** Stream the query across every book of the testament, book by book. */
  const runSweep = async () => {
    sweepRef.current?.abort();
    const ac = new AbortController();
    sweepRef.current = ac;
    setError(null);
    setCorpusResult({ hits: [], total: 0, capped: false });
    setProgress({ done: 0, total: books.length, current: books[0]?.name ?? '', matches: 0 });
    try {
      const res = await searchCorpus(books, loadByNum, applicableQuery(source, query), {
        signal: ac.signal,
        onProgress: setProgress,
        onPartial: setCorpusResult,
        afterBook: evictByNum,
      });
      if (!ac.signal.aborted) setCorpusResult(res);
    } catch (e) {
      if (!ac.signal.aborted) setError((e as Error).message);
    } finally {
      if (sweepRef.current === ac) {
        setProgress(null);
        sweepRef.current = null;
      }
    }
  };
  const stopSweep = () => {
    sweepRef.current?.abort();
    sweepRef.current = null;
    setProgress(null);
  };

  const openHit = async (hit: SearchHit) => {
    loadDocument(hit.doc, { corpus: isOt ? 'ot' : 'gnt' });
    setMode('parsed');
    // Highlight the matched word: prefer its syntax node (what the diagram
    // highlights); fall back to the raw token for an unassigned word.
    if (hit.nodeId) select({ nodeId: hit.nodeId });
    else select({ tokenId: hit.token.id });
    // Restore prev/next context. A single-book search already holds its book; a
    // corpus hit reloads just its own book (the sweep kept none in memory).
    if (hit.bookNum != null) {
      try {
        const bk = await loadByNum(hit.bookNum);
        const idx = bk.findIndex((d) => d.id === hit.doc.id);
        setGntContext(bk, idx >= 0 ? idx : 0);
      } catch {
        /* prev/next context is best-effort */
      }
    } else if (passages) {
      setGntContext(passages, hit.docIndex);
    }
  };

  return (
    <div className="gnt-picker">
      {progress && (
        <div className="search-progress" style={{ margin: '0 0 8px' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-soft, #667)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>
              Searching {progress.current || 'the corpus'} — {progress.done}/{progress.total} books · {progress.matches}{' '}
              {progress.matches === 1 ? 'match' : 'matches'}
            </span>
            <button className="mini" onClick={stopSweep}>
              Stop
            </button>
          </div>
          <div
            style={{ height: 4, borderRadius: 2, background: 'var(--line, #ddd)', overflow: 'hidden', marginTop: 4 }}
            role="progressbar"
            aria-valuenow={progress.done}
            aria-valuemax={progress.total}
          >
            <div
              style={{
                height: '100%',
                width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                background: 'var(--accent, #48c)',
                transition: 'width 120ms linear',
              }}
            />
          </div>
        </div>
      )}
      <label className="field">
        <span>Source</span>
        <select value={source} onChange={(e) => changeSource(e.target.value as Source)}>
          <option value="nestle1904">Greek NT — Nestle 1904 (Lowfat)</option>
          <option value="opentext">Greek NT — OpenText.org</option>
          <option value="ot">Hebrew Bible — WLC (macula)</option>
        </select>
      </label>
      <div className="row">
        <label className="field" style={{ flex: 1 }}>
          <span>Search in</span>
          <select value={bookNum} onChange={(e) => setBookNum(Number(e.target.value))}>
            <option value={ALL}>Whole {testament} ({books.length} books)</option>
            {books.map((b) => (
              <option key={b.num} value={b.num} title={b.name}>
                {b.name}
                {source === 'nestle1904' && BUNDLED_BOOKS.has(b.num) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Word, lemma, or gloss</span>
        <input
          type="search"
          value={query.text ?? ''}
          placeholder={isOt ? 'e.g. אלהים, ברא, God' : 'e.g. λογος, αγαπαω, love'}
          onChange={(e) => update({ text: e.target.value })}
        />
      </label>
      {hasAccents(query.text ?? '') && (
        <p className="search-note" style={{ fontSize: 12, color: 'var(--muted, #667)', margin: '2px 0 0' }}>
          {isOt ? 'Vowel points are ignored' : 'Accents are ignored'} — you can type without them.
        </p>
      )}
      <label className="field">
        <span>Part of speech</span>
        <select
          value={query.pos ?? ''}
          onChange={(e) => update({ pos: (e.target.value || undefined) as PartOfSpeech | undefined })}
        >
          <option value="">Any</option>
          {POS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="search-morph">
        {!isOt && (
          <>
            <MorphSelect label="Tense" value={query.tense} options={TENSE_OPTIONS} onChange={(v) => update({ tense: v })} />
            <MorphSelect label="Voice" value={query.voice} options={VOICE_OPTIONS} onChange={(v) => update({ voice: v })} />
            <MorphSelect label="Mood" value={query.mood} options={MOOD_OPTIONS} onChange={(v) => update({ mood: v })} />
          </>
        )}
        <MorphSelect label="Person" value={query.person} options={PERSON_OPTIONS} onChange={(v) => update({ person: v })} />
        {!isOt && (
          <MorphSelect label="Case" value={query.case} options={CASE_OPTIONS} onChange={(v) => update({ case: v })} />
        )}
        <MorphSelect label="Number" value={query.number} options={NUMBER_OPTIONS} onChange={(v) => update({ number: v })} />
        <MorphSelect label="Gender" value={query.gender} options={GENDER_OPTIONS} onChange={(v) => update({ gender: v })} />
        {!isOt && (
          <MorphSelect label="Degree" value={query.degree} options={DEGREE_OPTIONS} onChange={(v) => update({ degree: v })} />
        )}
      </div>

      <div className="row search-controls">
        {loading && <span style={{ fontSize: 12, color: 'var(--ink-soft, #667)' }}>Loading {bookLabel}…</span>}
        {allScope && !progress && (
          <button className="mini" disabled={!active} onClick={runSweep} title={`Search all ${books.length} books`}>
            Search {testament}
          </button>
        )}
        <button className="mini" disabled={!active} onClick={clear}>
          Clear
        </button>
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}

      {shown && (
        <div className="gnt-passages">
          <div className="gnt-actions">
            <span className="gnt-all">
              {shown.total === 0
                ? progress
                  ? 'No matches yet…'
                  : 'No matches'
                : shown.capped
                  ? `First ${shown.hits.length} of ${shown.total} in ${bookLabel}`
                  : `${shown.total} ${shown.total === 1 ? 'match' : 'matches'} in ${bookLabel}`}
            </span>
          </div>
          <ul className="gnt-list">
            {shown.hits.map((hit) => {
              const isOpen = hit.doc.id === openDocId;
              const gloss = tidyGloss(hit.token.gloss);
              return (
                <li key={`${hit.doc.id}:${hit.token.id}`}>
                  <button
                    className={`search-hit${isOpen ? ' checked' : ''}`}
                    onClick={() => openHit(hit)}
                    title={`Open ${hit.doc.title}`}
                  >
                    {/* A whole-testament sweep spans books, so name the book too. */}
                    <span className="gnt-ref">{allScope ? hit.doc.title : verse(hit.doc.title)}</span>
                    <span className="search-hit-body">
                      <span className={`${isOt ? 'hebrew' : 'greek'} search-hit-surface`}>{hit.token.surface}</span>
                      <span className="search-codes">
                        {morphCodes(hit.token).map((c, i) => (
                          <span key={i} className="search-code">
                            {c.text}
                          </span>
                        ))}
                        {gloss && <span className="search-gloss">{gloss}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!shown && !progress && (
        <p style={{ fontSize: 12, color: 'var(--muted, #667)' }}>
          {allScope
            ? active
              ? `Press “Search ${testament}” to sweep all ${books.length} books.`
              : `Enter a word or filter, then search the whole ${testament}.`
            : passages
              ? `Enter a word or choose a morphology filter to search ${bookLabel}.`
              : ''}
        </p>
      )}

      {/* Offline download of the whole testament (the OpenText alt source isn't
          warmed yet, so it's offered for the two default corpora). */}
      {source !== 'opentext' && <OfflineDownload corpus={isOt ? 'ot' : 'nt'} testament={testament} />}
    </div>
  );
}
