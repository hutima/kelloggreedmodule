import { useState } from 'react';
import { useEditorStore } from '@/state';
import { OT_BOOKS, cacheOtChapter, loadOtChapter, combinePassage, type OtBook } from '@/io';
import type { KrDocument } from '@/domain/schema';

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
  const [bookNum, setBookNum] = useState(1); // Genesis
  const [chapter, setChapter] = useState(1);
  const [passages, setPassages] = useState<KrDocument[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheState, setCacheState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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
    loadDocument(combinePassage(selected), { corpus: 'ot' });
    const firstIdx = passages.findIndex((p) => checked.has(p.id));
    setGntContext(passages, firstIdx);
    setMode('parsed');
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches) {
      setLeftCollapsed(true);
    }
  };

  /** "Genesis 1:1" → "1:1" for a compact list. */
  const verse = (title: string) => title.replace(/^.*?(\d+:\d+(?:[–-]\d+)?)\s*$/, '$1');

  return (
    <div className="gnt-picker">
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
                {b.num}. {b.name}
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
        <button
          className="mini accept"
          style={{ alignSelf: 'flex-end' }}
          disabled={loading}
          onClick={() => void loadChapter(book, chapter)}
        >
          {loading ? 'Loading…' : 'Load'}
        </button>
        <button
          className="mini"
          style={{ alignSelf: 'flex-end' }}
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
                  <span className="gnt-ref">{verse(p.title)}</span>
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
