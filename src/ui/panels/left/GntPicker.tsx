import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import {
  GNT_BOOKS,
  BUNDLED_BOOKS,
  SBLGNT_BUNDLED_BOOKS,
  DEFAULT_GNT_SOURCE,
  cacheGntBook,
  loadGntBook,
  SBLGNT_BOOKS,
  cacheSblgntBook,
  loadSblgntBook,
  combinePassage,
  loadOpenTextBook,
  OPENTEXT_BOOKS,
  SYNTAX_SOURCES,
  type SyntaxSourceId,
  type GntBook,
} from '@/io';
import { useViewport } from '@/ui/responsive';
import type { KrDocument } from '@/domain/schema';
import { applyStoredPatch } from '@/persistence';
import { getIssuesForPassage } from '@/domain/contested';

/**
 * Greek New Testament passage picker. Load a book, tick any number of sentences,
 * and Open diagrams them all together as one passage, ready to edit. The sentence
 * list doubles as the running Greek text with verse references.
 *
 * Three syntax SOURCES are selectable: the default SBLGNT Lowfat edition, the
 * legacy/alternate Nestle1904 Lowfat edition, and the OpenText.org analysis (an
 * alternative tree). All yield ordinary `KrDocument`s, so whichever is opened
 * drives all four visualizations and becomes the editable base — switching
 * source just changes which published analysis you start from.
 */
type Source = 'macula-greek-sblgnt-lowfat' | 'macula-greek-nestle1904-lowfat' | 'opentext';

/** The picker slot for a document's source — this picker offers the loadable
 *  GNT sources; anything else shows as the Nestle1904 default. */
function pickerSource(d: KrDocument): Source {
  const id = d.id.replace(/^passage_/, '');
  if (id.startsWith('opentext_')) return 'opentext';
  if (id.startsWith('gnt_')) return 'macula-greek-nestle1904-lowfat';
  // SBLGNT documents — and anything that is not a GNT passage at all (a
  // sample, a typed sentence): the picker starts on the DEFAULT edition.
  return DEFAULT_GNT_SOURCE as Source;
}

/** The GNT book whose name a passage/sentence title begins with, if any. */
function bookForTitle(title: string): GntBook | undefined {
  return GNT_BOOKS.find((b) => title.startsWith(b.name));
}

/** Books offered for a source: the full GNT, or those with an OpenText analysis. */
function booksFor(source: Source): { num: number; name: string }[] {
  return source === 'opentext'
    ? OPENTEXT_BOOKS.map((b) => ({ num: b.num, name: b.name }))
    : GNT_BOOKS.map((b) => ({ num: b.num, name: b.name }));
}

/** Load a book's sentence documents from the selected source. */
function loadBookDocs(source: Source, num: number): Promise<KrDocument[]> {
  if (source === 'opentext') {
    const b = OPENTEXT_BOOKS.find((x) => x.num === num)!;
    return loadOpenTextBook(b);
  }
  if (source === 'macula-greek-sblgnt-lowfat') {
    return loadSblgntBook(SBLGNT_BOOKS.find((x) => x.num === num)!);
  }
  return loadGntBook(GNT_BOOKS.find((x) => x.num === num)!);
}

export function GntPicker() {
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const setMode = useEditorStore((s) => s.setMode);
  const setGntContext = useEditorStore((s) => s.setGntContext);
  const setLeftCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  const setMultiSentenceContested = useEditorStore((s) => s.setMultiSentenceContested);
  const doc = useEditorStore((s) => s.doc);
  const gntPassages = useEditorStore((s) => s.gntPassages);
  // Seed from the CURRENT passage so reopening Sources (which remounts the panel
  // on mobile) reflects what you're reading, instead of always resetting to Php.
  const currentBook = bookForTitle(doc.title);
  // Seed the source from the OPEN passage (its document id tells which parse it
  // came from), so the selector reflects what you're reading and persists across
  // remounts — exactly like the Book selector.
  const [source, setSource] = useState<Source>(() => pickerSource(doc));
  const [bookNum, setBookNum] = useState(currentBook?.num ?? 11);
  // Desktop-only two-source side-by-side comparison.
  const vp = useViewport();
  const compareOn = useEditorStore((s) => s.sourceCompare.on);
  const compareSource = useEditorStore((s) => s.sourceCompare.source);
  const toggleSourceCompare = useEditorStore((s) => s.toggleSourceCompare);
  const setCompareSource = useEditorStore((s) => s.setCompareSource);
  const [passages, setPassages] = useState<KrDocument[] | null>(() =>
    gntPassages.length && currentBook && bookForTitle(gntPassages[0]!.title)?.num === currentBook.num
      ? gntPassages
      : null,
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheState, setCacheState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Keep the Book AND Syntax-source selectors in sync with the OPEN passage. The
  // initial state above captures whatever document was loaded when this panel
  // first mounted — but on a returning visit the session is restored
  // ASYNCHRONOUSLY, so the panel can mount on the placeholder doc and miss the
  // swap to (e.g.) Romans or an OpenText parse. When the open document changes to
  // a different book or source, follow it.
  const lastSyncedDocId = useRef(doc.id);
  useEffect(() => {
    if (doc.id === lastSyncedDocId.current) return;
    lastSyncedDocId.current = doc.id;
    // A non-GNT doc (Hebrew, a typed custom sentence…) doesn't drive the GNT
    // picker — following it would reset the source/book and refetch the list.
    if (doc.language !== 'grc' || !currentBook) return;
    const docSource = pickerSource(doc);
    const bookChanged = !!currentBook && currentBook.num !== bookNum;
    const sourceChanged = docSource !== source;
    if (sourceChanged) setSource(docSource);
    if (bookChanged) setBookNum(currentBook!.num);
    if (bookChanged || sourceChanged) {
      // The previously loaded sentence list was for the old book/source.
      setPassages(null);
      setChecked(new Set());
      setCacheState('idle');
    }
  }, [doc, currentBook, bookNum, source]);

  const books = booksFor(source);
  const book = books.find((b) => b.num === bookNum) ?? books[0]!;
  // OpenText's bundled Philemon is always offline-ready; each Lowfat edition
  // bundles Philippians only.
  const bundledSet =
    source === 'macula-greek-sblgnt-lowfat' ? SBLGNT_BUNDLED_BOOKS : BUNDLED_BOOKS;
  const bundled = source === 'opentext' || bundledSet.has(book.num);

  // Requests can finish out of order (switching book/source mid-fetch); only
  // the LATEST request may publish its list or clear the spinner, or a slow
  // stale response would clobber the newer one.
  const loadSeq = useRef(0);
  const loadBook = async (num: number) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    setPassages(null);
    setChecked(new Set());
    setCacheState('idle');
    try {
      const docs = await loadBookDocs(source, num);
      if (seq !== loadSeq.current) return;
      setPassages(docs);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError((e as Error).message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };

  // Switching source resets the list and lands on a book that source covers.
  const changeSource = (next: Source) => {
    setSource(next);
    setError(null);
    setCacheState('idle');
    const list = booksFor(next);
    if (!list.some((b) => b.num === bookNum)) setBookNum(list[0]!.num);
  };

  // Auto-load the sentence list whenever the source or book changes — the manual
  // Load button is redundant. A list seeded from the open passage skips the first
  // fetch (the ref starts matched), and the loaders/service worker cache the rest.
  const lastLoaded = useRef<string>(passages ? `${source}:${bookNum}` : '');
  useEffect(() => {
    const key = `${source}:${bookNum}`;
    if (lastLoaded.current === key) return;
    lastLoaded.current = key;
    void loadBook(bookNum);
    // loadBook closes over the current source; re-run only on source/book change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, bookNum]);

  const saveOffline = async (num: number) => {
    const b = GNT_BOOKS.find((x) => x.num === num);
    if (!b) return;
    setCacheState('saving');
    const ok =
      source === 'macula-greek-sblgnt-lowfat' ? await cacheSblgntBook(b) : await cacheGntBook(b);
    setCacheState(ok ? 'saved' : 'error');
  };

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allChecked = !!passages && passages.length > 0 && checked.size === passages.length;
  const toggleAll = () =>
    setChecked(allChecked ? new Set() : new Set((passages ?? []).map((p) => p.id)));

  const openChecked = () => {
    if (!passages) return;
    const selected = passages.filter((p) => checked.has(p.id));
    if (!selected.length) return;
    // Fold in each sentence's saved patch (e.g. a promoted/adopted alternate
    // reading) BEFORE combining, so a multi-sentence selection shows it instead
    // of silently reverting that sentence to its untouched base. The apply is
    // baseHash-guarded: a patch made against a different base is skipped.
    const patched = selected.map((p) => applyStoredPatch(p));
    // OpenText carries an explicit clause-connector layer, so chained sentences
    // (καί / δέ / διό …) join on one coordinate spine rather than stacking.
    loadDocument(combinePassage(patched, { coordinate: source === 'opentext' }), { corpus: 'gnt' });
    // Reading context for prev/next nav: the book's sentences + the first opened.
    const firstIdx = passages.findIndex((p) => checked.has(p.id));
    setGntContext(passages, firstIdx);
    setMode('parsed');
    // Flag any contested/debated readings among the included sentences — but
    // only for a GENUINE multi-sentence combination (a single checked sentence
    // opens unchanged, so its own id already matches the normal per-passage
    // badge; flagging it again here would just duplicate that badge).
    if (selected.length > 1) {
      const seenIssueIds = new Set<string>();
      const multiIssues = selected
        .flatMap((p) => getIssuesForPassage(p))
        .filter((i) => (seenIssueIds.has(i.id) ? false : (seenIssueIds.add(i.id), true)));
      setMultiSentenceContested(multiIssues);
    } else {
      setMultiSentenceContested([]);
    }
    // On a narrow screen, collapse the picker so the text + diagram get the room.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches) {
      setLeftCollapsed(true);
    }
  };

  /** "Philippians 1:1" → "1:1" for a compact list. */
  const verse = (title: string) => title.replace(/^.*?(\d+:\d+(?:[–-]\d+)?)\s*$/, '$1');

  return (
    <div className="gnt-picker">
      {/* Syntax source: the published analysis a passage starts from. */}
      <label className="field">
        <span>Syntax source</span>
        <select value={source} onChange={(e) => changeSource(e.target.value as Source)}>
          <option value="macula-greek-sblgnt-lowfat">SBLGNT Lowfat</option>
          <option value="macula-greek-nestle1904-lowfat">Nestle 1904 Lowfat (legacy)</option>
          <option value="opentext">OpenText syntax</option>
        </select>
      </label>
      {/* Book selector spans the full width on its own line so the full book name
          is readable; Load / Save offline sit on the row beneath it. */}
      <label className="field">
        <span>Book</span>
        <select
          value={bookNum}
          onChange={(e) => {
            setBookNum(Number(e.target.value));
            setCacheState('idle');
          }}
        >
          {books.map((b) => (
            <option key={b.num} value={b.num} title={b.name}>
              {b.name}
              {source !== 'opentext' && bundledSet.has(b.num) ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        {loading && <span style={{ fontSize: 12, color: 'var(--ink-soft, #667)' }}>Loading…</span>}
        {source !== 'opentext' && (
          <button
            className="mini"
            disabled={bundled || cacheState === 'saving' || cacheState === 'saved'}
            title={bundled ? 'Bundled with the app' : 'Download this book for offline use'}
            onClick={() => void saveOffline(book.num)}
          >
            {bundled ? 'Bundled ✓' : cacheState === 'saving' ? 'Saving…' : cacheState === 'saved' ? 'Saved ✓' : 'Save offline'}
          </button>
        )}
      </div>
      {source === 'opentext' && (
        <p style={{ fontSize: 12, color: 'var(--muted, #667)' }}>
          OpenText.org analysis (CC BY-SA 4.0), surface text from Nestle 1904.
        </p>
      )}
      {source === 'macula-greek-sblgnt-lowfat' && (
        <p style={{ fontSize: 12, color: 'var(--muted, #667)' }}>
          SBLGNT text (SBL, CC BY 4.0) with MACULA Greek Lowfat syntax
          (Clear-Bible, CC BY 4.0).
        </p>
      )}

      {/* Desktop: compare two syntax sources for the open passage side by side. */}
      {vp.isDesktop && (
        <div className="field-group">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={compareOn}
              onChange={(e) => toggleSourceCompare(e.target.checked)}
            />
            <span>Split view — compare two sources</span>
          </label>
          {compareOn && (
            <label className="field">
              <span>Compare with</span>
              <select
                value={compareSource}
                onChange={(e) => setCompareSource(e.target.value as SyntaxSourceId)}
              >
                {SYNTAX_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {cacheState === 'error' && <p style={{ color: 'var(--danger)', fontSize: 12 }}>Couldn’t save offline.</p>}
      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}

      {passages && (
        <div className="gnt-passages">
          <div className="gnt-actions">
            <label className="gnt-all">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              <span>
                {book.name}: {passages.length} sentences
              </span>
            </label>
            <button className="mini accept" disabled={!checked.size} onClick={openChecked}>
              Open{checked.size ? ` (${checked.size})` : ''}
            </button>
          </div>
          <ul className="gnt-list">
            {passages.map((p) => (
              <li key={p.id}>
                <label className={`gnt-sentence${checked.has(p.id) ? ' checked' : ''}`}>
                  <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="gnt-ref">
                    {verse(p.title)}
                    {getIssuesForPassage(p).length > 0 && (
                      <span
                        className="gnt-contested-dot"
                        aria-hidden="true"
                        title="This sentence has a debated syntactic or textual reading"
                      />
                    )}
                  </span>
                  <span className="greek gnt-text">{p.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
