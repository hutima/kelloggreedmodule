import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import {
  GNT_BOOKS,
  BUNDLED_BOOKS,
  loadGntBook,
  loadOpenTextBook,
  OPENTEXT_BOOKS,
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
  isEmptyQuery,
  morphCodes,
  searchPassages,
  tidyGloss,
  type SearchHit,
  type SearchQuery,
} from '@/domain/model';

/**
 * Morphological search picker (Accordance-style). Pick a GNT book — it loads on
 * demand, exactly like the passage pickers — then search its words by lexeme
 * (surface / lemma / gloss) and/or by a morphology profile (e.g. every optative
 * verb, or every genitive). The search is a pure in-memory scan of the loaded
 * book, so it's instant and needs no network once the book is in hand.
 *
 * Scoped to the Greek New Testament (both syntax sources), because a GNT book
 * loads as one unit — the sweet spot for "load a book, then search it". The
 * Hebrew Bible loads per chapter, so an OT search would be a natural follow-up.
 */
type Source = 'nestle1904' | 'opentext';

/** Load a book's sentence documents from the selected source. */
function loadBookDocs(source: Source, num: number): Promise<KrDocument[]> {
  if (source === 'opentext') {
    return loadOpenTextBook(OPENTEXT_BOOKS.find((x) => x.num === num)!);
  }
  return loadGntBook(GNT_BOOKS.find((x) => x.num === num)!);
}

/** Books offered for a source: the full GNT, or those with an OpenText analysis. */
function booksFor(source: Source): { num: number; name: string }[] {
  return source === 'opentext'
    ? OPENTEXT_BOOKS.map((b) => ({ num: b.num, name: b.name }))
    : GNT_BOOKS.map((b) => ({ num: b.num, name: b.name }));
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

  const [source, setSource] = useState<Source>('nestle1904');
  const [bookNum, setBookNum] = useState(11); // Philippians (bundled offline)
  const [passages, setPassages] = useState<KrDocument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<SearchQuery>({});

  const books = booksFor(source);
  const book = books.find((b) => b.num === bookNum) ?? books[0]!;

  const loadBook = async (num: number) => {
    setLoading(true);
    setError(null);
    setPassages(null);
    try {
      setPassages(await loadBookDocs(source, num));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load the book whenever the source or book changes (mirrors GntPicker;
  // the loaders + service worker cache repeat fetches).
  const lastLoaded = useRef<string>('');
  useEffect(() => {
    const key = `${source}:${bookNum}`;
    if (lastLoaded.current === key) return;
    lastLoaded.current = key;
    void loadBook(bookNum);
    // loadBook closes over the current source; re-run only on source/book change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, bookNum]);

  const changeSource = (next: Source) => {
    setSource(next);
    setError(null);
    const list = booksFor(next);
    if (!list.some((b) => b.num === bookNum)) setBookNum(list[0]!.num);
  };

  const update = (patch: Partial<SearchQuery>) => setQuery((q) => ({ ...q, ...patch }));
  const clear = () => setQuery({});
  const active = !isEmptyQuery(query);

  const result = useMemo(
    () => (passages && active ? searchPassages(passages, query) : null),
    [passages, active, query],
  );

  const openHit = (hit: SearchHit) => {
    loadDocument(hit.doc, { corpus: 'gnt' });
    if (passages) setGntContext(passages, hit.docIndex);
    setMode('parsed');
    // Highlight the matched word: prefer its syntax node (what the diagram
    // highlights); fall back to the raw token for an unassigned word.
    if (hit.nodeId) select({ nodeId: hit.nodeId });
    else select({ tokenId: hit.token.id });
  };

  return (
    <div className="gnt-picker">
      <label className="field">
        <span>Syntax source</span>
        <select value={source} onChange={(e) => changeSource(e.target.value as Source)}>
          <option value="nestle1904">Nestle 1904 (Lowfat)</option>
          <option value="opentext">OpenText.org</option>
        </select>
      </label>
      <label className="field">
        <span>Search in book</span>
        <select value={bookNum} onChange={(e) => setBookNum(Number(e.target.value))}>
          {books.map((b) => (
            <option key={b.num} value={b.num} title={b.name}>
              {b.name}
              {source === 'nestle1904' && BUNDLED_BOOKS.has(b.num) ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Word, lemma, or gloss</span>
        <input
          type="search"
          value={query.text ?? ''}
          placeholder="e.g. λόγος, ἀγαπάω, love"
          onChange={(e) => update({ text: e.target.value })}
        />
      </label>
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
        <MorphSelect label="Tense" value={query.tense} options={TENSE_OPTIONS} onChange={(v) => update({ tense: v })} />
        <MorphSelect label="Voice" value={query.voice} options={VOICE_OPTIONS} onChange={(v) => update({ voice: v })} />
        <MorphSelect label="Mood" value={query.mood} options={MOOD_OPTIONS} onChange={(v) => update({ mood: v })} />
        <MorphSelect label="Person" value={query.person} options={PERSON_OPTIONS} onChange={(v) => update({ person: v })} />
        <MorphSelect label="Case" value={query.case} options={CASE_OPTIONS} onChange={(v) => update({ case: v })} />
        <MorphSelect label="Number" value={query.number} options={NUMBER_OPTIONS} onChange={(v) => update({ number: v })} />
        <MorphSelect label="Gender" value={query.gender} options={GENDER_OPTIONS} onChange={(v) => update({ gender: v })} />
        <MorphSelect label="Degree" value={query.degree} options={DEGREE_OPTIONS} onChange={(v) => update({ degree: v })} />
      </div>

      <div className="row search-controls">
        {loading && <span style={{ fontSize: 12, color: 'var(--ink-soft, #667)' }}>Loading {book.name}…</span>}
        <button className="mini" disabled={!active} onClick={clear}>
          Clear
        </button>
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}

      {result && (
        <div className="gnt-passages">
          <div className="gnt-actions">
            <span className="gnt-all">
              {result.total === 0
                ? 'No matches'
                : result.capped
                  ? `First ${result.hits.length} of ${result.total} in ${book.name}`
                  : `${result.total} ${result.total === 1 ? 'match' : 'matches'} in ${book.name}`}
            </span>
          </div>
          <ul className="gnt-list">
            {result.hits.map((hit) => {
              const isOpen = hit.doc.id === openDocId;
              const gloss = tidyGloss(hit.token.gloss);
              return (
                <li key={`${hit.doc.id}:${hit.token.id}`}>
                  <button
                    className={`search-hit${isOpen ? ' checked' : ''}`}
                    onClick={() => openHit(hit)}
                    title={`Open ${hit.doc.title}`}
                  >
                    <span className="gnt-ref">{verse(hit.doc.title)}</span>
                    <span className="search-hit-body">
                      <span className="greek search-hit-surface">{hit.token.surface}</span>
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
      {!result && passages && (
        <p style={{ fontSize: 12, color: 'var(--muted, #667)' }}>
          Enter a word or choose a morphology filter to search {book.name}.
        </p>
      )}
    </div>
  );
}
