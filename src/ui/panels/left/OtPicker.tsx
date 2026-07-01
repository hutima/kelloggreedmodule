import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import { OT_BOOKS, cacheOtChapter, loadOtChapter, combinePassage, type OtBook } from '@/io';
import type { KrDocument } from '@/domain/schema';
import { loadPatch } from '@/persistence';
import { applyPatch } from '@/domain/patch';
import { getIssuesForPassage } from '@/domain/contested';

/** The OT book whose name a passage/sentence title begins with, if any. */
function otBookForTitle(title: string): OtBook | undefined {
  return OT_BOOKS.find((b) => title.startsWith(b.name));
}
/** "Genesis 1:1" → 1 (the chapter), if present. */
function chapterForTitle(title: string): number | undefined {
  const m = title.match(/(\d+):\d+/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Hebrew Bible (Old Testament) passage picker. Pick a book and chapter, load it,
 * tick any number of sentences, and Open diagrams them all together as one
 * passage — the published WLC gold-standard parse, rendered right-to-left. The
 * sentence list doubles as the running Hebrew text with verse references.
 *
 * Mirrors GntPicker; macula-hebrew ships one file per CHAPTER, so this adds a
 * chapter selector. Nothing is bundled — chapters download on first use and the
 * service worker caches them (Save offline keeps one for later).
 */
export function OtPicker() {
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const setMode = useEditorStore((s) => s.setMode);
  const setGntContext = useEditorStore((s) => s.setGntContext);
  const setLeftCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  const setMultiSentenceContested = useEditorStore((s) => s.setMultiSentenceContested);
  const doc = useEditorStore((s) => s.doc);
  // Seed from the CURRENT Hebrew passage so the Book/Chapter reflect what's open
  // instead of always resetting to Genesis 1.
  const openBook = doc.language === 'hbo' ? otBookForTitle(doc.title) : undefined;
  const openChap = doc.language === 'hbo' ? chapterForTitle(doc.title) : undefined;
  const [bookNum, setBookNum] = useState(openBook?.num ?? 1); // Genesis
  const [chapter, setChapter] = useState(openChap ?? 1);
  const [passages, setPassages] = useState<KrDocument[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheState, setCacheState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Follow the OPEN document's book/chapter — a returning visit restores the
  // passage asynchronously, after this panel first mounted on the placeholder
  // doc, so the initial seed can miss it (the white-screen Genesis 1 default).
  const lastSyncedDocId = useRef(doc.id);
  useEffect(() => {
    if (doc.id === lastSyncedDocId.current) return;
    lastSyncedDocId.current = doc.id;
    if (doc.language !== 'hbo') return; // a non-OT doc doesn't drive the OT picker
    const b = otBookForTitle(doc.title);
    const c = chapterForTitle(doc.title);
    if (b && (b.num !== bookNum || (c != null && c !== chapter))) {
      setBookNum(b.num);
      if (c != null) setChapter(c);
      setPassages(null); // the loaded list was for the old book/chapter
      setChecked(new Set());
      setCacheState('idle');
    }
  }, [doc.id, doc.language, doc.title, bookNum, chapter]);

  const book = OT_BOOKS.find((b) => b.num === bookNum)!;

  const loadChapter = async (b: OtBook, ch: number) => {
    setLoading(true);
    setError(null);
    setPassages(null);
    setChecked(new Set());
    setCacheState('idle');
    try {
      setPassages(await loadOtChapter(b, ch));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load the sentence list whenever the book or chapter changes — mirrors
  // GntPicker, where the manual Load button is redundant. A list seeded from the
  // open passage skips the first fetch (the ref starts matched), and the loader/
  // service worker cache the rest.
  const lastLoaded = useRef<string>(passages ? `${bookNum}:${chapter}` : '');
  useEffect(() => {
    const key = `${bookNum}:${chapter}`;
    if (lastLoaded.current === key) return;
    lastLoaded.current = key;
    void loadChapter(book, chapter);
    // loadChapter closes over the current book; re-run only on book/chapter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookNum, chapter]);

  const saveOffline = async (b: OtBook, ch: number) => {
    setCacheState('saving');
    setCacheState((await cacheOtChapter(b, ch)) ? 'saved' : 'error');
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
    // of silently reverting that sentence to its untouched base.
    const patched = selected.map((p) => {
      const patch = loadPatch(p.id);
      return patch ? applyPatch(p, patch) : p;
    });
    loadDocument(combinePassage(patched), { corpus: 'ot' });
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
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches) {
      setLeftCollapsed(true);
    }
  };

  /** "Genesis 1:1" → "1:1" for a compact list. */
  const verse = (title: string) => title.replace(/^.*?(\d+:\d+(?:[–-]\d+)?)\s*$/, '$1');

  return (
    <div className="gnt-picker">
      {/* Book + Chapter share the top row (Book wider for the full name); Load /
          Save offline drop to the row beneath so the names stay readable. */}
      <div className="row">
        <label className="field" style={{ flex: 2 }}>
          <span>Book</span>
          <select
            value={bookNum}
            onChange={(e) => {
              setBookNum(Number(e.target.value));
              setChapter(1);
              setCacheState('idle');
            }}
          >
            {OT_BOOKS.map((b) => (
              <option key={b.num} value={b.num} title={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span>Chapter</span>
          <select
            value={chapter}
            onChange={(e) => {
              setChapter(Number(e.target.value));
              setCacheState('idle');
            }}
          >
            {Array.from({ length: book.chapters }, (_, i) => i + 1).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        {loading && <span style={{ fontSize: 12, color: 'var(--ink-soft, #667)' }}>Loading…</span>}
        <button
          className="mini"
          disabled={cacheState === 'saving' || cacheState === 'saved'}
          title="Download this chapter for offline use"
          onClick={() => void saveOffline(book, chapter)}
        >
          {cacheState === 'saving' ? 'Saving…' : cacheState === 'saved' ? 'Saved ✓' : 'Save offline'}
        </button>
      </div>
      {cacheState === 'error' && (
        <p style={{ color: 'var(--danger)', fontSize: 12 }}>Couldn’t save offline.</p>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}

      {passages && (
        <div className="gnt-passages">
          <div className="gnt-actions">
            <label className="gnt-all">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              <span>
                {book.name} {chapter}: {passages.length} sentences
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
                  <span className="hebrew gnt-text">{p.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
