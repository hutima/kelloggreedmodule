import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import { tokenize } from '@/domain/model';
import { buildLlmPrompt, importLlmDiagram, importJson, copyText, downloadText, slugify } from '@/io';
import { useViewport } from '@/ui/responsive';
import { Modal } from '@/ui/components/common/Modal';
import type { KrDocument, Language } from '@/domain/schema';

/** Parse pasted/loaded text as either the compact LLM format or a full KrDocument. */
function parseDiagram(raw: string): { ok: boolean; document?: KrDocument; error?: string } {
  const llm = importLlmDiagram(raw);
  if (llm.ok) return llm;
  const full = importJson(raw);
  if (full.ok) return full;
  // Surface the friendlier of the two messages (LLM-format parse first).
  return { ok: false, error: llm.error ?? full.error ?? 'Could not read that diagram.' };
}

/**
 * "New" source — a free-text typing window instead of a passage list. Type (or
 * paste) a sentence and Create a starter diagram: it is tokenized and run through
 * the inference engine so a rough, fully-editable parse is populated for you.
 *
 * For a fuller parse, Export builds a prompt + tokenized sentence to paste into an
 * LLM (Claude / ChatGPT); Import ingests the JSON the LLM returns and turns it
 * into a diagram. The ⓘ button explains the round-trip.
 */
export function NewSourcePicker() {
  const createFromText = useEditorStore((s) => s.createFromText);
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const setAppMode = useEditorStore((s) => s.setAppMode);
  const setLeftCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  const customParses = useEditorStore((s) => s.customParses);
  const saveCurrentAsCustom = useEditorStore((s) => s.saveCurrentAsCustom);
  const openCustomParse = useEditorStore((s) => s.openCustomParse);
  const removeCustomParse = useEditorStore((s) => s.removeCustomParse);
  const isCustomDoc = useEditorStore((s) => s.corpus === 'custom' && s.baseDoc === null);
  const docId = useEditorStore((s) => s.doc.id);
  const vp = useViewport();

  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [docId]); // a different doc hasn't been saved yet
  const saveCurrent = () => {
    saveCurrentAsCustom();
    setSaved(true);
  };

  const [text, setText] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [promptText, setPromptText] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const ready = text.trim().length > 0;

  /** On a narrow screen, free the room for the diagram once a doc is loaded. */
  const collapseIfNarrow = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches) {
      setLeftCollapsed(true);
    }
  };

  const create = () => {
    if (!ready) return;
    createFromText(text.trim(), language);
    if (vp.isDesktop) setAppMode('edit');
    collapseIfNarrow();
  };

  const exportForLlm = () => {
    if (!ready) return;
    const tokens = tokenize(text.trim(), language);
    setPromptText(buildLlmPrompt(text.trim(), tokens, language));
  };

  /** Load a parsed diagram document as a new custom document. */
  const acceptDocument = (document: KrDocument) => {
    loadDocument(document, { corpus: 'custom' });
    if (vp.isDesktop) setAppMode('edit');
    collapseIfNarrow();
  };

  return (
    <div className="gnt-picker new-picker">
      <label className="field">
        <span>Language</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
          <option value="en">English</option>
          <option value="grc">Greek (Koine)</option>
        </select>
      </label>

      <label className="field">
        <span>Sentence</span>
        <textarea
          className="new-text"
          rows={4}
          value={text}
          placeholder="Type or paste a sentence to diagram…"
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      <div className="row">
        <button className="mini accept" disabled={!ready} onClick={create}>
          Create diagram
        </button>
        {isCustomDoc && (
          <button className="mini" title="Save this diagram to your sentences" onClick={saveCurrent}>
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        )}
      </div>

      <div className="row new-actions">
        <button className="mini" disabled={!ready} title="Build a prompt for an LLM" onClick={exportForLlm}>
          Export
        </button>
        <button className="mini" title="Paste or load an LLM / exported diagram" onClick={() => setImportOpen(true)}>
          Import
        </button>
        <button
          className="mini info-btn"
          aria-label="About LLM-assisted diagramming"
          title="About LLM-assisted diagramming"
          onClick={() => setInfoOpen(true)}
        >
          ⓘ
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--muted, #667)' }}>
        A general diagramming workspace: Create auto-tags a rough starter you edit by hand
        (auto-tagging is approximate — expect to correct it). For a fuller first pass, Export → an
        LLM → Import. The ⓘ explains how.
      </p>

      {customParses.length > 0 && (
        <div className="gnt-passages">
          <div className="gnt-actions">
            <span className="gnt-all">
              <span>My sentences: {customParses.length}</span>
            </span>
          </div>
          <ul className="gnt-list">
            {customParses.map((c) => (
              <li key={c.id}>
                <label className={`gnt-sentence${c.id === docId ? ' checked' : ''}`}>
                  <button
                    type="button"
                    className="link-btn custom-open"
                    title="Open this saved sentence"
                    onClick={() => openCustomParse(c.id)}
                  >
                    {c.title || c.preview || 'Untitled'}
                  </button>
                  <button
                    type="button"
                    className="mini reject custom-del"
                    title="Delete this saved sentence"
                    aria-label={`Delete ${c.title}`}
                    onClick={() => {
                      if (
                        typeof window === 'undefined' ||
                        window.confirm('Delete this saved sentence?')
                      ) {
                        removeCustomParse(c.id);
                      }
                    }}
                  >
                    ✕
                  </button>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {promptText !== null && (
        <LlmExportModal text={promptText} title={text} onClose={() => setPromptText(null)} />
      )}
      {infoOpen && <LlmWorkflowModal onClose={() => setInfoOpen(false)} />}
      {importOpen && (
        <ImportDiagramModal
          onClose={() => setImportOpen(false)}
          onImport={(doc) => {
            acceptDocument(doc);
            setImportOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Paste JSON (or load a .json file) and confirm to import a diagram. */
function ImportDiagramModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (doc: KrDocument) => void;
}) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const confirm = () => {
    const res = parseDiagram(raw);
    if (!res.ok || !res.document) {
      setError(res.error ?? 'Could not read that diagram.');
      return;
    }
    onImport(res.document);
  };

  const loadFile = async (file: File) => {
    setError(null);
    setRaw(await file.text());
  };

  return (
    <Modal
      title="Import a diagram"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Choose .json file…
          </button>
          <button className="btn primary" disabled={!raw.trim()} onClick={confirm}>
            Import
          </button>
        </>
      }
    >
      <p>
        Paste the JSON an LLM returned (the compact <code>scripture-diagrammer/diagram</code> format)
        or a full exported diagram — or load it from a file. Then press <strong>Import</strong>.
      </p>
      <textarea
        className="new-text"
        rows={14}
        value={raw}
        placeholder='{ "kind": "scripture-diagrammer/diagram", … }'
        onChange={(e) => {
          setRaw(e.target.value);
          setError(null);
        }}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
      />
      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = '';
        }}
      />
    </Modal>
  );
}

/** Shows the generated LLM prompt with Copy / Download. */
function LlmExportModal({ text, title, onClose }: { text: string; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    setCopied(await copyText(text));
  };
  const download = () => downloadText(text, `${slugify(title || 'sentence')}-llm-prompt.txt`, 'text/plain');
  return (
    <Modal
      title="Export for an LLM"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={download}>
            Download .txt
          </button>
          <button className="btn primary" onClick={() => void copy()}>
            {copied ? 'Copied ✓' : 'Copy prompt'}
          </button>
        </>
      }
    >
      <p>
        Copy this prompt into Claude or ChatGPT. It returns a JSON diagram you can bring back with
        <strong> Import</strong>.
      </p>
      <textarea className="new-text" readOnly rows={14} value={text} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
    </Modal>
  );
}

/** Explains the LLM-assisted round-trip. */
function LlmWorkflowModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="LLM-assisted diagramming"
      onClose={onClose}
      wide
      className="help-modal"
      footer={
        <button className="btn primary" onClick={onClose}>
          Got it
        </button>
      }
    >
      <p>
        A large language model (such as Claude or ChatGPT) can parse a sentence into a syntax
        diagram for you. The round-trip is:
      </p>
      <ol>
        <li>Type your sentence and press <strong>Export</strong>.</li>
        <li>
          <strong>Copy</strong> the prompt and paste it into the LLM. The prompt already contains
          the sentence, the tokens to reference, the exact output format, and the allowed
          grammatical labels.
        </li>
        <li>The model replies with one JSON object. Save it as a <code>.json</code> file (or paste it into one).</li>
        <li>
          Press <strong>Import</strong> and choose that file. The diagram loads as a new document,
          ready to refine by hand.
        </li>
      </ol>
      <p style={{ color: 'var(--muted, #667)' }}>
        Prefer to stay offline? <strong>Create diagram</strong> auto-tags a starter parse with the
        built-in inference engine — no model required — which you can then edit directly.
      </p>
      <p style={{ color: 'var(--muted, #667)', fontSize: 12 }}>
        Note: an LLM can make mistakes. Always check the imported diagram against the grammar
        yourself; nothing is sent anywhere automatically — you control the copy and paste.
      </p>
    </Modal>
  );
}
