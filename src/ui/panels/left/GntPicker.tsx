import { useState } from 'react';
import { useEditorStore } from '@/state';
import { GNT_BOOKS, BUNDLED_BOOKS, cacheGntBook, loadGntBook, type GntBook } from '@/io';
import type { KrDocument } from '@/domain/schema';

/**
 * Open a Greek New Testament passage in one of two modes:
 *  - Gold-standard: the published Nestle1904 Lowfat parse, rendered as-is.
 *  - Guided: the same text with only tokens + morphology kept, then the
 *    inference engine proposes a parse (ambiguous links shown in the
 *    ambiguity colour) for you to confirm and relink.
 */
export function GntPicker() {
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const setMode = useEditorStore((s) => s.setMode);
  const bootstrapParse = useEditorStore((s) => s.bootstrapParse);
  const [bookNum, setBookNum] = useState(11); // Philippians (bundled)
  const [passages, setPassages] = useState<KrDocument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheState, setCacheState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const book = GNT_BOOKS.find((b) => b.num === bookNum)!;
  const bundled = BUNDLED_BOOKS.has(book.num);

  const open = async (b: GntBook) => {
    setLoading(true);
    setError(null);
    setPassages(null);
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

  const loadGold = (doc: KrDocument) => {
    loadDocument(doc);
    setMode('parsed');
  };

  const loadGuided = (doc: KrDocument) => {
    loadDocument(toGuided(doc));
    setMode('assisted');
    // Seed a rough parse from the inference engine so the diagram is populated
    // and editable straight away, instead of an empty baseline.
    bootstrapParse();
  };

  return (
    <div className="gnt-picker">
      <p className="hint">
        Open a Greek New Testament passage. <strong>Gold-standard</strong> shows
        the published syntax tree; <strong>Guided</strong> seeds a rough,
        editable parse from the inference engine — tap a tentative (coloured)
        link to relink it. Only Philippians ships with the app;
        other books download on first use — tap <strong>Save offline</strong> to
        keep one for later.
      </p>
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
              <option key={b.num} value={b.num}>
                {b.num}. {b.name}
                {BUNDLED_BOOKS.has(b.num) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="mini accept" style={{ alignSelf: 'flex-end' }} disabled={loading} onClick={() => void open(book)}>
          {loading ? 'Loading…' : 'Open'}
        </button>
      </div>
      <div className="row" style={{ marginTop: 2 }}>
        <button
          className="mini"
          disabled={bundled || cacheState === 'saving' || cacheState === 'saved'}
          title={bundled ? 'Bundled with the app' : 'Download this book for offline use'}
          onClick={() => void saveOffline(book)}
        >
          {bundled
            ? 'Bundled ✓'
            : cacheState === 'saving'
              ? 'Saving…'
              : cacheState === 'saved'
                ? 'Saved offline ✓'
                : 'Save offline'}
        </button>
        {cacheState === 'error' && (
          <span style={{ color: 'var(--danger)', fontSize: 12, alignSelf: 'center' }}>Couldn’t save</span>
        )}
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
      {passages && (
        <div className="gnt-passages">
          <p className="hint" style={{ margin: '4px 0' }}>
            {book.name}: {passages.length} sentences
          </p>
          <ul>
            {passages.map((p) => (
              <li key={p.id}>
                <span className="greek gnt-ref">{p.title}</span>
                <span className="row">
                  <button className="mini" onClick={() => loadGold(p)}>
                    Gold
                  </button>
                  <button className="mini" onClick={() => loadGuided(p)}>
                    Guided
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Strip the analysis, keeping tokens (with morphology), for a guided parse. */
function toGuided(doc: KrDocument): KrDocument {
  const rootId = 'n_root';
  return {
    ...doc,
    id: `${doc.id}_guided`,
    notes: 'Guided parse — review the inference engine’s suggestions and relink as needed.',
    layoutHints: {},
    syntax: {
      rootId,
      nodes: [{ id: rootId, kind: 'clause', clauseType: 'independent', tokenIds: [] }],
      relations: [],
    },
  };
}
