import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import { exportJson, importJson } from '@/io';

/** Raw JSON view of the whole document with validated apply. */
export function JsonEditor() {
  const doc = useEditorStore((s) => s.doc);
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const [draft, setDraft] = useState(() => exportJson(doc));
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Keep the draft in sync when the document changes elsewhere (unless editing).
  useEffect(() => {
    if (!dirty) setDraft(exportJson(doc));
  }, [doc, dirty]);

  /** Validate `text` and load it, returning an error message or null. */
  const load = (text: string): string | null => {
    const result = importJson(text);
    if (!result.ok || !result.document) return result.error ?? 'Unknown error';
    // Preserve the current id so we update in place rather than forking.
    loadDocument({ ...result.document, id: doc.id });
    return null;
  };

  const apply = () => {
    const err = load(draft);
    setError(err);
    if (!err) setDirty(false);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      setError(`Could not read file: ${(e as Error).message}`);
      return;
    }
    setDraft(text);
    const err = load(text);
    setError(err);
    setDirty(Boolean(err)); // keep the failed text editable; clear dirty on success
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <p className="hint">
        The full analysis as JSON. Edit and apply, or upload a <code>.json</code>
        file, to replace the document (validated against the schema).
      </p>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          void onFile(e.target.files?.[0] ?? undefined);
          // Reset so selecting the same file again re-triggers onChange.
          e.target.value = '';
        }}
      />
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
        <button className="mini" onClick={() => fileInput.current?.click()}>
          Upload .json
        </button>
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
