import { useState } from 'react';
import { useEditorStore } from '@/state';
import { GNT_BOOKS, BUNDLED_BOOKS, cacheGntBook, loadGntBook, combinePassage, type GntBook } from '@/io';
import type { KrDocument } from '@/domain/schema';

/**
 * Greek New Testament passage picker. Load a book, tick any number of sentences,
 * and Open diagrams them all together as one passage (the published gold-standard
 * parse, ready to edit). The sentence list doubles as the running Greek text with
 * verse references.
 */
export function GntPicker() {
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const setMode = useEditorStore((s) => s.setMode);
  const setGntContext = useEditorStore((s) => s.setGntContext);
  const setLeftCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  const [bookNum, setBookNum] = useState(11); // Philippians (bundled)
  const [passages, setPassages] = useState<KrDocument[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheState, setCacheState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const book = GNT_BOOKS.find((b) => b.num === bookNum)!;
  const bundled = BUNDLED_BOOKS.has(book.num);

  const loadBook = async (b: GntBook) => {
    setLoading(true);
    setError(null);
    setPassages(null);
    setChecked(new Set());
    setCacheState('idle');
    try {
      setPassages(await loadGntBook(b));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveOffline = async (b: GntBook) => {
    setCacheState('saving');
    setCacheState((await cacheGntBook(b)) ? 'saved' : 'error');
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
    loadDocument(combinePassage(selected));
    // Reading context for prev/next nav: the book's sentences + the first opened.
    const firstIdx = passages.findIndex((p) => checked.has(p.id));
    setGntContext(passages, firstIdx);
    setMode('parsed');
    // On a narrow screen, collapse the picker so the text + diagram get the room.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches) {
      setLeftCollapsed(true);
    }
  };

  /** "Philippians 1:1" → "1:1" for a compact list. */
  const verse = (title: string) => title.replace(/^.*?(\d+:\d+(?:[–-]\d+)?)\s*$/, '$1');

  return (
    <div className="gnt-picker">
      <div className="row">
        <label className="field" style={{ flex: 1 }}>
          <span>Book</span>
          <select
            value={bookNum}
            onChange={(e) => {
              setBookNum(Number(e.target.value));
              setCacheState('idle');
            }}
          >
            {GNT_BOOKS.map((b) => (
              <option key={b.num} value={b.num} title={b.name}>
                {b.num}. {b.abbr}
                {BUNDLED_BOOKS.has(b.num) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="mini accept" style={{ alignSelf: 'flex-end' }} disabled={loading} onClick={() => void loadBook(book)}>
          {loading ? 'Loading…' : 'Load'}
        </button>
        <button
          className="mini"
          style={{ alignSelf: 'flex-end' }}
          disabled={bundled || cacheState === 'saving' || cacheState === 'saved'}
          title={bundled ? 'Bundled with the app' : 'Download this book for offline use'}
          onClick={() => void saveOffline(book)}
        >
          {bundled ? 'Bundled ✓' : cacheState === 'saving' ? 'Saving…' : cacheState === 'saved' ? 'Saved ✓' : 'Save offline'}
        </button>
      </div>
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
                  <span className="gnt-ref">{verse(p.title)}</span>
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
