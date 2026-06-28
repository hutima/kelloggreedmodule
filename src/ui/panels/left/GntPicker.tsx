import { useState } from 'react';
import { useEditorStore } from '@/state';
import { GNT_BOOKS, loadGntBook, type GntBook } from '@/io';
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
  const [bookNum, setBookNum] = useState(11); // Philippians (bundled)
  const [passages, setPassages] = useState<KrDocument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const book = GNT_BOOKS.find((b) => b.num === bookNum)!;

  const open = async (b: GntBook) => {
    setLoading(true);
    setError(null);
    setPassages(null);
    try {
      setPassages(await loadGntBook(b));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadGold = (doc: KrDocument) => {
    loadDocument(doc);
    setMode('parsed');
  };

  const loadGuided = (doc: KrDocument) => {
    loadDocument(toGuided(doc));
    setMode('assisted'); // runs the inference engine
  };

  return (
    <div className="gnt-picker">
      <p className="hint">
        Open a Greek New Testament passage. <strong>Gold-standard</strong> shows
        the published syntax tree; <strong>Guided</strong> lets you build the
        parse with assisted inferences. Books download on first use and are then
        available offline.
      </p>
      <div className="row">
        <label className="field" style={{ flex: 1 }}>
          <span>Book</span>
          <select value={bookNum} onChange={(e) => setBookNum(Number(e.target.value))}>
            {GNT_BOOKS.map((b) => (
              <option key={b.num} value={b.num}>
                {b.num}. {b.name}
              </option>
            ))}
          </select>
        </label>
        <button className="mini accept" style={{ alignSelf: 'flex-end' }} disabled={loading} onClick={() => void open(book)}>
          {loading ? 'Loading…' : 'Open'}
        </button>
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
