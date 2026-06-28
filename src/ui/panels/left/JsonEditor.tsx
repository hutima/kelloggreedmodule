import { useEffect, useState } from 'react';
import { useEditorStore } from '@/state';
import { exportJson, importJson } from '@/io';

/** Raw JSON view of the whole document with validated apply. */
export function JsonEditor() {
  const doc = useEditorStore((s) => s.doc);
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const [draft, setDraft] = useState(() => exportJson(doc));
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Keep the draft in sync when the document changes elsewhere (unless editing).
  useEffect(() => {
    if (!dirty) setDraft(exportJson(doc));
  }, [doc, dirty]);

  const apply = () => {
    const result = importJson(draft);
    if (!result.ok || !result.document) {
      setError(result.error ?? 'Unknown error');
      return;
    }
    // Preserve the current id so we update in place rather than forking.
    loadDocument({ ...result.document, id: doc.id });
    setError(null);
    setDirty(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <p className="hint">
        The full analysis as JSON. Edit and apply to replace the document
        (validated against the schema).
      </p>
      <textarea
        className="code"
        spellCheck={false}
        style={{ flex: 1, minHeight: 240 }}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
      />
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 12, margin: '8px 0 0' }}>{error}</p>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="mini accept" onClick={apply} disabled={!dirty}>
          Apply JSON
        </button>
        <button
          className="mini"
          onClick={() => {
            setDraft(exportJson(doc));
            setDirty(false);
            setError(null);
          }}
        >
          Revert
        </button>
      </div>
    </div>
  );
}
